// HEIF/HEIC support: decode with libheif (wasm) since browsers other than
// Safari can't decode HEIC via createImageBitmap, and pull the original EXIF
// (capture time / GPS) out of the ISOBMFF container so the exported JPEG keeps
// it. The libheif bundle is loaded lazily — only when a HEIC file appears.

import { tiffToExifApp1 } from './encode';
import { createCanvas, get2d, canvasToBlob } from './canvas';

type LibheifModule = typeof import('libheif-js/wasm-bundle').default;

let libheifPromise: Promise<LibheifModule> | null = null;
function loadLibheif(): Promise<LibheifModule> {
  if (!libheifPromise) {
    libheifPromise = import('libheif-js/wasm-bundle').then(
      (m) => (m as { default: LibheifModule }).default ?? (m as unknown as LibheifModule),
    );
  }
  return libheifPromise;
}

export function isHeif(file: File): boolean {
  const t = file.type.toLowerCase();
  if (t === 'image/heic' || t === 'image/heif') return true;
  return /\.(heic|heif)$/i.test(file.name);
}

/** Decode a HEIC/HEIF file to RGBA pixels (orientation already applied by libheif). */
export async function decodeHeif(file: File): Promise<ImageData> {
  const libheif = await loadLibheif();
  const buf = new Uint8Array(await file.arrayBuffer());
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(buf);
  if (!images || !images.length) throw new Error('HEIC 解码失败');
  const image = images[0];
  const width = image.get_width();
  const height = image.get_height();
  const imageData = new ImageData(width, height);
  await new Promise<void>((resolve, reject) => {
    image.display(imageData, (data) => (data ? resolve() : reject(new Error('HEIC 解码失败'))));
  });
  return imageData;
}

/** Decode a HEIC/HEIF file to a downscaled JPEG blob for use as a UI thumbnail. */
export async function heifThumbnailBlob(file: File, maxEdge: number): Promise<Blob> {
  const src = await decodeHeif(file);
  const scale = Math.min(1, maxEdge / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const bitmap = await createImageBitmap(src);
  try {
    const canvas = createCanvas(w, h);
    const ctx = get2d(canvas);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await canvasToBlob(canvas, 'image/jpeg', 0.8);
  } finally {
    bitmap.close();
  }
}

// --- ISOBMFF walk: find the raw EXIF (TIFF) payload inside the HEIF container ---

function readU32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function readUint(b: Uint8Array, o: number, size: number): number {
  let v = 0;
  for (let i = 0; i < size; i++) v = v * 256 + b[o + i];
  return v;
}

interface Box {
  type: string;
  start: number; // offset of the box header
  dataStart: number; // offset of the box payload
  end: number; // offset just past the box
}

function readBox(b: Uint8Array, o: number): Box | null {
  if (o + 8 > b.length) return null;
  let size = readU32(b, o);
  let header = 8;
  if (size === 1) {
    // 64-bit largesize — only the low 32 bits are realistic here.
    size = readUint(b, o + 8, 8);
    header = 16;
  } else if (size === 0) {
    size = b.length - o;
  }
  const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
  return { type, start: o, dataStart: o + header, end: o + size };
}

function findBox(b: Uint8Array, start: number, end: number, type: string): Box | null {
  let o = start;
  while (o + 8 <= end) {
    const box = readBox(b, o);
    if (!box) break;
    if (box.type === type) return box;
    o = box.end > o ? box.end : o + 8;
  }
  return null;
}

// Locate the Exif item id from 'iinf', then its file offset/length from 'iloc'.
function findExifExtent(b: Uint8Array, meta: Box): { offset: number; length: number } | null {
  const iinf = findBox(b, meta.dataStart, meta.end, 'iinf');
  const iloc = findBox(b, meta.dataStart, meta.end, 'iloc');
  if (!iinf || !iloc) return null;

  let exifId = -1;
  {
    let o = iinf.dataStart + 4; // FullBox version+flags
    const version = b[iinf.dataStart];
    const countSize = version === 0 ? 2 : 4;
    o += countSize;
    while (o + 8 <= iinf.end) {
      const infe = readBox(b, o);
      if (!infe || infe.type !== 'infe') break;
      const v = b[infe.dataStart];
      let p = infe.dataStart + 4;
      const idSize = v < 3 ? 2 : 4;
      const itemId = readUint(b, p, idSize);
      p += idSize + 2; // + protection_index
      const itemType = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
      if (itemType === 'Exif') {
        exifId = itemId;
        break;
      }
      o = infe.end;
    }
  }
  if (exifId < 0) return null;

  {
    const version = b[iloc.dataStart];
    let p = iloc.dataStart + 4;
    const sizes = b[p];
    const offsetSize = sizes >> 4;
    const lengthSize = sizes & 0x0f;
    const baseSizes = b[p + 1];
    const baseOffsetSize = baseSizes >> 4;
    p += 2;
    const itemCountSize = version < 2 ? 2 : 4;
    const itemCount = readUint(b, p, itemCountSize);
    p += itemCountSize;
    for (let i = 0; i < itemCount; i++) {
      const idSize = version < 2 ? 2 : 4;
      const itemId = readUint(b, p, idSize);
      p += idSize;
      if (version === 1 || version === 2) p += 2; // construction_method
      p += 2; // data_reference_index
      const baseOffset = readUint(b, p, baseOffsetSize);
      p += baseOffsetSize;
      const extentCount = readUint(b, p, 2);
      p += 2;
      let first: { offset: number; length: number } | null = null;
      for (let e = 0; e < extentCount; e++) {
        const extentOffset = readUint(b, p, offsetSize);
        p += offsetSize;
        const extentLength = readUint(b, p, lengthSize);
        p += lengthSize;
        if (e === 0) first = { offset: baseOffset + extentOffset, length: extentLength };
      }
      if (itemId === exifId && first) return first;
    }
  }
  return null;
}

/**
 * Build a JPEG APP1 (EXIF) segment from a HEIC/HEIF file, with orientation reset
 * to normal — mirrors the JPEG path so the exported JPEG keeps the original
 * capture time / GPS. Returns null if no EXIF is present. The raw TIFF is spliced
 * verbatim (no EXIF-library round-trip) so Apple MakerNote data can't break it.
 */
export function heifExifApp1(bytes: Uint8Array): Uint8Array | null {
  try {
    const meta = findBox(bytes, 0, bytes.length, 'meta');
    // 'meta' is a FullBox: skip its 4-byte version/flags before the child boxes.
    if (!meta) return null;
    const metaChildren: Box = { ...meta, dataStart: meta.dataStart + 4 };
    const extent = findExifExtent(bytes, metaChildren);
    if (!extent || extent.length < 4) return null;

    const block = bytes.subarray(extent.offset, extent.offset + extent.length);
    // ExifDataBlock = uint32 tiff_header_offset, then the TIFF payload.
    const tiffOffset = readU32(block, 0);
    const tiff = block.subarray(4 + tiffOffset);
    if (tiff.length < 8) return null;

    return tiffToExifApp1(tiff);
  } catch {
    return null;
  }
}
