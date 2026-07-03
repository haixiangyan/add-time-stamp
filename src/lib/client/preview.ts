import type { ImageItem } from '@/lib/stamp-settings';

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
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    if (!blob) throw new Error('toBlob failed');
    return blob;
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
 * Returns an ISO string (formatted to `YYYY MM DD` server-side) or null when the
 * selected source has no date.
 */
export function resolveDateIso(item: ImageItem, dateSource: string, customDate?: string): string | null {
  const fileIso = new Date(item.file.lastModified).toISOString();
  const exif = exifDateIso(item.meta);
  return exif ?? fileIso; // auto
}

/** Format an ISO timestamp as the `YYYY MM DD` stamp label (UTC, matching the server). */
export function formatStampLabel(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()} ${p(d.getUTCMonth() + 1)} ${p(d.getUTCDate())}`;
}

/**
 * The stamp label for an item. For `auto` we reuse the server-computed
 * `meta.stampDate` so it matches the thumbnail badge exactly; otherwise we
 * resolve and format the date on the client. For `custom` the raw text is
 * returned as-is (no validation, no formatting).
 */
export function resolveStampLabel(
  item: ImageItem,
  dateSource: string,
  customDate?: string,
): string | null {
  if (dateSource === 'custom') return customDate || null;
  if (dateSource === 'auto' && item.meta?.stampDate) return item.meta.stampDate;
  const iso = resolveDateIso(item, dateSource, customDate);
  return iso ? formatStampLabel(iso) : null;
}
