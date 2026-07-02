'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes, type ImageItem } from '@/lib/stamp-settings';

interface MetaPanelProps {
  item: ImageItem | null;
}

export function MetaPanel({ item }: MetaPanelProps) {
  const [open, setOpen] = useState(false);
  if (!item) return null;

  const rows: [string, string][] = [];
  rows.push(['文件名', item.file.name]);
  rows.push(['大小', formatBytes(item.file.size)]);
  rows.push(['修改时间', new Date(item.file.lastModified).toLocaleString()]);

  if (!item.meta) {
    rows.push(['状态', '加载中…']);
  } else if (item.meta.error) {
    rows.push(['错误', item.meta.error]);
  } else {
    const m = item.meta;
    if (m.width) rows.push(['尺寸', `${m.width} × ${m.height}`]);
    if (m.format) rows.push(['格式', m.format]);
    if (m.space) rows.push(['色彩空间', m.space]);
    if (m.density) rows.push(['DPI', String(m.density)]);
    if (m.stampDate) rows.push(['水印日期', m.stampDate]);
    if (m.exif) {
      for (const [k, v] of Object.entries(m.exif)) {
        rows.push([`EXIF.${k}`, String(v)]);
      }
    }
  }

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex shrink-0 items-center justify-between px-4 py-2"
      >
        <span className="text-sm font-semibold">图片信息</span>
        <ChevronDown
          className={cn('size-4 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <CardContent className="min-h-0 max-h-48 overflow-y-auto pt-0">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            {rows.map(([k, v], i) => (
              <div key={i} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-all font-mono">{v}</dd>
              </div>
            ))}
          </dl>
          {item.meta?.stampDate && (
            <Badge className="mt-3" variant="default">
              {item.meta.stampDate}
            </Badge>
          )}
        </CardContent>
      )}
    </Card>
  );
}
