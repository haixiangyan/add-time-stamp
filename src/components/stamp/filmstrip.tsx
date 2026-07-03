'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ImageItem } from '@/lib/stamp-settings';

interface ThumbnailProps {
  item: ImageItem;
  selected: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

function Thumbnail({ item, selected, onSelect, onRemove }: ThumbnailProps) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
  }, [item.url]);

  return (
    <button
      type="button"
      title={item.file.name}
      onClick={() => onSelect(item.id)}
      className={cn(
        'group relative h-full min-w-12 shrink-0 overflow-hidden rounded-md border bg-muted text-left transition-colors',
        selected ? 'border-primary ring-2 ring-primary/40' : 'border-transparent hover:border-primary/40',
      )}
    >
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <img
        src={item.url}
        alt={item.file.name}
        className={cn('aspect-square h-full object-cover', !loaded && 'opacity-0')}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(false)}
      />
      <span
        role="button"
        tabIndex={-1}
        aria-label="删除"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item.id);
        }}
        className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover:opacity-100"
      >
        <X className="size-3" />
      </span>
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
}

interface FilmstripProps {
  items: ImageItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  loading?: boolean;
}

export function Filmstrip({ items, selectedId, onSelect, onRemove, onClear, loading }: FilmstripProps) {
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
        <Button variant="ghost" size="sm" onClick={onClear}>
          <Trash2 className="size-4" />
          清空
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={updateMasks}
          onWheel={handleWheel}
          className="h-full overflow-x-auto overflow-y-hidden"
        >
        <div className="flex h-full gap-2 p-3">
          {items.map((item) => (
            <Thumbnail
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              onSelect={onSelect}
              onRemove={onRemove}
            />
          ))}
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
    </div>
  );
}
