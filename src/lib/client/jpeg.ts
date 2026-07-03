// Minimal JPEG marker walker: reads the source's chroma subsampling / progressive
// flag (so we can re-encode to match it) and copies its ICC color profile.

function isStandalone(marker: number): boolean {
  // SOI, EOI, RSTn, TEM — no length field.
  return marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01;
}

export interface JpegFormat {
  /** 1 = keep full chroma (4:4:4 / 4:2:2), 2 = 4:2:0. Never subsamples more than the source. */
  chromaSubsample: 1 | 2;
  progressive: boolean;
}

export function readJpegFormat(bytes: Uint8Array): JpegFormat {
  let i = 2; // skip SOI
  const n = bytes.length;
  while (i + 4 <= n) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (isStandalone(marker)) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xda) break; // start of scan — no frame header found
    const isSOF =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      const progressive = marker === 0xc2 || marker === 0xc6 || marker === 0xca || marker === 0xce;
      // frame: precision(1) @i+4, height(2), width(2), Nf(1) @i+9, then components
      const samp = bytes[i + 11]; // first component's sampling byte (H<<4 | V)
      const h = samp >> 4;
      const v = samp & 0x0f;
      const chromaSubsample = h === 2 && v === 2 ? 2 : 1;
      return { chromaSubsample, progressive };
    }
    i += 2 + len;
  }
  return { chromaSubsample: 2, progressive: true };
}

/** Raw APP2 ICC_PROFILE segment(s) from the source, to copy verbatim into the output. */
export function readIccSegments(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  const sig = 'ICC_PROFILE\0';
  let i = 2;
  const n = bytes.length;
  while (i + 4 <= n) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (isStandalone(marker)) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xda) break;
    if (marker === 0xe2) {
      let match = true;
      for (let k = 0; k < sig.length; k++) {
        if (bytes[i + 4 + k] !== sig.charCodeAt(k)) {
          match = false;
          break;
        }
      }
      if (match) out.push(bytes.slice(i, i + 2 + len));
    }
    i += 2 + len;
  }
  return out;
}
