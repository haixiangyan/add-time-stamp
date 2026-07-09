// Message protocol shared between the main thread and the stamp Web Worker.
// File/Blob travel by structured clone (no byte copy of the backing data), so we
// pass the original File in and get the rendered Blob back.

import type { StampRenderOpts } from '../render';
import type { ImageMeta } from '@/lib/stamp-settings';

export interface MetaRequest {
  type: 'meta';
  id: number;
  file: File;
  /** Long-edge cap for the HEIC preview thumbnail (ignored for other formats). */
  thumbMaxEdge: number;
}

export interface StampRequest {
  type: 'stamp';
  id: number;
  file: File;
  /** Pre-resolved stamp text. When null, the worker resolves it from EXIF using
   *  dateSource/customDate/dateFormat — so a large export doesn't need every meta preloaded. */
  label: string | null;
  dateSource?: string;
  customDate?: string;
  dateFormat?: string;
  opts: StampRenderOpts;
}

export type WorkerRequest = MetaRequest | StampRequest;

interface OkBase {
  id: number;
  ok: true;
}
interface ErrResponse {
  id: number;
  ok: false;
  error: string;
}

export interface MetaOk extends OkBase {
  type: 'meta';
  meta: ImageMeta;
  /** Decoded HEIC preview thumbnail, or null for formats the browser renders directly. */
  thumb: Blob | null;
}

export interface StampOk extends OkBase {
  type: 'stamp';
  /** true when there was no resolvable date and nothing was rendered. */
  skipped: boolean;
  blob: Blob | null;
  fontSize: number;
  font: string;
}

export type WorkerResponse = MetaOk | StampOk | ErrResponse;
