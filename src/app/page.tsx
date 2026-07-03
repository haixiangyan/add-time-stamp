'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Clock, SlidersHorizontal } from 'lucide-react';
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
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { PREVIEW_MAX_EDGE, resolveStampLabel } from '@/lib/client/preview';
import { readImageMeta } from '@/lib/client/metadata';
import { stampImage, stampedName } from '@/lib/client/render';
import { zip, strToU8 } from 'fflate';
import {
  DEFAULT_COLOR,
  DEFAULT_FONTS,
  DEFAULT_SELECTED_FONTS,
  type ImageItem,
  type StampSettings,
} from '@/lib/stamp-settings';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

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
  const [settingsOpen, setSettingsOpen] = useState(false);

  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSeq = useRef(0);

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
    try {
      const meta = await readImageMeta(file);
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
    // selectedItem?.meta is included so the preview re-runs once EXIF metadata
    // arrives — the client resolves the stamp date from it, and it may load
    // after the first preview fired.
  }, [selectedId, settings, selectedItem?.meta, schedulePreview]);

  const refreshPreview = useCallback(async () => {
    const item = items.find((i) => i.id === selectedId);
    if (!item) {
      setPreviewUrl(null);
      setPreviewLabel('');
      setPreviewFont('');
      setPreviewError(null);
      return;
    }
    const seq = ++previewSeq.current;
    setPreviewLoading(true);
    setPreviewError(null);

    const s = settings;
    const label = resolveStampLabel(item, s.dateSource);
    if (!label) {
      setPreviewUrl(null);
      setPreviewError('无法获取日期');
      setPreviewLabel('');
      setPreviewFont('');
      setPreviewLoading(false);
      return;
    }

    try {
      // Render the stamp in the browser (downscaled for a responsive preview).
      const { blob, fontSize, font } = await stampImage(item.file, label, {
        fonts: s.fonts.length ? s.fonts : DEFAULT_SELECTED_FONTS,
        color: s.color,
        position: s.position,
        fontSize: s.fontSize ? Number(s.fontSize) : null,
        offsetX: s.offsetX,
        offsetY: s.offsetY,
        maxEdge: PREVIEW_MAX_EDGE,
      });
      if (seq !== previewSeq.current) return;
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setPreviewLabel(label);
      setPreviewFont(font);
      setAutoFontSize(s.fontSize ? null : fontSize);
    } catch (e) {
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
    const s = settings;
    const opts = {
      fonts: s.fonts.length ? s.fonts : DEFAULT_SELECTED_FONTS,
      color: s.color,
      position: s.position,
      fontSize: s.fontSize ? Number(s.fontSize) : null,
      offsetX: s.offsetX,
      offsetY: s.offsetY,
    };

    try {
      const rendered: { name: string; blob: Blob }[] = [];
      const results: { name: string; ok: boolean; label?: string; outName?: string; error?: string }[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const label = resolveStampLabel(item, s.dateSource);
        if (!label) {
          results.push({ name: item.file.name, ok: false, error: '无法获取日期' });
          continue;
        }
        setStatus(`处理中… ${i + 1}/${items.length}`);
        // Render full-resolution in the browser — no upload, no size limit.
        const { blob } = await stampImage(item.file, label, { ...opts, fontIndex: i });
        const outName = stampedName(item.file.name);
        rendered.push({ name: outName, blob });
        results.push({ name: item.file.name, ok: true, label, outName });
      }

      if (!rendered.length) throw new Error(results[0]?.error || '没有可导出的图片');

      // On touch devices (iOS/Android), hand the images to the native share
      // sheet so they can be saved straight to the photo library. A plain
      // download would only land in Files.
      const files = rendered.map((r) => new File([r.blob], r.name, { type: r.blob.type }));
      const coarsePointer =
        typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
      if (coarsePointer && typeof navigator !== 'undefined' && navigator.canShare?.({ files })) {
        try {
          await navigator.share({ files });
          setStatus(`已分享 ${files.length} 张，可存到图库`);
          return;
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            setStatus('已取消');
            return;
          }
          // otherwise fall through to a normal download
        }
      }

      if (rendered.length === 1) {
        downloadBlob(rendered[0].blob, rendered[0].name);
        setStatus(`已下载 ${rendered[0].name}`);
        return;
      }

      const entries: Record<string, Uint8Array> = {};
      for (const r of rendered) entries[r.name] = new Uint8Array(await r.blob.arrayBuffer());
      entries['_manifest.json'] = strToU8(JSON.stringify(results, null, 2));
      const data = await new Promise<Uint8Array>((resolve, reject) =>
        zip(entries, { level: 0 }, (err, out) => (err ? reject(err) : resolve(out))),
      );
      downloadBlob(new Blob([data as BlobPart], { type: 'application/zip' }), 'time-stamp-export.zip');
      setStatus(`已下载 time-stamp-export.zip（${rendered.length}/${items.length}）`);
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
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label="水印设置"
            onClick={() => setSettingsOpen(true)}
          >
            <SlidersHorizontal className="size-4" />
          </Button>
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Clock className="size-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-none">Time Stamp</h1>
            <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">批量给照片加怀旧日期水印</p>
          </div>
        </div>
        {hasItems && (
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <Dropzone onFiles={addFiles} compact loading={importing} />
            </div>
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
          <>
            {/* Desktop: resizable three-pane layout.
                Wrapped in a plain div because ResizablePanelGroup forces an
                inline `display:flex`, which would override a `hidden` class. */}
            <div className="hidden h-full lg:block">
            <ResizablePanelGroup
              direction="horizontal"
              id="ts-main"
              className="h-full"
            >
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
            </div>

            {/* Mobile: preview on top, gallery below, settings in a drawer */}
            <div className="flex h-full flex-col gap-3 lg:hidden">
              <div className="min-h-0 flex-1">
                <PreviewStage
                  previewUrl={previewUrl}
                  label={previewLabel}
                  font={previewFont}
                  loading={previewLoading}
                  error={previewError}
                  empty={!selectedItem}
                  overlay={<MetaPanel item={selectedItem} />}
                />
              </div>
              <div className="h-40 shrink-0">
                <Filmstrip
                  items={items}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onAdd={addFiles}
                  loading={importing}
                />
              </div>
            </div>
          </>
        )}
      </main>

      {/* Settings drawer (mobile). Mounted regardless of whether images are
          loaded so the top-left trigger always works. */}
      <Drawer open={settingsOpen} onOpenChange={setSettingsOpen} swipeDirection="left">
        <DrawerContent side="left" title="水印设置">
          <SettingsPanel
            hideHeader
            className="h-auto rounded-none bg-transparent ring-0"
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
        </DrawerContent>
      </Drawer>
    </div>
  );
}
