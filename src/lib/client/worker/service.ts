// Single entry point the UI uses for the heavy work. Prefers a Web Worker pool;
// transparently falls back to running on the main thread where workers or
// OffscreenCanvas aren't available (e.g. older Safari), so callers don't branch.

import type { ImageMeta } from '@/lib/stamp-settings';
import type { StampRenderOpts, StampRenderResult } from '../render';
import { WorkerPool } from './pool';

export interface MetaResult {
  meta: ImageMeta;
  thumb: Blob | null;
}

function supportsWorkerPipeline(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap !== 'undefined'
  );
}

// Leave a core for the UI; cap the pool so a batch of large photos doesn't
// blow up memory (each worker holds a full-res decode + encode at once).
function poolSize(): number {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  return Math.max(1, Math.min(cores - 1, 4));
}

let pool: WorkerPool | null = null;
let useWorker: boolean | null = null;

function ensurePool(): WorkerPool | null {
  if (useWorker === null) useWorker = supportsWorkerPipeline();
  if (!useWorker) return null;
  if (!pool) {
    try {
      pool = new WorkerPool(poolSize());
    } catch {
      // Bundler/runtime couldn't spin up the worker — degrade to main thread.
      useWorker = false;
      pool = null;
    }
  }
  return pool;
}

export async function readMeta(file: File, thumbMaxEdge: number): Promise<MetaResult> {
  const p = ensurePool();
  if (p) {
    const res = await p.meta(file, thumbMaxEdge);
    return { meta: res.meta, thumb: res.thumb };
  }
  // Main-thread fallback.
  const { readImageMeta } = await import('../metadata');
  const { isHeif, heifThumbnailBlob } = await import('../heif');
  let thumb: Blob | null = null;
  if (isHeif(file)) {
    try {
      thumb = await heifThumbnailBlob(file, thumbMaxEdge);
    } catch {
      /* thumbnail is best-effort */
    }
  }
  const meta = await readImageMeta(file);
  return { meta, thumb };
}

/** How to date a stamp: an explicit `label`, or a source the worker resolves. */
export interface StampDate {
  label?: string | null;
  dateSource?: string;
  customDate?: string;
}

/** Render a stamped image. Returns null when no date could be resolved (skipped). */
export async function renderStamp(
  file: File,
  date: StampDate,
  opts: StampRenderOpts,
): Promise<StampRenderResult | null> {
  const p = ensurePool();
  if (p) {
    const res = await p.stamp(
      file,
      { label: date.label ?? null, dateSource: date.dateSource, customDate: date.customDate },
      opts,
    );
    if (res.skipped || !res.blob) return null;
    return { blob: res.blob, fontSize: res.fontSize, font: res.font };
  }
  // Main-thread fallback: resolve the label here, mirroring the worker.
  let label = date.label ?? null;
  if (!label) {
    if (date.dateSource === 'custom') label = date.customDate || null;
    else {
      const { readImageMeta } = await import('../metadata');
      label = (await readImageMeta(file)).stampDate;
    }
  }
  if (!label) return null;
  const { stampImage } = await import('../render');
  return stampImage(file, label, opts);
}
