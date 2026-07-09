'use client';

import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFAULT_DATE_FORMAT, formatBytes, type ImageItem } from '@/lib/stamp-settings';
import { formatStampLabel } from '@/lib/client/preview';

interface MetaPanelProps {
  item: ImageItem | null;
  dateFormat?: string;
}

export function MetaPanel({ item, dateFormat = DEFAULT_DATE_FORMAT }: MetaPanelProps) {
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
    if (m.stampDate) rows.push(['水印日期', formatStampLabel(m.stampDate, dateFormat)]);
    if (typeof m.latitude === 'number' && typeof m.longitude === 'number') {
      rows.push(['纬度', m.latitude.toFixed(6)]);
      rows.push(['经度', m.longitude.toFixed(6)]);
    }
    if (m.exif) {
      for (const [k, v] of Object.entries(m.exif)) {
        rows.push([`EXIF.${k}`, String(v)]);
      }
    }
  }

  return (
    <div className="absolute left-3 top-3 z-20 max-w-[min(20rem,calc(100%-1.5rem))]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/70"
      >
        <Info className="size-3.5" />
        图片信息
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-1.5 max-h-[min(60vh,20rem)] overflow-y-auto rounded-md bg-black/60 p-3 text-white backdrop-blur-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
            {rows.map(([k, v], i) => (
              <div key={i} className="contents">
                <dt className="text-white/60">{k}</dt>
                <dd className="break-all font-mono">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
