'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Upload, ImageIcon, FolderOpen, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { filterImageFiles } from '@/lib/stamp-settings';

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  compact?: boolean;
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
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
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

export function Dropzone({ onFiles, compact, loading }: DropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const all = await filesFromDrop(e.dataTransfer);
      const files = filterImageFiles(all);
      if (files.length) onFiles(files);
    },
    [onFiles],
  );

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = filterImageFiles(e.target.files ?? []);
    if (files.length) onFiles(files);
    e.target.value = '';
  };

  const inputs = (
    <>
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

  if (compact) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => fileRef.current?.click()}
          className={cn(dragging && 'border-primary')}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
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
        {inputs}
      </>
    );
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label="选择图片或文件夹"
      onClick={() => fileRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileRef.current?.click();
        }
      }}
      className={cn(
        'relative flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed py-20 text-center transition-colors hover:border-muted-foreground/50',
        dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ImageIcon className="size-7" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium">点击、或拖拽图片 / 文件夹到此处</p>
        <p className="text-sm text-muted-foreground">
          支持整个文件夹导入，也可{' '}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              folderRef.current?.click();
            }}
            className="text-primary underline-offset-4 hover:underline"
          >
            选择文件夹
          </button>
        </p>
        <p className="text-xs text-muted-foreground">支持 JPG / PNG / WebP / TIFF / HEIC，可多选或整个文件夹导入</p>
      </div>
      {inputs}
    </Card>
  );
}
