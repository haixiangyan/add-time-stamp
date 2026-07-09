import exifr from 'exifr';
import type { ImageMeta } from '@/lib/stamp-settings';

// Serialize EXIF values for display: dates -> ISO strings, drop nested objects.
function sanitize(exif: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(exif)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === 'object' && v !== null) continue;
    else out[k] = v;
  }
  return out;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Read image metadata entirely in the browser (EXIF via exifr), so the stamp
 * date is available immediately with no upload — no serverless round-trip, no
 * 4.5MB request limit, and no race between the first preview and the date.
 * `stampDate` is stored as ISO so the UI can reformat it with any dateFormat.
 */
export async function readImageMeta(file: File): Promise<ImageMeta> {
  let exif: Record<string, unknown> | null = null;
  let width: number | undefined;
  let height: number | undefined;
  let stampDate: string | null = null;
  let latitude: number | undefined;
  let longitude: number | undefined;

  try {
    const parsed = (await exifr.parse(file)) as Record<string, unknown> | undefined;
    if (parsed) {
      exif = sanitize(parsed);
      width = num(parsed.ExifImageWidth) ?? num(parsed.ImageWidth);
      height = num(parsed.ExifImageHeight) ?? num(parsed.ImageHeight);
      const d = parsed.DateTimeOriginal ?? parsed.CreateDate ?? parsed.ModifyDate;
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        stampDate = d.toISOString();
      }
      const lat = num(parsed.latitude);
      const lng = num(parsed.longitude);
      if (lat !== undefined && lng !== undefined) {
        latitude = lat;
        longitude = lng;
      }
    }
  } catch {
    /* no/invalid EXIF — fall back to file time below */
  }

  if (!stampDate) {
    stampDate = new Date(file.lastModified).toISOString();
  }

  return {
    width,
    height,
    format: file.type ? file.type.replace(/^image\//, '') : undefined,
    exif,
    stampDate,
    latitude,
    longitude,
  };
}
