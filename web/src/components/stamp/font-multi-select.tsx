'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface FontMultiSelectProps {
  fonts: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

const RENDER_LIMIT = 300;

export function FontMultiSelect({ fonts, selected, onChange }: FontMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return fonts;
    return fonts.filter((f) => f.toLowerCase().includes(q));
  }, [fonts, query]);

  const visible = filtered.slice(0, RENDER_LIMIT);

  const toggle = (f: string) => {
    if (selectedSet.has(f)) onChange(selected.filter((s) => s !== f));
    else onChange([...selected, f]);
  };

  const triggerLabel =
    selected.length === 0
      ? '请选择字体'
      : selected.length === 1
        ? selected[0]
        : `已选 ${selected.length} 个字体`;

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between font-normal"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className="size-4 opacity-50" />
      </Button>

      {open && (
        <div className="absolute z-50 mt-2 flex w-full flex-col rounded-md border bg-popover p-0 text-popover-foreground shadow-md">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索字体…"
                className="h-8 pl-8"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <div className="p-1">
              {visible.map((f) => {
                const checked = selectedSet.has(f);
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggle(f)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                      checked && 'bg-accent/50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-sm border',
                        checked ? 'bg-primary border-primary text-primary-foreground' : 'border-input',
                      )}
                    >
                      {checked && <Check className="size-3" />}
                    </span>
                    <span className="truncate" style={{ fontFamily: f }}>
                      {f}
                    </span>
                  </button>
                );
              })}
              {filtered.length > RENDER_LIMIT && (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  显示前 {RENDER_LIMIT} 个，共 {filtered.length} 个，请搜索…
                </p>
              )}
              {filtered.length === 0 && (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">无匹配字体</p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between border-t p-2">
            <div className="flex flex-wrap gap-1">
              {selected.slice(0, 3).map((f) => (
                <Badge key={f} variant="secondary" className="text-xs">
                  {f}
                </Badge>
              ))}
              {selected.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{selected.length - 3}
                </Badge>
              )}
              {selected.length === 0 && (
                <span className="text-xs text-muted-foreground">未选择</span>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onChange([])}
              disabled={selected.length === 0}
            >
              清除
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
