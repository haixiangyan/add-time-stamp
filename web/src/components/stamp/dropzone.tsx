'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Upload, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  compact?: boolean;
}

export function Dropzone({ onFiles, compact }: DropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) => /\.(jpe?g|png|webp|tiff?)$/i.test(f.name) || /^image\//.test(f.type),
      );
      if (files.length) onFiles(files);
    },
    [onFiles],
  );

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onFiles(files);
    e.target.value = '';
  };

  if (compact) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className={cn(dragging && 'border-primary')}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <Upload className="size-4" />
          添加图片
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/tiff,.jpg,.jpeg,.png,.webp,.tif,.tiff"
          hidden
          onChange={handlePick}
        />
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
        <p className="text-base font-medium">拖拽图片到此处</p>
        <p className="text-sm text-muted-foreground">
          或{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-primary underline-offset-4 hover:underline"
          >
            选择文件
          </button>
        </p>
        <p className="text-xs text-muted-foreground">支持 JPG / PNG / WebP / TIFF，可多选</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/tiff,.jpg,.jpeg,.png,.webp,.tif,.tiff"
        hidden
        onChange={handlePick}
      />
    </Card>
  );
}
