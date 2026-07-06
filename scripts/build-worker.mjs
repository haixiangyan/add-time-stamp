// Bundle the stamp Web Worker with esbuild into public/worker/.
//
// Next/Turbopack's `new Worker(new URL(...))` isn't compiled under
// `output: export` (it copies the raw .ts to /media), so we build the worker
// ourselves into a plain ESM bundle the static host can serve directly. Code
// splitting is on so the heavy libheif (HEIC) chunk is only fetched on demand,
// matching the old lazy-import behavior.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [resolve(root, 'src/lib/client/worker/stamp.worker.ts')],
  outdir: resolve(root, 'public/worker'),
  entryNames: 'stamp.worker',
  chunkNames: 'chunks/[name]-[hash]',
  bundle: true,
  splitting: true,
  format: 'esm',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
  // Resolve the "@/..." path alias the same way the app does.
  tsconfig: resolve(root, 'tsconfig.json'),
  logLevel: 'info',
});

console.log('✓ built public/worker/stamp.worker.js');
