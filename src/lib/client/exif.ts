import piexif from 'piexifjs';

// EXIF (incl. its embedded thumbnail) fits well within the first APP1 segment,
// so we only need the head of the original file to read it.
const HEAD_BYTES = 256 * 1024;

function u8ToBinaryString(u8: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  }
  return s;
}

function binaryStringToU8(s: string): Uint8Array {
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i) & 0xff;
  return u8;
}

/**
 * Copy the original photo's EXIF (capture time, GPS, camera, …) onto the
 * canvas-rendered JPEG — canvas re-encoding otherwise strips all metadata, so
 * the photo library would fall back to the file's import time and lose GPS.
 * Orientation is reset to normal because the pixels are already baked upright.
 * Any failure returns the stamped image unchanged (metadata is best-effort).
 */
export async function preserveExif(
  originalFile: File,
  stampedBlob: Blob,
  width: number,
  height: number,
): Promise<Blob> {
  try {
    const head = u8ToBinaryString(
      new Uint8Array(await originalFile.slice(0, HEAD_BYTES).arrayBuffer()),
    );
    let exifObj;
    try {
      exifObj = piexif.load(head);
    } catch {
      return stampedBlob; // original has no readable EXIF
    }
    if (exifObj['0th']) exifObj['0th'][piexif.ImageIFD.Orientation] = 1;
    if (exifObj['Exif']) {
      exifObj['Exif'][piexif.ExifIFD.PixelXDimension] = width;
      exifObj['Exif'][piexif.ExifIFD.PixelYDimension] = height;
    }
    // Drop the stale (unstamped, pre-rotation) embedded thumbnail.
    exifObj['1st'] = {};
    exifObj['thumbnail'] = null;

    const exifBytes = piexif.dump(exifObj);
    const stampedStr = u8ToBinaryString(new Uint8Array(await stampedBlob.arrayBuffer()));
    return new Blob([binaryStringToU8(piexif.insert(exifBytes, stampedStr)) as BlobPart], {
      type: 'image/jpeg',
    });
  } catch {
    return stampedBlob;
  }
}
