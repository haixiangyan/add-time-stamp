// DOM-independent canvas + font helpers so the stamp/encode pipeline can run in
// both the main thread and a Web Worker. Prefers OffscreenCanvas (available in
// workers); falls back to a DOM <canvas> when it's missing (old Safari, and only
// reachable on the main thread). `getFontSet()` returns the FontFaceSet for the
// current global — `document.fonts` on the page, `self.fonts` in a worker.

export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
export type AnyCanvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

export function get2d(canvas: AnyCanvas): AnyCanvas2D {
  const ctx = canvas.getContext('2d') as AnyCanvas2D | null;
  if (!ctx) throw new Error('无法创建画布');
  return ctx;
}

export async function canvasToBlob(
  canvas: AnyCanvas,
  type: string,
  quality?: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality });
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
  if (!blob) throw new Error('导出失败');
  return blob;
}

/** The FontFaceSet for the current global (page or worker). */
export function getFontSet(): FontFaceSet {
  if (typeof document !== 'undefined') return document.fonts;
  return (self as unknown as { fonts: FontFaceSet }).fonts;
}
