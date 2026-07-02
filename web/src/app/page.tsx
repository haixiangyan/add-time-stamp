'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Clock } from 'lucide-react';
import { Dropzone } from '@/components/stamp/dropzone';
import { Filmstrip } from '@/components/stamp/filmstrip';
import { MetaPanel } from '@/components/stamp/meta-panel';
import { PreviewStage } from '@/components/stamp/preview-stage';
import { SettingsPanel } from '@/components/stamp/settings-panel';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  DEFAULT_COLOR,
  DEFAULT_FONTS,
  DEFAULT_SELECTED_FONTS,
  type ImageItem,
  type ImageMeta,
  type StampSettings,
} from '@/lib/stamp-settings';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function Page() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fonts, setFonts] = useState<string[]>(DEFAULT_FONTS);
  const [positions, setPositions] = useState<string[]>([
    'bottom-right',
    'bottom-left',
    'top-right',
    'top-left',
    'bottom-center',
    'top-center',
  ]);
  const [settings, setSettings] = useState<StampSettings>({
    fonts: DEFAULT_SELECTED_FONTS,
    color: DEFAULT_COLOR,
    position: 'bottom-right',
    dateSource: 'auto',
    fontSize: '',
    offsetX: 0,
    offsetY: 0,
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState('');
  const [previewFont, setPreviewFont] = useState('');
  const [autoFontSize, setAutoFontSize] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('');

  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSeq = useRef(0);
  const previewAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch('/api/positions')
      .then((r) => r.json())
      .then((d) => d.positions && setPositions(d.positions))
      .catch(() => {});
    const loadFonts = async () => {
      try {
        const res = await fetch('/api/fonts');
        const data = await res.json();
        if (data.fonts?.length) setFonts(data.fonts);
        if (!data.ready) setTimeout(loadFonts, 2500);
      } catch {
        /* keep defaults */
      }
    };
    loadFonts();
  }, []);

  const addFiles = useCallback((files: File[]) => {
    setItems((prev) => {
      const next = [...prev];
      for (const file of files) {
        const id = uid();
        next.push({ id, file, url: URL.createObjectURL(file), meta: null });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const unloaded = items.filter((i) => !i.meta);
    for (const item of unloaded) {
      loadMeta(item.id, item.file);
    }
    if (!selectedId && items.length) setSelectedId(items[0].id);
  }, [items, selectedId]);

  const loadMeta = async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('fileDate', new Date(file.lastModified).toISOString());
    try {
      const res = await fetch('/api/metadata', { method: 'POST', body: fd });
      const meta: ImageMeta = await res.json();
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, meta } : i)));
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, meta: { exif: null, stampDate: null, error: '读取失败' } } : i)),
      );
    }
  };

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  const refreshPreviewRef = useRef<() => void>(() => {});

  const schedulePreview = useCallback(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => refreshPreviewRef.current(), 280);
  }, []);

  useEffect(() => {
    schedulePreview();
  }, [selectedId, settings, schedulePreview]);

  const refreshPreview = useCallback(async () => {
    const item = items.find((i) => i.id === selectedId);
    if (!item) {
      setPreviewUrl(null);
      setPreviewLabel('');
      setPreviewFont('');
      setPreviewError(null);
      return;
    }
    if (previewAbort.current) previewAbort.current.abort();
    const ctrl = new AbortController();
    previewAbort.current = ctrl;
    const seq = ++previewSeq.current;

    setPreviewLoading(true);
    setPreviewError(null);

    const fd = new FormData();
    fd.append('file', item.file);
    fd.append('fileDate', new Date(item.file.lastModified).toISOString());
    const s = settings;
    fd.append('fonts', JSON.stringify(s.fonts.length ? s.fonts : DEFAULT_SELECTED_FONTS));
    fd.append('color', s.color);
    fd.append('position', s.position);
    fd.append('dateSource', s.dateSource);
    if (s.fontSize) fd.append('fontSize', s.fontSize);
    fd.append('offsetX', String(s.offsetX));
    fd.append('offsetY', String(s.offsetY));

    try {
      const res = await fetch('/api/preview', { method: 'POST', body: fd, signal: ctrl.signal });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      if (seq !== previewSeq.current) return;
      const blob = await res.blob();
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setPreviewLabel(res.headers.get('X-Stamp-Label') || '');
      setPreviewFont(res.headers.get('X-Stamp-Font') || '');
      const fs = Number(res.headers.get('X-Stamp-Font-Size'));
      setAutoFontSize(Number.isFinite(fs) && fs > 0 ? fs : null);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      if (seq !== previewSeq.current) return;
      setPreviewUrl(null);
      setPreviewError((e as Error).message || '预览失败');
      setPreviewLabel('');
      setPreviewFont('');
    } finally {
      if (seq === previewSeq.current) setPreviewLoading(false);
    }
  }, [items, selectedId, settings]);

  useEffect(() => {
    refreshPreviewRef.current = refreshPreview;
  }, [refreshPreview]);

  const clearAll = () => {
    for (const i of items) URL.revokeObjectURL(i.url);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setItems([]);
    setSelectedId(null);
    setPreviewUrl(null);
    setPreviewLabel('');
    setPreviewFont('');
    setPreviewError(null);
    setStatus('');
  };

  const exportZip = async () => {
    if (!items.length) return;
    setExporting(true);
    setStatus('处理中…');
    const fd = new FormData();
    for (const i of items) fd.append('files', i.file);
    const s = settings;
    fd.append('fonts', JSON.stringify(s.fonts.length ? s.fonts : DEFAULT_SELECTED_FONTS));
    fd.append('color', s.color);
    fd.append('position', s.position);
    fd.append('dateSource', s.dateSource);
    if (s.fontSize) fd.append('fontSize', s.fontSize);
    fd.append('offsetX', String(s.offsetX));
    fd.append('offsetY', String(s.offsetY));
    fd.append('fileDates', JSON.stringify(items.map((i) => new Date(i.file.lastModified).toISOString())));

    try {
      const res = await fetch('/api/stamp', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const blob = await res.blob();
      const disp = res.headers.get('Content-Disposition') || '';
      const match = disp.match(/filename="?([^";]+)"?/);
      const name = match ? decodeURIComponent(match[1]) : 'time-stamp-export.zip';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus(`已下载 ${name}`);
    } catch (e) {
      setStatus(`失败: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const hasItems = items.length > 0;
  const importing = items.some((i) => !i.meta);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Clock className="size-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-none">Time Stamp</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">批量给照片加怀旧日期水印</p>
          </div>
        </div>
        {hasItems && (
          <div className="flex items-center gap-2">
            <Dropzone onFiles={addFiles} compact loading={importing} />
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <Trash2 className="size-4" />
              清空
            </Button>
          </div>
        )}
      </header>

      <main className="min-h-0 flex-1 px-4 py-4 sm:px-6">
        {!hasItems ? (
          <div className="mx-auto max-w-2xl py-12">
            <Dropzone onFiles={addFiles} />
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" id="ts-main" className="h-full">
            <ResizablePanel id="ts-left" defaultSize="74%" minSize="40%">
              <ResizablePanelGroup direction="vertical" id="ts-left-col">
                <ResizablePanel id="ts-preview" defaultSize="64%" minSize="30%">
                  <PreviewStage
                    previewUrl={previewUrl}
                    label={previewLabel}
                    font={previewFont}
                    loading={previewLoading}
                    error={previewError}
                    empty={!selectedItem}
                    overlay={<MetaPanel item={selectedItem} />}
                  />
                </ResizablePanel>
                <ResizableHandle direction="vertical" withHandle />
                <ResizablePanel id="ts-gallery" defaultSize="36%" minSize="15%">
                  <Filmstrip
                    items={items}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onAdd={addFiles}
                    loading={importing}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
            <ResizableHandle direction="horizontal" withHandle />
            <ResizablePanel id="ts-settings" defaultSize="26%" minSize="18%" maxSize="45%">
              <SettingsPanel
                fonts={fonts}
                positions={positions}
                settings={settings}
                onChange={setSettings}
                onExport={exportZip}
                exporting={exporting}
                status={status}
                count={items.length}
                autoFontSize={autoFontSize}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </main>
    </div>
  );
}
