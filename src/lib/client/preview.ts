import type { ImageItem } from '@/lib/stamp-settings';
import { DEFAULT_DATE_FORMAT } from '@/lib/stamp-settings';
import { createCanvas, get2d, canvasToBlob } from './canvas';

// Matches the server's preview downscale (stampPreviewBuffer previewMaxEdge).
export const PREVIEW_MAX_EDGE = 1400;

/**
 * Downscale an image in the browser so the preview upload is a few hundred KB
 * instead of several MB. EXIF orientation is baked in and metadata is stripped,
 * so the server no longer decodes a full-resolution photo on every settings
 * change — the dominant cost of the old preview flow.
 */
export async function makePreviewBlob(file: File, maxEdge = PREVIEW_MAX_EDGE): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = createCanvas(w, h);
    const ctx = get2d(canvas);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await canvasToBlob(canvas, 'image/jpeg', 0.85);
  } finally {
    bitmap.close();
  }
}

function exifDateIso(meta: ImageItem['meta']): string | null {
  const ex = meta?.exif as Record<string, unknown> | null | undefined;
  if (!ex) return null;
  const raw = ex.DateTimeOriginal ?? ex.CreateDate ?? ex.ModifyDate;
  return typeof raw === 'string' ? raw : null;
}

/**
 * Resolve the stamp timestamp on the client, mirroring the server's date logic.
 * Needed because the downscaled preview image has no EXIF for the server to read.
 * Returns an ISO string or null when the selected source has no date.
 */
export function resolveDateIso(item: ImageItem, dateSource: string, customDate?: string): string | null {
  const fileIso = new Date(item.file.lastModified).toISOString();
  const exif = exifDateIso(item.meta);
  return exif ?? fileIso; // auto
}

/** Format an ISO timestamp with the given pattern (UTC). */
export function formatStampLabel(iso: string, format: string = DEFAULT_DATE_FORMAT): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = String(d.getUTCFullYear());
  const yy = yyyy.slice(-2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return format
    .replace(/yyyy/g, yyyy)
    .replace(/yy/g, yy)
    .replace(/mm/g, mm)
    .replace(/dd/g, dd);
}

/**
 * The stamp label for an item. For `custom` the raw text is returned as-is.
 * Otherwise the date is formatted with `dateFormat`.
 */
export function resolveStampLabel(
  item: ImageItem,
  dateSource: string,
  customDate?: string,
  dateFormat: string = DEFAULT_DATE_FORMAT,
): string | null {
  if (dateSource === 'custom') return customDate || null;
  const iso =
    dateSource === 'auto' && item.meta?.stampDate
      ? item.meta.stampDate
      : resolveDateIso(item, dateSource, customDate);
  return iso ? formatStampLabel(iso, dateFormat) : null;
}
