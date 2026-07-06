import { buildExifApp1 } from './encode';

// EXIF (incl. its embedded thumbnail) fits well within the first APP1 segment,
// so we only need the head of the original file to read it.
const HEAD_BYTES = 256 * 1024;

/**
 * Copy the original photo's EXIF (capture time, GPS, camera, …) onto the
 * canvas-rendered JPEG — canvas re-encoding otherwise strips all metadata, so
 * the photo library would fall back to the file's import time and lose GPS.
 * The original EXIF is spliced in verbatim (only Orientation is reset, since the
 * pixels are already baked upright); we avoid any EXIF-library round-trip because
 * it throws on Apple MakerNote and would drop everything. Any failure returns the
 * stamped image unchanged (metadata is best-effort).
 */
export async function preserveExif(originalFile: File, stampedBlob: Blob): Promise<Blob> {
  try {
    const head = new Uint8Array(await originalFile.slice(0, HEAD_BYTES).arrayBuffer());
    const app1 = buildExifApp1(head);
    if (!app1) return stampedBlob; // original has no readable EXIF

    const stamped = new Uint8Array(await stampedBlob.arrayBuffer());
    // Insert the EXIF APP1 right after the JPEG's SOI marker.
    if (stamped[0] !== 0xff || stamped[1] !== 0xd8) return stampedBlob;
    const out = new Uint8Array(2 + app1.length + (stamped.length - 2));
    out.set(stamped.subarray(0, 2), 0);
    out.set(app1, 2);
    out.set(stamped.subarray(2), 2 + app1.length);
    return new Blob([out as BlobPart], { type: 'image/jpeg' });
  } catch {
    return stampedBlob;
  }
}
