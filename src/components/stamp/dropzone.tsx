'use client';

import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ImagePlus, FolderOpen, Loader2 } from 'lucide-react';
import { filterImageFiles } from '@/lib/stamp-settings';

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  loading?: boolean;
}

// webkitdirectory isn't in React's input attribute types
const dirAttrs = { webkitdirectory: '', directory: '' } as unknown as Record<
  string,
  string
>;

// Minimal shape of the non-standard FileSystemEntry API used for folder drops.
interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  file?: (cb: (f: File) => void, err?: () => void) => void;
  createReader?: () => {
    readEntries: (cb: (entries: FsEntry[]) => void, err?: () => void) => void;
  };
}

// Recursively collect every file inside a dropped entry (file or folder).
async function readEntry(entry: FsEntry): Promise<File[]> {
  if (entry.isFile && entry.file) {
    return new Promise((resolve) =>
      entry.file!((f) => resolve([f]), () => resolve([])),
    );
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const readBatch = () =>
      new Promise<FsEntry[]>((resolve) =>
        reader.readEntries((e) => resolve(e), () => resolve([])),
      );
    const out: File[] = [];
    // readEntries returns at most 100 entries per call — loop until empty.
    let batch = await readBatch();
    while (batch.length) {
      for (const e of batch) out.push(...(await readEntry(e)));
      batch = await readBatch();
    }
    return out;
  }
  return [];
}

// Pull files out of a drop, descending into any dropped folders when the
// browser supports the FileSystemEntry API (Chrome/Edge/Safari/Firefox all do).
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries: FsEntry[] = [];
  if (dt.items && dt.items.length) {
    for (const item of Array.from(dt.items)) {
      const getEntry = (
        item as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }
      ).webkitGetAsEntry;
      const entry = getEntry ? getEntry.call(item) : null;
      if (entry) entries.push(entry);
    }
  }
  if (!entries.length) return Array.from(dt.files); // no entry API — plain files
  const nested = await Promise.all(entries.map(readEntry));
  return nested.flat();
}

// A single click on a file input can only be one mode — multi-file OR folder —
// so we expose two clearly-differentiated buttons. Drag-drop (handled by the
// page over the whole editor) accepts both images and folders at once.
export function Dropzone({ onFiles, loading }: DropzoneProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = filterImageFiles(e.target.files ?? []);
    if (files.length) onFiles(files);
    e.target.value = '';
  };

  return (
    <>
      <Button
        size="sm"
        disabled={loading}
        onClick={() => fileRef.current?.click()}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        添加图片
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => folderRef.current?.click()}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
        {loading ? '导入中…' : '选择文件夹'}
      </Button>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/tiff,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.heif"
        hidden
        onChange={handlePick}
      />
      <input ref={folderRef} type="file" multiple hidden onChange={handlePick} {...dirAttrs} />
    </>
  );
}
