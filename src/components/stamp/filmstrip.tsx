'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFAULT_DATE_FORMAT, type ImageItem } from '@/lib/stamp-settings';
import { formatStampLabel } from '@/lib/client/preview';

interface ThumbnailProps {
  item: ImageItem;
  selected: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  dateFormat: string;
}

function Thumbnail({ item, selected, onSelect, onRemove, dateFormat }: ThumbnailProps) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
  }, [item.url]);

  const stampLabel = item.meta?.stampDate
    ? formatStampLabel(item.meta.stampDate, dateFormat)
    : null;

  return (
    <button
      type="button"
      title={item.file.name}
      onClick={() => onSelect(item.id)}
      className={cn(
        'group relative h-full w-full overflow-hidden rounded-md border bg-muted text-left transition-colors',
        selected ? 'border-primary ring-2 ring-primary/40' : 'border-transparent hover:border-primary/40',
      )}
    >
      {(!loaded || !item.url) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {item.url && (
        <img
          src={item.url}
          alt={item.file.name}
          className={cn('h-full w-full object-cover', !loaded && 'opacity-0')}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
        />
      )}
      <span
        role="button"
        tabIndex={-1}
        aria-label="删除"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item.id);
        }}
        className="absolute right-1 top-1 z-20 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover:opacity-100"
      >
        <X className="size-3" />
      </span>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-2 pb-1.5 pt-4">
        <p className="truncate text-[10px] font-medium text-white">{item.file.name}</p>
        {stampLabel ? (
          <Badge variant="secondary" className="w-fit px-1 py-0 text-[10px]">
            {stampLabel}
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
  /** Called for each item as it scrolls into view so the parent can lazily load it. */
  onVisible?: (id: string) => void;
  loading?: boolean;
  dateFormat?: string;
}

// Layout constants (mirror the Tailwind classes on the track: p-3 / gap-2).
const PAD = 12;
const GAP = 8;
const OVERSCAN = 6;

export function Filmstrip({
  items,
  selectedId,
  onSelect,
  onRemove,
  onClear,
  onVisible,
  loading,
  dateFormat = DEFAULT_DATE_FORMAT,
}: FilmstripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  // Viewport metrics that drive virtualization: only render the visible window
  // so the DOM/decoded-image count stays flat no matter how many are imported.
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const updateMasks = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setHeight(el.clientHeight);
    setWidth(el.clientWidth);
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    updateMasks();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      measure();
      updateMasks();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateMasks, measure]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) setScrollLeft(el.scrollLeft);
    updateMasks();
  }, [updateMasks]);

  // translate vertical wheel into horizontal scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  };

  const total = items.length;
  const itemW = Math.max(0, height - PAD * 2); // square thumbnails: width = inner height
  const stride = itemW + GAP;
  const totalWidth = total > 0 && itemW > 0 ? PAD * 2 + total * itemW + (total - 1) * GAP : 0;

  let start = 0;
  let end = -1;
  if (itemW > 0 && total > 0) {
    start = Math.max(0, Math.floor((scrollLeft - PAD) / stride) - OVERSCAN);
    const visibleCount = Math.ceil((width || stride) / stride) + OVERSCAN * 2;
    end = Math.min(total - 1, start + visibleCount);
  }

  // Notify the parent which items are on screen so it can lazily load them.
  useEffect(() => {
    if (!onVisible || end < start) return;
    for (let i = start; i <= end; i++) {
      const it = items[i];
      if (it) onVisible(it.id);
    }
  }, [start, end, items, onVisible]);

  const visible = [];
  for (let i = start; i <= end; i++) {
    const item = items[i];
    if (!item) continue;
    visible.push(
      <div
        key={item.id}
        className="absolute"
        style={{ left: PAD + i * stride, top: PAD, width: itemW, height: itemW }}
      >
        <Thumbnail
          item={item}
          selected={item.id === selectedId}
          onSelect={onSelect}
          onRemove={onRemove}
          dateFormat={dateFormat}
        />
      </div>,
    );
  }

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
        <Button variant="ghost" size="sm" onClick={onClear} disabled={total === 0}>
          <Trash2 className="size-4" />
          清空
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          onWheel={handleWheel}
          className="h-full overflow-x-auto overflow-y-hidden"
        >
          {total === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              导入的图片会显示在这里
            </div>
          ) : (
            <div className="relative h-full" style={{ width: totalWidth || '100%' }}>
              {visible}
            </div>
          )}
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
