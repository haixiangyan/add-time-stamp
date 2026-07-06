import encode, { init as initEncoder } from '@jsquash/jpeg/encode';
import { readExifTiff, readIccSegments, readJpegFormat } from './jpeg';

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

// Overwrite the Orientation tag (0x0112) in a raw TIFF/EXIF block to 1 (normal),
// since the exported pixels are already baked upright. Everything else is left
// byte-for-byte intact. We deliberately do NOT round-trip through a full EXIF
// library (piexifjs throws "unpack error" on Apple MakerNote, which silently
// dropped ALL metadata — capture time, GPS — from every iPhone photo).
function patchTiffOrientation(tiff: Uint8Array): Uint8Array {
  const out = tiff.slice();
  if (out.length < 8) return out;
  const le = out[0] === 0x49 && out[1] === 0x49; // 'II' little-endian
  const be = out[0] === 0x4d && out[1] === 0x4d; // 'MM' big-endian
  if (!le && !be) return out;
  const rd16 = (o: number) => (le ? out[o] | (out[o + 1] << 8) : (out[o] << 8) | out[o + 1]);
  const rd32 = (o: number) =>
    le
      ? (out[o] | (out[o + 1] << 8) | (out[o + 2] << 16) | (out[o + 3] << 24)) >>> 0
      : ((out[o] << 24) | (out[o + 1] << 16) | (out[o + 2] << 8) | out[o + 3]) >>> 0;
  const wr16 = (o: number, v: number) => {
    if (le) {
      out[o] = v & 0xff;
      out[o + 1] = (v >> 8) & 0xff;
    } else {
      out[o] = (v >> 8) & 0xff;
      out[o + 1] = v & 0xff;
    }
  };
  const ifd0 = rd32(4);
  if (ifd0 + 2 > out.length) return out;
  const count = rd16(ifd0);
  let p = ifd0 + 2;
  for (let i = 0; i < count; i++, p += 12) {
    if (p + 12 > out.length) break;
    if (rd16(p) === 0x0112) {
      // Orientation is a SHORT stored inline in the entry's value field (p+8).
      wr16(p + 8, 1);
      break;
    }
  }
  return out;
}

// Wrap a raw TIFF/EXIF block into a JPEG APP1 ("Exif") segment (orientation reset
// to normal). Returns null if it can't fit in a single 64KB APP1 marker.
export function tiffToExifApp1(tiff: Uint8Array): Uint8Array | null {
  const patched = patchTiffOrientation(tiff);
  const payloadLen = 2 + 6 + patched.length; // length field + "Exif\0\0" + TIFF
  if (payloadLen > 0xffff) return null;
  const seg = new Uint8Array(2 + payloadLen);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  seg[2] = (payloadLen >> 8) & 0xff;
  seg[3] = payloadLen & 0xff;
  seg.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4); // "Exif\0\0"
  seg.set(patched, 10);
  return seg;
}

// Build the APP1 (EXIF) segment from an original JPEG's head bytes, or null if it
// carries no EXIF. Orientation is reset; all other tags are preserved verbatim.
export function buildExifApp1(headBytes: Uint8Array): Uint8Array | null {
  const tiff = readExifTiff(headBytes);
  return tiff ? tiffToExifApp1(tiff) : null;
}

/**
 * Re-encode the stamped pixels with mozjpeg, matching the source JPEG's chroma
 * subsampling (4:4:4 stays 4:4:4) and copying its EXIF + ICC color profile —
 * "only add a watermark, keep everything else". Falls to the caller's fallback
 * (via thrown error) if the codec can't run.
 */
export async function encodeHiFiJpeg(originalFile: File, imageData: ImageData): Promise<Blob> {
  const origBytes = new Uint8Array(await originalFile.arrayBuffer());
  const { chromaSubsample, progressive } = readJpegFormat(origBytes);
  return assembleJpeg(imageData, {
    chromaSubsample,
    progressive,
    app1: buildExifApp1(origBytes.subarray(0, 256 * 1024)),
    icc: readIccSegments(origBytes),
  });
}

interface JpegAssembleOpts {
  chromaSubsample: 1 | 2;
  progressive: boolean;
  app1: Uint8Array | null;
  icc: Uint8Array[];
}

/** Encode RGBA pixels with mozjpeg and splice in the given EXIF (APP1) + ICC segments. */
export async function assembleJpeg(
  imageData: ImageData,
  { chromaSubsample, progressive, app1, icc }: JpegAssembleOpts,
): Promise<Blob> {
  await ensureEncoder();
  const encoded = new Uint8Array(
    await encode(imageData, {
      quality: 95,
      progressive,
      auto_subsample: false,
      chroma_subsample: chromaSubsample,
    }),
  );

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
