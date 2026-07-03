'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FolderOpen, Loader2 } from 'lucide-react';
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
  loading?: boolean;
}

export function Filmstrip({ items, selectedId, onSelect, onAdd, loading }: FilmstripProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateMasks = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateMasks();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateMasks);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items, updateMasks]);

  // translate vertical wheel into horizontal scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  };

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = filterImageFiles(e.target.files ?? []);
    if (files.length) onAdd(files);
    e.target.value = '';
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {items.length} <span className="text-muted-foreground">张</span>
          {loading && (
            <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              导入中…
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => folderRef.current?.click()}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
            选择文件夹
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => inputRef.current?.click()}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            添加图片
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={updateMasks}
          onWheel={handleWheel}
          className="h-full overflow-x-auto overflow-y-hidden"
        >
        <div className="flex h-full gap-2 p-3">
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                title={item.file.name}
                onClick={() => onSelect(item.id)}
                className={cn(
                  'group relative h-full min-w-12 shrink-0 overflow-hidden rounded-md border bg-muted text-left transition-colors',
                  selected ? 'border-primary ring-2 ring-primary/40' : 'border-transparent hover:border-primary/40',
                )}
              >
                <img
                  src={item.url}
                  alt={item.file.name}
                  className="aspect-square h-full object-cover"
                  loading="lazy"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-2 pb-1.5 pt-4">
                  <p className="truncate text-[10px] font-medium text-white">{item.file.name}</p>
                  {item.meta?.stampDate ? (
                    <Badge variant="secondary" className="w-fit px-1 py-0 text-[10px]">
                      {item.meta.stampDate}
                    </Badge>
                  ) : (
                    <span className="truncate text-[10px] text-white/70">
                      {item.meta?.error ?? '加载中…'}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        </div>
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-card to-transparent transition-opacity',
            canScrollLeft ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-card to-transparent transition-opacity',
            canScrollRight ? 'opacity-100' : 'opacity-0',
          )}
        />
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/tiff,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.tif,.tiff,.heic,.heif"
        hidden
        onChange={handlePick}
      />
      <input ref={folderRef} type="file" multiple hidden onChange={handlePick} {...dirAttrs} />
    </div>
  );
}
