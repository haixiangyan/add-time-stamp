// Batch export orchestration that stays memory-bounded for very large jobs
// (thousands of photos). Two things keep memory flat:
//   1. Bounded concurrency — at most `concurrency` stamped blobs are alive at
//      once (each is written out and released before the next is rendered),
//      instead of Promise.all holding every result.
//   2. A streaming sink — on Chromium we write each file straight into a folder
//      the user picks (File System Access API), so nothing accumulates. Where
//      that API is missing (Safari/Firefox) we fall back to zip(s), chunked for
//      large counts so a single in-memory archive never gets huge.

import { zip } from 'fflate';

/** Above this count we prefer streaming to a picked folder over a single zip. */
const STREAM_THRESHOLD = 200;
/** Max files per zip in the no-folder-API fallback, to cap archive memory. */
const ZIP_CHUNK = 200;

export interface ExportTask {
  name: string;
  /** Produce the stamped bytes, or null to skip (e.g. no resolvable date). */
  render: () => Promise<Blob | null>;
}

export interface ExportSummary {
  written: number;
  skipped: number;
  mode: 'folder' | 'zip';
}

interface RunOpts {
  concurrency: number;
  onProgress: (done: number, total: number) => void;
}

// --- File System Access typing (kept minimal so we don't depend on lib version) ---
interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface FileHandleLike {
  createWritable(): Promise<WritableLike>;
}
interface DirHandleLike {
  getFileHandle(name: string, opts: { create: boolean }): Promise<FileHandleLike>;
}
type PickerWindow = Window & {
  showDirectoryPicker?: (opts?: { mode?: string }) => Promise<DirHandleLike>;
};

export function supportsFolderExport(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Run a bounded number of async tasks in parallel, preserving no order. */
async function runBounded<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const idx = next++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

function makeDeduper() {
  const used = new Set<string>();
  return (name: string): string => {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let n = 1;
    let candidate = `${base}-${n}${ext}`;
    while (used.has(candidate)) candidate = `${base}-${++n}${ext}`;
    used.add(candidate);
    return candidate;
  };
}

function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function zipEntries(entries: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    zip(entries, { level: 0 }, (err, out) => (err ? reject(err) : resolve(out))),
  );
}

/** Stream every rendered file into a user-picked folder. Constant memory. */
async function exportToFolder(tasks: ExportTask[], { concurrency, onProgress }: RunOpts): Promise<ExportSummary> {
  const dir = await (window as PickerWindow).showDirectoryPicker!({ mode: 'readwrite' });
  const unique = makeDeduper();
  let written = 0;
  let skipped = 0;
  let done = 0;
  await runBounded(tasks, concurrency, async (task) => {
    const blob = await task.render();
    if (blob) {
      const handle = await dir.getFileHandle(unique(task.name), { create: true });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      written++;
    } else {
      skipped++;
    }
    onProgress(++done, tasks.length);
  });
  return { written, skipped, mode: 'folder' };
}

/** Render `tasks` with bounded concurrency into `entries`; returns skip count. */
async function renderInto(
  tasks: ExportTask[],
  entries: Record<string, Uint8Array>,
  unique: (n: string) => string,
  concurrency: number,
  onEach: () => void,
): Promise<number> {
  let skipped = 0;
  await runBounded(tasks, concurrency, async (task) => {
    const blob = await task.render();
    if (blob) entries[unique(task.name)] = new Uint8Array(await blob.arrayBuffer());
    else skipped++;
    onEach();
  });
  return skipped;
}

/** Zip fallback: one archive for small jobs, multiple chunked archives for large. */
async function exportToZip(tasks: ExportTask[], { concurrency, onProgress }: RunOpts): Promise<ExportSummary> {
  const unique = makeDeduper();
  let written = 0;
  let skipped = 0;
  let done = 0;
  const tick = () => onProgress(++done, tasks.length);

  if (tasks.length <= ZIP_CHUNK) {
    const entries: Record<string, Uint8Array> = {};
    skipped = await renderInto(tasks, entries, unique, concurrency, tick);
    written = Object.keys(entries).length;
    if (written) downloadBlob(new Blob([(await zipEntries(entries)) as BlobPart], { type: 'application/zip' }), 'time-stamp-export.zip');
    return { written, skipped, mode: 'zip' };
  }

  // Large count without the folder API: emit sequential chunk archives so only
  // one chunk's worth of bytes is ever held in memory.
  const chunks = Math.ceil(tasks.length / ZIP_CHUNK);
  for (let c = 0; c < chunks; c++) {
    const slice = tasks.slice(c * ZIP_CHUNK, (c + 1) * ZIP_CHUNK);
    const entries: Record<string, Uint8Array> = {};
    skipped += await renderInto(slice, entries, unique, concurrency, tick);
    const n = Object.keys(entries).length;
    written += n;
    if (n) downloadBlob(new Blob([(await zipEntries(entries)) as BlobPart], { type: 'application/zip' }), `time-stamp-export-${c + 1}.zip`);
  }
  return { written, skipped, mode: 'zip' };
}

export async function runExport(tasks: ExportTask[], opts: RunOpts): Promise<ExportSummary> {
  if (tasks.length > STREAM_THRESHOLD && supportsFolderExport()) {
    return exportToFolder(tasks, opts);
  }
  return exportToZip(tasks, opts);
}
