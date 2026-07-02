'use client';

import { useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { filterImageFiles, type ImageItem } from '@/lib/stamp-settings';

// webkitdirectory isn't in React's input attribute types
const dirAttrs = { webkitdirectory: '', directory: '' } as unknown as Record<
  string,
  string
>;

interface FilmstripProps {
  items: ImageItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (files: File[]) => void;
}

export function Filmstrip({ items, selectedId, onSelect, onAdd }: FilmstripProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = filterImageFiles(e.target.files ?? []);
    if (files.length) onAdd(files);
    e.target.value = '';
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">
          {items.length} <span className="text-muted-foreground">张</span>
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => folderRef.current?.click()}
          >
            <FolderOpen className="size-4" />
            选择文件夹
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" />
            添加图片
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-wrap gap-2 p-3">
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  'group relative flex w-28 shrink-0 flex-col gap-1.5 rounded-md border p-1.5 text-left transition-colors',
                  selected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-accent',
                )}
              >
                <div className="relative aspect-square overflow-hidden rounded bg-muted">
                  <img
                    src={item.url}
                    alt={item.file.name}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-xs font-medium">{item.file.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {item.meta?.width
                      ? `${item.meta.width}×${item.meta.height}`
                      : item.meta?.error ?? '加载中…'}
                  </p>
                  {item.meta?.stampDate && (
                    <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                      {item.meta.stampDate}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/tiff,.jpg,.jpeg,.png,.webp,.tif,.tiff"
        hidden
        onChange={handlePick}
      />
      <input ref={folderRef} type="file" multiple hidden onChange={handlePick} {...dirAttrs} />
    </div>
  );
}
