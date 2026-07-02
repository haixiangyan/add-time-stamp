import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import exifr from 'exifr';

const execFileAsync = promisify(execFile);

export const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif']);
export const STAMP_SUFFIX = '-stamped';
export const DEFAULT_COLOR = '#ff7a1a';
export const DEFAULT_FONT = 'Helvetica';
const REF_LONG_EDGE = 4800;
const FONT_SIZE_RATIO = 130 / REF_LONG_EDGE;
const PADDING_RATIO = 300 / REF_LONG_EDGE;

export const POSITIONS = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
  'bottom-center',
  'top-center',
] as const;
export type Position = (typeof POSITIONS)[number];

export interface StampOptions {
  font?: string | null;
  fonts?: string[] | null;
  color?: string;
  position?: Position | string;
  dateSource?: 'auto' | 'exif' | 'file' | string;
  quality?: number;
  fontSize?: number | null;
  padding?: number | null;
  offsetX?: number;
  offsetY?: number;
  fontIndex?: number;
  fallbackDate?: string | null;
  previewMaxEdge?: number;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function formatDate(d: Date) {
  return `${d.getFullYear()} ${pad2(d.getMonth() + 1)} ${pad2(d.getDate())}`;
}

export function isStamped(filePath: string) {
  const base = path.basename(filePath, path.extname(filePath));
  return base.endsWith(STAMP_SUFFIX);
}

export function stampMetrics(width: number, height: number, opts: StampOptions) {
  const dim = Math.max(width, height);
  return {
    fontSize: opts.fontSize ?? Math.round(dim * FONT_SIZE_RATIO),
    padding: opts.padding ?? Math.round(dim * PADDING_RATIO),
  };
}

export function stampedPath(filePath: string) {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  return path.join(path.dirname(filePath), `${base}${STAMP_SUFFIX}${ext}`);
}

type DateSource = 'auto' | 'exif' | 'file' | string;

async function getDateFromBuffer(
  buffer: Buffer,
  fallback: Date | string | null,
  source: DateSource,
): Promise<Date | null> {
  if (source === 'exif' || source === 'auto') {
    try {
      const exif = (await exifr.parse(buffer, [
        'DateTimeOriginal',
        'CreateDate',
        'ModifyDate',
      ])) as any;
      const d = exif && (exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate);
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch {
      /* fall through */
    }
    if (source === 'exif') return null;
  }
  if (fallback instanceof Date) return fallback;
  if (typeof fallback === 'string' && fallback) {
    const d = new Date(fallback);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

async function getDate(filePath: string, source: DateSource): Promise<Date | null> {
  if (source === 'exif' || source === 'auto') {
    try {
      const exif = (await exifr.parse(filePath, [
        'DateTimeOriginal',
        'CreateDate',
        'ModifyDate',
      ])) as any;
      const d = exif && (exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate);
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch {
      /* fall through */
    }
    if (source === 'exif') return null;
  }
  const st = await fs.stat(filePath);
  const bt = st.birthtime;
  if (bt && bt.getTime() > 0) return bt;
  return st.mtime;
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<'
      ? '&lt;'
      : c === '>'
        ? '&gt;'
        : c === '&'
          ? '&amp;'
          : c === "'"
            ? '&apos;'
            : '&quot;',
  );
}

function textAnchor(position: string) {
  if (position.endsWith('left')) return 'start';
  if (position.endsWith('center')) return 'middle';
  return 'end';
}

function textCoords(
  imgW: number,
  imgH: number,
  position: string,
  padding: number,
  fontSize: number,
  offsetX = 0,
  offsetY = 0,
) {
  const dx = (offsetX / 100) * imgW;
  const dy = (offsetY / 100) * imgH;
  const baseline = imgH - padding + dy;
  const topline = padding + fontSize * 0.85 + dy;
  const anchor = textAnchor(position);
  switch (position) {
    case 'bottom-right':
      return { x: imgW - padding + dx, y: baseline, anchor };
    case 'bottom-left':
      return { x: padding + dx, y: baseline, anchor };
    case 'bottom-center':
      return { x: imgW / 2 + dx, y: baseline, anchor };
    case 'top-right':
      return { x: imgW - padding + dx, y: topline, anchor };
    case 'top-left':
      return { x: padding + dx, y: topline, anchor };
    case 'top-center':
      return { x: imgW / 2 + dx, y: topline, anchor };
    default:
      return { x: imgW - padding + dx, y: baseline, anchor };
  }
}

function pickFont(opts: StampOptions, index: number) {
  const fonts = opts.fonts;
  if (Array.isArray(fonts) && fonts.length > 0) {
    return fonts[index % fonts.length];
  }
  return opts.font || DEFAULT_FONT;
}

function buildOverlaySvg(
  imgW: number,
  imgH: number,
  text: string,
  p: {
    fontSize: number;
    padding: number;
    color: string;
    font: string;
    position?: string;
    offsetX?: number;
    offsetY?: number;
  },
) {
  const { x, y, anchor } = textCoords(
    imgW,
    imgH,
    p.position || 'bottom-right',
    p.padding,
    p.fontSize,
    p.offsetX || 0,
    p.offsetY || 0,
  );
  const stroke = Math.max(1, Math.round(p.fontSize / 18));
  const safe = escapeXml(text);
  return Buffer.from(
    `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">
  <text x="${x}" y="${y}"
    font-family="${p.font}" font-size="${p.fontSize}" font-weight="600"
    text-anchor="${anchor}" letter-spacing="${p.fontSize * 0.04}"
    fill="${p.color}" stroke="rgba(0,0,0,0.4)" stroke-width="${stroke}"
    paint-order="stroke">${safe}</text>
</svg>`,
  );
}

function applyEncoding(
  pipeline: sharp.Sharp,
  ext: string,
  quality: number,
  meta: sharp.Metadata,
) {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return pipeline.jpeg({
        quality,
        chromaSubsampling: meta.chromaSubsampling === '4:4:4' ? '4:4:4' : '4:2:0',
        progressive: !!meta.isProgressive,
        mozjpeg: false,
      });
    case '.png':
      return pipeline.png({ compressionLevel: 9 });
    case '.webp':
      return pipeline.webp({ quality });
    case '.tiff':
    case '.tif':
      return pipeline.tiff({ quality, compression: 'jpeg' });
    default:
      return pipeline;
  }
}

async function copyFileTimes(src: string, dest: string) {
  const st = await fs.stat(src);
  await fs.utimes(dest, st.atime, st.mtime);
  if (process.platform === 'darwin') {
    const d = st.birthtime && st.birthtime.getTime() > 0 ? st.birthtime : st.mtime;
    const fmt =
      `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()} ` +
      `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    await new Promise<void>((resolve) => {
      execFile('SetFile', ['-d', fmt, dest], () => resolve());
    });
  }
}

function sanitizeExif(exif: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(exif)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === 'object' && v !== null) continue;
    else out[k] = v;
  }
  return out;
}

export interface ImageMetadata {
  width?: number;
  height?: number;
  format?: string;
  space?: string;
  channels?: number;
  density?: number;
  hasAlpha?: boolean;
  isProgressive?: boolean;
  chromaSubsampling?: string;
  exif: Record<string, unknown> | null;
  stampDate: string | null;
}

export async function extractMetadata(buffer: Buffer): Promise<ImageMetadata> {
  const img = sharp(buffer, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  let exif: Record<string, unknown> | null = null;
  try {
    exif = sanitizeExif((await exifr.parse(buffer)) as Record<string, unknown>);
  } catch {
    /* ignore */
  }
  const date = await getDateFromBuffer(buffer, null, 'auto');
  return {
    width: meta.width,
    height: meta.height,
    format: meta.format,
    space: meta.space,
    channels: meta.channels,
    density: meta.density,
    hasAlpha: meta.hasAlpha,
    isProgressive: meta.isProgressive,
    chromaSubsampling: meta.chromaSubsampling,
    exif,
    stampDate: date ? formatDate(date) : null,
  };
}

export interface StampResult {
  buffer: Buffer;
  outName: string;
  label: string;
  font: string;
}

export async function stampBuffer(
  inputBuffer: Buffer,
  originalName: string,
  opts: StampOptions,
): Promise<StampResult> {
  const ext = path.extname(originalName).toLowerCase();
  if (!SUPPORTED.has(ext)) throw new Error(`不支持的格式: ${ext}`);

  const fallback = opts.fallbackDate ? new Date(opts.fallbackDate) : null;
  const date = await getDateFromBuffer(inputBuffer, fallback, opts.dateSource || 'auto');
  if (!date) throw new Error('无法获取日期');
  const label = formatDate(date);

  const img = sharp(inputBuffer, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error('无法读取图片');

  const { fontSize, padding } = stampMetrics(meta.width, meta.height, opts);
  const font = pickFont(opts, opts.fontIndex || 0);
  const svg = buildOverlaySvg(meta.width, meta.height, label, {
    fontSize,
    padding,
    color: opts.color || DEFAULT_COLOR,
    font,
    position: opts.position || 'bottom-right',
    offsetX: Number(opts.offsetX) || 0,
    offsetY: Number(opts.offsetY) || 0,
  });

  let pipeline = img.composite([{ input: svg, top: 0, left: 0 }]).withMetadata();
  pipeline = applyEncoding(pipeline, ext, opts.quality ?? 100, meta);
  const outBuffer = await pipeline.toBuffer();
  const base = path.basename(originalName, ext);
  const outName = `${base}${STAMP_SUFFIX}${ext}`;
  return { buffer: outBuffer, outName, label, font };
}

export interface PreviewResult {
  buffer: Buffer;
  label: string;
  font: string;
}

export async function stampPreviewBuffer(
  inputBuffer: Buffer,
  originalName: string,
  opts: StampOptions,
): Promise<PreviewResult> {
  const ext = path.extname(originalName).toLowerCase();
  if (!SUPPORTED.has(ext)) throw new Error(`不支持的格式: ${ext}`);

  const fallback = opts.fallbackDate ? new Date(opts.fallbackDate) : null;
  const date = await getDateFromBuffer(inputBuffer, fallback, opts.dateSource || 'auto');
  if (!date) throw new Error('无法获取日期');
  const label = formatDate(date);

  const maxEdge = opts.previewMaxEdge ?? 1400;
  let pipeline = sharp(inputBuffer, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) throw new Error('无法读取图片');

  const longEdge = Math.max(meta.width, meta.height);
  if (longEdge > maxEdge) {
    pipeline = pipeline.resize({
      width: meta.width >= meta.height ? maxEdge : undefined,
      height: meta.height > meta.width ? maxEdge : undefined,
      withoutEnlargement: true,
    });
  }

  const baseBuffer = await pipeline.toBuffer();
  const base = sharp(baseBuffer);
  const sized = await base.metadata();
  const w = sized.width;
  const h = sized.height;
  if (!w || !h) throw new Error('无法读取图片');

  const { fontSize, padding } = stampMetrics(w, h, opts);
  const font = pickFont(opts, 0);
  const svg = buildOverlaySvg(w, h, label, {
    fontSize,
    padding,
    color: opts.color || DEFAULT_COLOR,
    font,
    position: opts.position || 'bottom-right',
    offsetX: Number(opts.offsetX) || 0,
    offsetY: Number(opts.offsetY) || 0,
  });

  const buffer = await base
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
  return { buffer, label, font };
}

export async function processOne(filePath: string, opts: StampOptions) {
  const name = path.basename(filePath);
  const destPath = stampedPath(filePath);

  const date = await getDate(filePath, opts.dateSource || 'auto');
  if (!date) return { file: name, status: 'no date, skipped', ok: false };
  const label = formatDate(date);

  const img = sharp(filePath, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) return { file: name, status: 'unreadable, skipped', ok: false };

  const { fontSize, padding } = stampMetrics(meta.width, meta.height, opts);
  const font = pickFont(opts, opts.fontIndex || 0);
  const svg = buildOverlaySvg(meta.width, meta.height, label, {
    fontSize,
    padding,
    color: opts.color || DEFAULT_COLOR,
    font,
    position: opts.position || 'bottom-right',
    offsetX: Number(opts.offsetX) || 0,
    offsetY: Number(opts.offsetY) || 0,
  });
  let pipeline = img.composite([{ input: svg, top: 0, left: 0 }]).withMetadata();
  pipeline = applyEncoding(pipeline, path.extname(filePath), opts.quality ?? 100, meta);

  await pipeline.toFile(destPath);
  await copyFileTimes(filePath, destPath);
  return { file: name, status: `ok (${label}) -> ${path.basename(destPath)}`, ok: true };
}

export async function collectImages(dir: string, recursive: boolean): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive) out.push(...(await collectImages(full, recursive)));
    } else if (SUPPORTED.has(path.extname(e.name).toLowerCase()) && !isStamped(e.name)) {
      out.push(full);
    }
  }
  return out;
}
