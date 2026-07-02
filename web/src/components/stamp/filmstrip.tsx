'use client';

import { useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ImageItem } from '@/lib/stamp-settings';

interface FilmstripProps {
  items: ImageItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (files: File[]) => void;
}

export function Filmstrip({ items, selectedId, onSelect, onAdd }: FilmstripProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onAdd(files);
    e.target.value = '';
  };

  return (
    <div
      className="flex-1 cursor-pointer rounded-md border border-dashed border-muted-foreground/25 transition-colors hover:border-primary/50 hover:bg-accent/30"
      onClick={() => inputRef.current?.click()}
    >
      <ScrollArea className="h-full w-full whitespace-nowrap">
        <div className="flex w-max gap-2 p-2">
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(item.id);
                }}
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            className="flex w-28 shrink-0 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-muted-foreground/30 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-6" />
            <span className="text-xs">添加图片</span>
          </button>
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
    </div>
  );
}
