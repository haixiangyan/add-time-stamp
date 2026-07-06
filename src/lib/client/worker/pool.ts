// A small fixed-size Web Worker pool. Tasks are queued and dispatched to the
// next idle worker, so metadata reads and full-resolution stamps run with
// bounded parallelism across cores while the main thread stays free.

import type {
  MetaOk,
  MetaRequest,
  StampOk,
  StampRequest,
  WorkerRequest,
  WorkerResponse,
} from './protocol';
import type { StampRenderOpts } from '../render';

// Omit over a union collapses to the shared keys, so distribute it by hand to
// keep each variant's own fields.
type WorkerRequestInit = Omit<MetaRequest, 'id'> | Omit<StampRequest, 'id'>;

interface Pending {
  resolve: (res: WorkerResponse) => void;
  reject: (err: Error) => void;
}

interface Job {
  req: WorkerRequest;
  pending: Pending;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Job[] = [];
  private pending = new Map<number, Pending>();
  private seq = 0;

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      // Prebuilt by scripts/build-worker.mjs into public/worker/ — Turbopack's
      // `new Worker(new URL(...))` isn't compiled under output:export, so we load
      // our own ESM bundle by a stable path instead.
      const worker = new Worker('/worker/stamp.worker.js', { type: 'module' });
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onDone(worker, e.data);
      worker.onerror = (e) => this.onError(worker, e);
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  private onDone(worker: Worker, res: WorkerResponse) {
    const pending = this.pending.get(res.id);
    this.pending.delete(res.id);
    this.idle.push(worker);
    if (pending) {
      if (res.ok) pending.resolve(res);
      else pending.reject(new Error(res.error));
    }
    this.drain();
  }

  private onError(worker: Worker, e: ErrorEvent) {
    // A hard worker failure rejects whatever it was running; the worker is left
    // out of rotation (not pushed back to idle) so a broken one isn't reused.
    for (const [id, pending] of this.pending) {
      pending.reject(new Error(e.message || 'worker error'));
      this.pending.delete(id);
    }
    this.drain();
  }

  private drain() {
    while (this.queue.length && this.idle.length) {
      const worker = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.pending.set(job.req.id, job.pending);
      worker.postMessage(job.req);
    }
  }

  private run<T extends WorkerResponse>(req: WorkerRequestInit): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        req: { ...req, id } as WorkerRequest,
        pending: { resolve: resolve as (r: WorkerResponse) => void, reject },
      });
      this.drain();
    });
  }

  meta(file: File, thumbMaxEdge: number): Promise<MetaOk> {
    return this.run<MetaOk>({ type: 'meta', file, thumbMaxEdge });
  }

  stamp(
    file: File,
    date: { label: string | null; dateSource?: string; customDate?: string },
    opts: StampRenderOpts,
  ): Promise<StampOk> {
    return this.run<StampOk>({ type: 'stamp', file, ...date, opts });
  }

  terminate() {
    for (const worker of this.workers) worker.terminate();
    this.workers = [];
    this.idle = [];
  }
}
