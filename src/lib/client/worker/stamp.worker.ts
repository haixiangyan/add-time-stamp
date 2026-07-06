// Stamp Web Worker: runs the CPU-heavy work (EXIF parse, HEIC decode, canvas
// draw, mozjpeg encode) off the main thread so the UI stays responsive, and so a
// pool of these can render a batch in parallel across cores. All the heavy libs
// (exifr, libheif, @jsquash/jpeg) are worker-compatible; rendering uses
// OffscreenCanvas via the shared canvas helpers.

import { readImageMeta } from '../metadata';
import { isHeif, heifThumbnailBlob } from '../heif';
import { stampImage } from '../render';
import type { WorkerRequest, WorkerResponse } from './protocol';

const ctx = self as unknown as {
  postMessage(msg: WorkerResponse): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

ctx.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'meta') {
      // HEIC/HEIF can't render from a raw object URL outside Safari — decode a
      // downscaled JPEG thumbnail here so the filmstrip/preview show something.
      let thumb: Blob | null = null;
      if (isHeif(msg.file)) {
        try {
          thumb = await heifThumbnailBlob(msg.file, msg.thumbMaxEdge);
        } catch {
          /* thumbnail is best-effort */
        }
      }
      const meta = await readImageMeta(msg.file);
      ctx.postMessage({ type: 'meta', id: msg.id, ok: true, meta, thumb });
    } else if (msg.type === 'stamp') {
      // Resolve the stamp text here when the caller didn't precompute it (lazy
      // export): 'custom' uses the literal text, otherwise fall back to EXIF /
      // file time via readImageMeta.stampDate.
      let label = msg.label;
      if (!label) {
        label =
          msg.dateSource === 'custom'
            ? msg.customDate || null
            : (await readImageMeta(msg.file)).stampDate;
      }
      if (!label) {
        ctx.postMessage({ type: 'stamp', id: msg.id, ok: true, skipped: true, blob: null, fontSize: 0, font: '' });
        return;
      }
      const { blob, fontSize, font } = await stampImage(msg.file, label, msg.opts);
      ctx.postMessage({ type: 'stamp', id: msg.id, ok: true, skipped: false, blob, fontSize, font });
    }
  } catch (err) {
    ctx.postMessage({ id: msg.id, ok: false, error: (err as Error).message || '处理失败' });
  }
};
