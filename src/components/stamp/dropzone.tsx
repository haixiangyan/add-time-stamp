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

export function Dropzone({ onFiles, compact, loading }: DropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = filterImageFiles(e.dataTransfer.files);
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
      className={cn(
        'relative flex flex-col items-center justify-center gap-3 border-2 border-dashed py-20 text-center transition-colors',
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
        <p className="text-base font-medium">拖拽图片或文件夹到此处</p>
        <p className="text-sm text-muted-foreground">
          或{' '}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-primary underline-offset-4 hover:underline"
          >
            选择文件
          </button>{' '}
          /{' '}
          <button
            type="button"
            onClick={() => folderRef.current?.click()}
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
