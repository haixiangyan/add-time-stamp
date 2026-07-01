'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const sharp = require('sharp');
const exifr = require('exifr');

const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif']);
const STAMP_SUFFIX = '-stamped';
const DEFAULT_COLOR = '#ff7a1a';
const DEFAULT_FONT = 'Helvetica';
const REF_LONG_EDGE = 4800;
const FONT_SIZE_RATIO = 130 / REF_LONG_EDGE;
const PADDING_RATIO = 300 / REF_LONG_EDGE;

const POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'bottom-center', 'top-center'];

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDate(d) {
  return `${d.getFullYear()} ${pad2(d.getMonth() + 1)} ${pad2(d.getDate())}`;
}

function isStamped(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return base.endsWith(STAMP_SUFFIX);
}

function stampMetrics(width, height, opts) {
  const dim = Math.max(width, height);
  return {
    fontSize: opts.fontSize ?? Math.round(dim * FONT_SIZE_RATIO),
    padding: opts.padding ?? Math.round(dim * PADDING_RATIO),
  };
}

function stampedPath(filePath) {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  return path.join(path.dirname(filePath), `${base}${STAMP_SUFFIX}${ext}`);
}

async function getDateFromBuffer(buffer, filePathOrFallback, source) {
  if (source === 'exif' || source === 'auto') {
    try {
      const exif = await exifr.parse(buffer, ['DateTimeOriginal', 'CreateDate', 'ModifyDate']);
      const d = exif && (exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate);
      if (d instanceof Date && !isNaN(d)) return d;
    } catch { /* fall through */ }
    if (source === 'exif') return null;
  }
  if (filePathOrFallback instanceof Date) return filePathOrFallback;
  if (typeof filePathOrFallback === 'string' && filePathOrFallback) {
    try {
      const st = await fsp.stat(filePathOrFallback);
      const bt = st.birthtime;
      if (bt && bt.getTime() > 0) return bt;
      return st.mtime;
    } catch { /* fall through */ }
  }
  return null;
}

async function getDate(filePath, source) {
  if (source === 'exif' || source === 'auto') {
    try {
      const exif = await exifr.parse(filePath, ['DateTimeOriginal', 'CreateDate', 'ModifyDate']);
      const d = exif && (exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate);
      if (d instanceof Date && !isNaN(d)) return d;
    } catch { /* fall through */ }
    if (source === 'exif') return null;
  }
  const st = await fsp.stat(filePath);
  const bt = st.birthtime;
  if (bt && bt.getTime() > 0) return bt;
  return st.mtime;
}

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

function textAnchor(position) {
  if (position.endsWith('left')) return 'start';
  if (position.endsWith('center')) return 'middle';
  return 'end';
}

function textCoords(imgW, imgH, position, padding, fontSize) {
  const baseline = imgH - padding;
  const topline = padding + fontSize * 0.85;
  switch (position) {
    case 'bottom-right': return { x: imgW - padding, y: baseline, anchor: 'end' };
    case 'bottom-left': return { x: padding, y: baseline, anchor: 'start' };
    case 'bottom-center': return { x: imgW / 2, y: baseline, anchor: 'middle' };
    case 'top-right': return { x: imgW - padding, y: topline, anchor: 'end' };
    case 'top-left': return { x: padding, y: topline, anchor: 'start' };
    case 'top-center': return { x: imgW / 2, y: topline, anchor: 'middle' };
    default: return { x: imgW - padding, y: baseline, anchor: 'end' };
  }
}

function buildOverlaySvg(imgW, imgH, text, { fontSize, padding, color, font, position = 'bottom-right' }) {
  const { x, y, anchor } = textCoords(imgW, imgH, position, padding, fontSize);
  const stroke = Math.max(1, Math.round(fontSize / 18));
  const safe = escapeXml(text);
  return Buffer.from(
    `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">
  <text x="${x}" y="${y}"
    font-family="${font}" font-size="${fontSize}" font-weight="600"
    text-anchor="${anchor}" letter-spacing="${fontSize * 0.04}"
    fill="${color}" stroke="rgba(0,0,0,0.4)" stroke-width="${stroke}"
    paint-order="stroke">${safe}</text>
</svg>`
  );
}

function applyEncoding(pipeline, ext, quality, meta) {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return pipeline.jpeg({
        quality,
        chromaSubsampling: meta.chromaSubsampling === '4:4:4' ? '4:4:4' : '4:2:0',
        progressive: !!meta.isProgressive,
        mozjpeg: false,
      });
    case '.png':
      return pipeline.png({ compressionLevel: 9 });
    case '.webp':
      return pipeline.webp({ quality });
    case '.tiff':
    case '.tif':
      return pipeline.tiff({ quality, compression: 'jpeg' });
    default:
      return pipeline;
  }
}

async function copyFileTimes(src, dest) {
  const st = await fsp.stat(src);
  await fsp.utimes(dest, st.atime, st.mtime);
  if (process.platform === 'darwin') {
    const d = st.birthtime && st.birthtime.getTime() > 0 ? st.birthtime : st.mtime;
    const fmt =
      `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()} ` +
      `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    await new Promise((resolve) => {
      execFile('SetFile', ['-d', fmt, dest], () => resolve());
    });
  }
}

async function extractMetadata(buffer) {
  const img = sharp(buffer, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  let exif = null;
  try {
    exif = await exifr.parse(buffer);
  } catch { /* ignore */ }
  const date = await getDateFromBuffer(buffer, null, 'auto');
  return {
    width: meta.width,
    height: meta.height,
    format: meta.format,
    space: meta.space,
    channels: meta.channels,
    density: meta.density,
    hasAlpha: meta.hasAlpha,
    isProgressive: meta.isProgressive,
    chromaSubsampling: meta.chromaSubsampling,
    exif: exif ? sanitizeExif(exif) : null,
    stampDate: date ? formatDate(date) : null,
  };
}

function sanitizeExif(exif) {
  const out = {};
  for (const [k, v] of Object.entries(exif)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === 'object' && v !== null) continue;
    else out[k] = v;
  }
  return out;
}

async function stampBuffer(inputBuffer, originalName, opts) {
  const ext = path.extname(originalName).toLowerCase();
  if (!SUPPORTED.has(ext)) {
    throw new Error(`不支持的格式: ${ext}`);
  }

  const fallback = opts.fallbackDate ? new Date(opts.fallbackDate) : null;
  const date = await getDateFromBuffer(inputBuffer, fallback, opts.dateSource || 'auto');
  if (!date) throw new Error('无法获取日期');
  const label = formatDate(date);

  const img = sharp(inputBuffer, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error('无法读取图片');

  const { fontSize, padding } = stampMetrics(meta.width, meta.height, opts);
  const svg = buildOverlaySvg(meta.width, meta.height, label, {
    fontSize,
    padding,
    color: opts.color || DEFAULT_COLOR,
    font: opts.font || DEFAULT_FONT,
    position: opts.position || 'bottom-right',
  });

  let pipeline = img.composite([{ input: svg, top: 0, left: 0 }]).withMetadata();
  pipeline = applyEncoding(pipeline, ext, opts.quality ?? 100, meta);
  const outBuffer = await pipeline.toBuffer();
  const base = path.basename(originalName, ext);
  const outName = `${base}${STAMP_SUFFIX}${ext}`;
  return { buffer: outBuffer, outName, label };
}

async function stampPreviewBuffer(inputBuffer, originalName, opts) {
  const ext = path.extname(originalName).toLowerCase();
  if (!SUPPORTED.has(ext)) throw new Error(`不支持的格式: ${ext}`);

  const fallback = opts.fallbackDate ? new Date(opts.fallbackDate) : null;
  const date = await getDateFromBuffer(inputBuffer, fallback, opts.dateSource || 'auto');
  if (!date) throw new Error('无法获取日期');
  const label = formatDate(date);

  const maxEdge = opts.previewMaxEdge ?? 1400;
  let pipeline = sharp(inputBuffer, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) throw new Error('无法读取图片');

  const longEdge = Math.max(meta.width, meta.height);
  if (longEdge > maxEdge) {
    pipeline = pipeline.resize({
      width: meta.width >= meta.height ? maxEdge : undefined,
      height: meta.height > meta.width ? maxEdge : undefined,
      withoutEnlargement: true,
    });
  }

  const baseBuffer = await pipeline.toBuffer();
  const base = sharp(baseBuffer);
  const sized = await base.metadata();
  const w = sized.width;
  const h = sized.height;
  if (!w || !h) throw new Error('无法读取图片');

  const { fontSize, padding } = stampMetrics(w, h, opts);
  const svg = buildOverlaySvg(w, h, label, {
    fontSize,
    padding,
    color: opts.color || DEFAULT_COLOR,
    font: opts.font || DEFAULT_FONT,
    position: opts.position || 'bottom-right',
  });

  const buffer = await base
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
  return { buffer, label };
}

async function processOne(filePath, opts) {
  const name = path.basename(filePath);
  const destPath = stampedPath(filePath);

  const date = await getDate(filePath, opts.dateSource);
  if (!date) return { file: name, status: 'no date, skipped', ok: false };
  const label = formatDate(date);

  const img = sharp(filePath, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) {
    return { file: name, status: 'unreadable, skipped', ok: false };
  }

  const { fontSize, padding } = stampMetrics(meta.width, meta.height, opts);

  const svg = buildOverlaySvg(meta.width, meta.height, label, {
    fontSize, padding, color: opts.color, font: opts.font, position: opts.position,
  });
  let pipeline = img.composite([{ input: svg, top: 0, left: 0 }]).withMetadata();
  pipeline = applyEncoding(pipeline, path.extname(filePath), opts.quality, meta);

  await pipeline.toFile(destPath);
  await copyFileTimes(filePath, destPath);
  return { file: name, status: `ok (${label}) -> ${path.basename(destPath)}`, ok: true };
}

async function collectImages(dir, recursive) {
  const out = [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive) out.push(...await collectImages(full, recursive));
    } else if (SUPPORTED.has(path.extname(e.name).toLowerCase()) && !isStamped(e.name)) {
      out.push(full);
    }
  }
  return out;
}

module.exports = {
  SUPPORTED,
  STAMP_SUFFIX,
  DEFAULT_COLOR,
  DEFAULT_FONT,
  POSITIONS,
  formatDate,
  isStamped,
  stampMetrics,
  stampedPath,
  getDate,
  getDateFromBuffer,
  buildOverlaySvg,
  applyEncoding,
  copyFileTimes,
  extractMetadata,
  stampBuffer,
  stampPreviewBuffer,
  processOne,
  collectImages,
};
