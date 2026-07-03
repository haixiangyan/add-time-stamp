import encode, { init as initEncoder } from '@jsquash/jpeg/encode';
import piexif from 'piexifjs';
import { readIccSegments, readJpegFormat } from './jpeg';

// Serve the WASM ourselves and hand the compiled module to the codec, so we
// don't depend on the bundler locating the .wasm.
let encoderReady: Promise<void> | null = null;
function ensureEncoder(): Promise<void> {
  if (!encoderReady) {
    encoderReady = (async () => {
      const res = await fetch('/mozjpeg_enc.wasm');
      const wasm = await WebAssembly.compile(await res.arrayBuffer());
      await initEncoder(wasm);
    })();
  }
  return encoderReady;
}

function binToU8(s: string): Uint8Array {
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff;
  return a;
}

function u8ToBin(u8: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) s += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  return s;
}

// Build the APP1 (EXIF) segment from the original, with orientation reset to
// normal (pixels are already baked upright) and dimensions updated.
function buildExifApp1(headBytes: Uint8Array, w: number, h: number): Uint8Array | null {
  try {
    const exifObj = piexif.load(u8ToBin(headBytes));
    if (exifObj['0th']) exifObj['0th'][piexif.ImageIFD.Orientation] = 1;
    if (exifObj['Exif']) {
      exifObj['Exif'][piexif.ExifIFD.PixelXDimension] = w;
      exifObj['Exif'][piexif.ExifIFD.PixelYDimension] = h;
    }
    exifObj['1st'] = {};
    exifObj['thumbnail'] = null;
    const payload = binToU8(piexif.dump(exifObj)); // "Exif\0\0" + TIFF
    const len = payload.length + 2;
    if (len > 0xffff) return null;
    const seg = new Uint8Array(4 + payload.length);
    seg[0] = 0xff;
    seg[1] = 0xe1;
    seg[2] = (len >> 8) & 0xff;
    seg[3] = len & 0xff;
    seg.set(payload, 4);
    return seg;
  } catch {
    return null;
  }
}

/**
 * Re-encode the stamped pixels with mozjpeg, matching the source JPEG's chroma
 * subsampling (4:4:4 stays 4:4:4) and copying its EXIF + ICC color profile —
 * "only add a watermark, keep everything else". Falls to the caller's fallback
 * (via thrown error) if the codec can't run.
 */
export async function encodeHiFiJpeg(
  originalFile: File,
  imageData: ImageData,
  width: number,
  height: number,
): Promise<Blob> {
  await ensureEncoder();
  const origBytes = new Uint8Array(await originalFile.arrayBuffer());
  const { chromaSubsample, progressive } = readJpegFormat(origBytes);

  const encoded = new Uint8Array(
    await encode(imageData, {
      quality: 95,
      progressive,
      auto_subsample: false,
      chroma_subsample: chromaSubsample,
    }),
  );

  const app1 = buildExifApp1(origBytes.subarray(0, 256 * 1024), width, height);
  const icc = readIccSegments(origBytes);

  const parts: Uint8Array[] = [encoded.subarray(0, 2)]; // SOI
  if (app1) parts.push(app1);
  for (const seg of icc) parts.push(seg);
  parts.push(encoded.subarray(2));

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return new Blob([out as BlobPart], { type: 'image/jpeg' });
}
