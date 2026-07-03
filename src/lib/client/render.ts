// Client-side stamp renderer. Draws the date watermark onto the image with a
// <canvas> using the bundled fonts (loaded via FontFace), so both preview and
// export run entirely in the browser — no upload, no serverless CPU/size limits.
// The geometry mirrors the server renderer in lib/server/stamp.ts.

import { preserveExif } from './exif';
import { encodeHiFiJpeg } from './encode';

const FONT_FILES: Record<string, string> = {
  Arial: 'Arimo-Bold.ttf',
  'Times New Roman': 'Tinos-Bold.ttf',
  'Courier New': 'Cousine-Bold.ttf',
  Roboto: 'Roboto-Bold.ttf',
  Anton: 'Anton-Regular.ttf',
  'Bebas Neue': 'BebasNeue-Regular.ttf',
  'DM Serif Display': 'DMSerifDisplay-Regular.ttf',
};
const DEFAULT_FONT = 'Arial';
const DEFAULT_COLOR = '#ff7a1a';

const REF_LONG_EDGE = 4800;
const FONT_SIZE_RATIO = 130 / REF_LONG_EDGE;
const PADDING_RATIO = 300 / REF_LONG_EDGE;

const fontPromises = new Map<string, Promise<void>>();

/** Load (once) and register a bundled font so canvas can draw with it. */
function ensureFont(name: string): Promise<void> {
  const key = FONT_FILES[name] ? name : DEFAULT_FONT;
  let p = fontPromises.get(key);
  if (!p) {
    const face = new FontFace(key, `url(/fonts/${FONT_FILES[key]})`);
    p = face.load().then((loaded) => {
      document.fonts.add(loaded);
    });
    fontPromises.set(key, p);
  }
  return p;
}

function alignFor(position: string): CanvasTextAlign {
  if (position.endsWith('left')) return 'left';
  if (position.endsWith('center')) return 'center';
  return 'right';
}

function textCoords(
  w: number,
  h: number,
  position: string,
  padding: number,
  fontSize: number,
  offsetX: number,
  offsetY: number,
) {
  const dx = (offsetX / 100) * w;
  const dy = (offsetY / 100) * h;
  const baseline = h - padding + dy;
  const topline = padding + fontSize * 0.85 + dy;
  switch (position) {
    case 'bottom-left':
      return { x: padding + dx, y: baseline };
    case 'bottom-center':
      return { x: w / 2 + dx, y: baseline };
    case 'top-right':
      return { x: w - padding + dx, y: topline };
    case 'top-left':
      return { x: padding + dx, y: topline };
    case 'top-center':
      return { x: w / 2 + dx, y: topline };
    case 'bottom-right':
    default:
      return { x: w - padding + dx, y: baseline };
  }
}

export interface StampRenderOpts {
  fonts?: string[] | null;
  fontIndex?: number;
  color?: string;
  position?: string;
  fontSize?: number | null;
  offsetX?: number;
  offsetY?: number;
  quality?: number;
  /** Downscale the long edge for a fast preview; omit for a full-resolution export. */
  maxEdge?: number;
  /** Copy the original photo's EXIF (capture time, GPS, …) onto the output. */
  keepExif?: boolean;
}

export interface StampRenderResult {
  blob: Blob;
  fontSize: number;
  font: string;
}

function pickFont(opts: StampRenderOpts): string {
  const fonts = opts.fonts;
  if (Array.isArray(fonts) && fonts.length) return fonts[(opts.fontIndex ?? 0) % fonts.length];
  return DEFAULT_FONT;
}

function outputMime(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export async function stampImage(
  file: File,
  label: string,
  opts: StampRenderOpts,
): Promise<StampRenderResult> {
  const font = pickFont(opts);
  const [bitmap] = await Promise.all([
    // keepExif (export): don't let the browser convert wide-gamut pixels to
    // sRGB — we keep the raw values and re-attach the original ICC profile.
    createImageBitmap(file, {
      imageOrientation: 'from-image',
      colorSpaceConversion: opts.keepExif ? 'none' : 'default',
    }),
    ensureFont(font),
  ]);
  try {
    let w = bitmap.width;
    let h = bitmap.height;
    if (opts.maxEdge && Math.max(w, h) > opts.maxEdge) {
      const s = opts.maxEdge / Math.max(w, h);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布');
    ctx.drawImage(bitmap, 0, 0, w, h);

    const dim = Math.max(w, h);
    const fontSize =
      opts.fontSize && opts.fontSize > 0 ? opts.fontSize : Math.round(dim * FONT_SIZE_RATIO);
    const padding = Math.round(dim * PADDING_RATIO);
    const { x, y } = textCoords(
      w,
      h,
      opts.position || 'bottom-right',
      padding,
      fontSize,
      Number(opts.offsetX) || 0,
      Number(opts.offsetY) || 0,
    );

    ctx.font = `${fontSize}px "${font}"`;
    ctx.textAlign = alignFor(opts.position || 'bottom-right');
    ctx.textBaseline = 'alphabetic';
    // letterSpacing is missing from some TS DOM lib versions.
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${fontSize * 0.04}px`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, Math.round(fontSize / 18));
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.fillStyle = opts.color || DEFAULT_COLOR;
    // Stroke behind fill (SVG paint-order: stroke).
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);

    const mime = outputMime(file.name);
    const isJpeg = mime === 'image/jpeg' && /\.jpe?g$/i.test(file.name);

    // High-fidelity JPEG export: re-encode with mozjpeg matching the source's
    // chroma subsampling + ICC + EXIF, so only the watermark changes.
    if (opts.keepExif && isJpeg) {
      try {
        const imageData = ctx.getImageData(0, 0, w, h);
        return { blob: await encodeHiFiJpeg(file, imageData, w, h), fontSize, font };
      } catch {
        /* codec unavailable — fall back to canvas encode below */
      }
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, opts.quality ?? 0.95),
    );
    if (!blob) throw new Error('导出失败');
    // Re-attach the original EXIF (canvas strips it). Only JPEG carries it here.
    const out = opts.keepExif && mime === 'image/jpeg' ? await preserveExif(file, blob, w, h) : blob;
    return { blob: out, fontSize, font };
  } finally {
    bitmap.close();
  }
}

/** `<base>-stamped.<ext>`, preserving the original extension. */
export function stampedName(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}-stamped`;
  return `${name.slice(0, dot)}-stamped${name.slice(dot)}`;
}
