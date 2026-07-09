'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Clock, SlidersHorizontal, Download, Loader2 } from 'lucide-react';
import { Dropzone, filesFromDrop } from '@/components/stamp/dropzone';
import { ImageUp } from 'lucide-react';
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
import { stampedName } from '@/lib/client/render';
import { isHeif } from '@/lib/client/heif';
import { readMeta, renderStamp } from '@/lib/client/worker/service';
import { runExport, type ExportTask } from '@/lib/client/export-sink';
import {
  DEFAULT_SELECTED_FONTS,
  filterImageFiles,
  type ImageItem,
  type ImageMeta,
  type StampSettings,
} from '@/lib/stamp-settings';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  usePersistedLayout,
} from '@/lib/client/persist';
import { listSystemFonts } from '@/lib/client/system-fonts';

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

// Match the worker pool size: keep it fed without holding more than a few
// full-resolution stamped blobs alive at once during a large export.
const EXPORT_CONCURRENCY =
  typeof navigator !== 'undefined'
    ? Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 4))
    : 4;

export default function Page() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fonts, setFonts] = useState<string[]>(DEFAULT_SELECTED_FONTS);
  const positions = [
    'bottom-right',
    'bottom-left',
    'top-right',
    'top-left',
    'bottom-center',
    'top-center',
  ];
  const [settings, setSettings] = useState<StampSettings>(() => loadSettings());

  useEffect(() => {
    let cancelled = false;
    listSystemFonts().then((list) => {
      if (cancelled || !list.length) return;
      setFonts(list);
      setSettings((s) => {
        const cur = s.fonts[0];
        if (cur && list.includes(cur)) return s;
        return { ...s, fonts: [list.includes('Arial') ? 'Arial' : list[0]] };
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const mainLayout = usePersistedLayout('ts-main');
  const leftColLayout = usePersistedLayout('ts-left-col');

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState('');
  const [previewFont, setPreviewFont] = useState('');
  const [autoFontSize, setAutoFontSize] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire on every child too, so track nesting depth and only
  // clear the overlay once we've left the outermost element.
  const dragDepth = useRef(0);

  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSeq = useRef(0);
  const loadingIds = useRef(new Set<string>());
  const [loadingCount, setLoadingCount] = useState(0);

  // Mirror items in a ref so stable callbacks can read the latest list without
  // re-subscribing on every change (matters at thousands of items).
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Meta/thumbnail results are coalesced and flushed once per animation frame,
  // so a burst of completions doesn't fire one setItems (and a full-list
  // reconcile) per photo — that O(n²) is what made large imports janky.
  const pendingUpdates = useRef(new Map<string, Partial<ImageItem>>());
  const flushHandle = useRef<number | null>(null);
  const queueUpdate = useCallback((id: string, patch: Partial<ImageItem>) => {
    pendingUpdates.current.set(id, { ...pendingUpdates.current.get(id), ...patch });
    if (flushHandle.current != null) return;
    flushHandle.current = requestAnimationFrame(() => {
      flushHandle.current = null;
      const updates = pendingUpdates.current;
      pendingUpdates.current = new Map();
      setItems((prev) => prev.map((i) => (updates.has(i.id) ? { ...i, ...updates.get(i.id)! } : i)));
    });
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    dragDepth.current += 1;
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }, []);

  const addFiles = useCallback((files: File[]) => {
    setItems((prev) => {
      const next = [...prev];
      for (const file of files) {
        const id = uid();
        // HEIC can't render from a raw object URL outside Safari, so leave its
        // url empty until the worker decodes a thumbnail on demand. Other formats
        // get an object URL the browser decodes lazily (only when scrolled in).
        next.push({ id, file, url: isHeif(file) ? '' : URL.createObjectURL(file), meta: null });
      }
      return next;
    });
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const all = await filesFromDrop(e.dataTransfer);
      const files = filterImageFiles(all);
      if (files.length) addFiles(files);
    },
    [addFiles],
  );

  // Load EXIF (+ HEIC thumbnail) for one item, on demand — the filmstrip calls
  // this as thumbnails scroll into view, so importing a folder of thousands does
  // no upfront work; each photo is parsed only when looked at (or exported).
  const ensureMeta = useCallback(
    (id: string) => {
      if (loadingIds.current.has(id)) return;
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item || item.meta) return;
      loadingIds.current.add(id);
      setLoadingCount((c) => c + 1);
      readMeta(item.file, PREVIEW_MAX_EDGE)
        .then(({ meta, thumb }) =>
          queueUpdate(id, thumb ? { meta, url: URL.createObjectURL(thumb) } : { meta }),
        )
        .catch(() =>
          queueUpdate(id, { meta: { exif: null, stampDate: null, error: '读取失败' } as ImageMeta }),
        )
        .finally(() => {
          loadingIds.current.delete(id);
          setLoadingCount((c) => c - 1);
        });
    },
    [queueUpdate],
  );

  useEffect(() => {
    if (!selectedId && items.length) setSelectedId(items[0].id);
  }, [items, selectedId]);

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;
  const gps =
    selectedItem?.meta && typeof selectedItem.meta.latitude === 'number' && typeof selectedItem.meta.longitude === 'number'
      ? { latitude: selectedItem.meta.latitude, longitude: selectedItem.meta.longitude }
      : null;

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

    const s = settings;
    // 'auto' needs EXIF — with lazy loading the selected item may not have it
    // yet. Kick off the load and bail; this effect re-runs when meta arrives.
    if (!item.meta && s.dateSource !== 'custom') {
      ensureMeta(item.id);
      setPreviewLoading(true);
      setPreviewError(null);
      return;
    }

    const label = resolveStampLabel(item, s.dateSource, s.customDate, s.dateFormat);
    if (!label) {
      setPreviewUrl(null);
      setPreviewError('无法获取日期');
      setPreviewLabel('');
      setPreviewFont('');
      setPreviewLoading(false);
      return;
    }

    const seq = ++previewSeq.current;
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      // Render the stamp in a Worker (downscaled for a responsive preview).
      const res = await renderStamp(item.file, { label }, {
        fonts: s.fonts.length ? s.fonts : DEFAULT_SELECTED_FONTS,
        color: s.color,
        position: s.position,
        fontSize: s.fontSize ? Number(s.fontSize) : null,
        offsetX: s.offsetX,
        offsetY: s.offsetY,
        maxEdge: PREVIEW_MAX_EDGE,
      });
      if (seq !== previewSeq.current) return;
      if (!res) {
        setPreviewUrl(null);
        setPreviewError('无法获取日期');
        setPreviewLabel('');
        setPreviewFont('');
        return;
      }
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(res.blob);
      });
      setPreviewLabel(label);
      setPreviewFont(res.font);
      setAutoFontSize(s.fontSize ? null : res.fontSize);
    } catch (e) {
      if (seq !== previewSeq.current) return;
      setPreviewUrl(null);
      setPreviewError((e as Error).message || '预览失败');
      setPreviewLabel('');
      setPreviewFont('');
    } finally {
      if (seq === previewSeq.current) setPreviewLoading(false);
    }
  }, [items, selectedId, settings, ensureMeta]);

  useEffect(() => {
    refreshPreviewRef.current = refreshPreview;
  }, [refreshPreview]);

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.url);
      const next = prev.filter((i) => i.id !== id);
      if (selectedId === id) {
        setSelectedId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const resetAll = () => {
    setSettings(DEFAULT_SETTINGS);
  };

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
      keepExif: true,
    };
    // The stamp text: precomputed when the item's meta is already loaded,
    // otherwise the worker resolves it from EXIF (dateSource/customDate) so a
    // lazily-imported folder doesn't need every photo parsed up front.
    const dateOf = (item: ImageItem) => ({
      label: item.meta ? resolveStampLabel(item, s.dateSource, s.customDate, s.dateFormat) : null,
      dateSource: s.dateSource,
      customDate: s.customDate,
      dateFormat: s.dateFormat,
    });
    const outName = (name: string) =>
      stampedName(name).replace(/\.(heic|heif)$/i, '.jpg');

    try {
      const targets = itemsRef.current;

      // Single image keeps the direct-download UX (no zip, no folder prompt).
      if (targets.length === 1) {
        const it = targets[0];
        const res = await renderStamp(it.file, dateOf(it), opts);
        if (!res) throw new Error('没有可导出的图片（无法获取日期）');
        const name = outName(it.file.name);
        downloadBlob(res.blob, name);
        setStatus(`已下载 ${name}`);
        return;
      }

      // fontIndex uses each item's position so per-image font rotation matches
      // the old behavior; render lazily inside each export task so the sink can
      // stream results out with bounded memory.
      const tasks: ExportTask[] = targets.map((item, i) => ({
        name: outName(item.file.name),
        render: async () => {
          const res = await renderStamp(item.file, dateOf(item), { ...opts, fontIndex: i });
          return res?.blob ?? null;
        },
      }));

      const summary = await runExport(tasks, {
        concurrency: EXPORT_CONCURRENCY,
        onProgress: (done, total) => setStatus(`处理中… ${done}/${total}`),
      });

      if (!summary.written) throw new Error('没有可导出的图片（无法获取日期）');
      const skipNote = summary.skipped ? `，跳过 ${summary.skipped} 张（无日期）` : '';
      setStatus(
        summary.mode === 'folder'
          ? `已导出 ${summary.written} 张到所选文件夹${skipNote}`
          : `已导出 ${summary.written} 张${skipNote}`,
      );
    } catch (e) {
      // Folder-picker cancelled → treat as a benign cancel, not a failure.
      if ((e as Error).name === 'AbortError') setStatus('已取消导出');
      else setStatus(`失败: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const hasItems = items.length > 0;
  const importing = loadingCount > 0;

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
        <div className="flex items-center gap-2">
          <Dropzone onFiles={addFiles} loading={importing} />
          {/* Mobile: export straight from the header (settings live in a drawer) */}
          {hasItems && (
            <Button
              size="sm"
              className="lg:hidden"
              onClick={exportZip}
              disabled={exporting || items.length === 0}
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              导出
            </Button>
          )}
        </div>
      </header>

      <main
        className="relative min-h-0 flex-1 px-4 py-4 sm:px-6"
        onDragEnter={handleDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag-drop overlay — accepts both images and whole folders. */}
        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
              <ImageUp className="size-7" />
            </div>
            <p className="text-base font-medium text-primary">松开以导入图片 / 文件夹</p>
          </div>
        )}
        <>
            {/* Desktop: resizable three-pane layout.
                Wrapped in a plain div because ResizablePanelGroup forces an
                inline `display:flex`, which would override a `hidden` class. */}
            <div className="hidden h-full lg:block">
            <ResizablePanelGroup
              direction="horizontal"
              id="ts-main"
              className="h-full"
              defaultLayout={mainLayout.defaultLayout}
              onLayoutChanged={mainLayout.onLayoutChanged}
            >
              <ResizablePanel id="ts-left" defaultSize="74%" minSize="40%">
                <ResizablePanelGroup
                  direction="vertical"
                  id="ts-left-col"
                  defaultLayout={leftColLayout.defaultLayout}
                  onLayoutChanged={leftColLayout.onLayoutChanged}
                >
                  <ResizablePanel id="ts-preview" defaultSize="64%" minSize="30%">
                    <PreviewStage
                      previewUrl={previewUrl}
                      label={previewLabel}
                      font={previewFont}
                      loading={previewLoading}
                      error={previewError}
                      empty={!selectedItem}
                      overlay={<MetaPanel item={selectedItem} dateFormat={settings.dateFormat} />}
                    />
                  </ResizablePanel>
                  <ResizableHandle direction="vertical" withHandle />
                  <ResizablePanel id="ts-gallery" defaultSize="36%" minSize="15%">
                    <Filmstrip
                      items={items}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onRemove={removeItem}
                      onClear={clearAll}
                      onVisible={ensureMeta}
                      loading={importing}
                      dateFormat={settings.dateFormat}
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
                  gps={gps}
                  onClear={clearAll}
                  onReset={resetAll}
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
                  overlay={<MetaPanel item={selectedItem} dateFormat={settings.dateFormat} />}
                />
              </div>
              <div className="h-40 shrink-0">
                <Filmstrip
                  items={items}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onRemove={removeItem}
                  onClear={clearAll}
                  onVisible={ensureMeta}
                  loading={importing}
                  dateFormat={settings.dateFormat}
                />
              </div>
            </div>
        </>
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
            gps={gps}
          />
        </DrawerContent>
      </Drawer>
    </div>
  );
}
