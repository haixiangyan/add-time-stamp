#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const sharp = require('sharp');
const exifr = require('exifr');

const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif']);
const STAMP_SUFFIX = '-stamped';
const DEFAULT_COLOR = '#ff7a1a'; // 经典相机日期戳的橙色
const DEFAULT_FONT = "Helvetica"; // 怀旧衬线体
const REF_LONG_EDGE = 4800; // test/R0001918.JPG 调校基准
const FONT_SIZE_RATIO = 130 / REF_LONG_EDGE;
const PADDING_RATIO = 300 / REF_LONG_EDGE;

function parseArgs(argv) {
  const opts = {
    input: null,
    fontSize: null,
    padding: null,
    color: DEFAULT_COLOR,
    font: DEFAULT_FONT,
    quality: 100,     // JPEG/WebP 质量 (默认贴近原图体积; 调低可省空间且肉眼无差)
    dateSource: 'auto', // auto | exif | file
    recursive: false,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '-s':
      case '--size': opts.fontSize = Number(next()); break;
      case '--font': opts.font = next(); break;
      case '-p':
      case '--padding': opts.padding = Number(next()); break;
      case '-c':
      case '--color': opts.color = next(); break;
      case '-q':
      case '--quality': opts.quality = Number(next()); break;
      case '--date-source': opts.dateSource = next(); break;
      case '-r':
      case '--recursive': opts.recursive = true; break;
      case '-h':
      case '--help': opts.help = true; break;
      default:
        if (a.startsWith('-')) {
          console.error(`Unknown option: ${a}`);
          process.exit(1);
        }
        rest.push(a);
    }
  }
  opts.input = rest[0] || process.cwd();
  return opts;
}

function printHelp() {
  console.log(`
time-stamp — 给图片生成带怀旧日期戳的副本（右下角橙色 YYYY MM DD）。

用法:
  time-stamp <图片文件 | 目录> [选项]

说明:
  - 输入可以是单个图片文件, 也可以是一个目录(处理其中所有图片)。
  - 生成的副本叫 <原名>-stamped.<后缀>, 与原图放在同一目录, 不改动原图。
  - 作为输入时会跳过 *-stamped.* 文件(避免重复加水印), 但其余图片都会处理;
    若同名的 -stamped 副本已存在, 会被直接覆盖。

选项:
  -s, --size <px>        字号(像素); 不传则按图片长边比例 (基准 ${REF_LONG_EDGE}px → ${130}px)
      --font <css>       字体 (默认: ${DEFAULT_FONT})
  -p, --padding <px>     右/下内边距(像素); 不传则按比例 (基准 ${REF_LONG_EDGE}px → ${300}px)
  -c, --color <css>      字体颜色 (默认: ${DEFAULT_COLOR})
  -q, --quality <1-100>  JPEG/WebP 质量 (默认: 100; 色度抽样/渐进等编码跟随原图)
      --date-source <s>  日期来源: auto | exif | file (默认: auto)
                         auto = 优先 EXIF 拍摄日期, 取不到则用文件创建/修改时间
  -r, --recursive        目录模式下递归处理子目录
  -h, --help             显示帮助

示例:
  time-stamp photo.jpg
  time-stamp ~/Pictures/2008 -r
  time-stamp photo.jpg -s 80 -c '#ff9500'
`);
}

function pad2(n) { return String(n).padStart(2, '0'); }

// 经典相机日期戳格式: "2026 04 20"
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

/* ---------- 文字渲染(系统字体) ---------- */

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

// 生成日期戳的覆盖层 SVG, 右下角对齐, 带轻微阴影增强可读性
function buildOverlaySvg(imgW, imgH, text, { fontSize, padding, color, font }) {
  const x = imgW - padding;
  const y = imgH - padding;            // 文字基线
  const stroke = Math.max(1, Math.round(fontSize / 18));
  const safe = escapeXml(text);
  return Buffer.from(
    `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">
  <text x="${x}" y="${y}"
    font-family="${font}" font-size="${fontSize}" font-weight="600"
    text-anchor="end" letter-spacing="${fontSize * 0.04}"
    fill="${color}" stroke="rgba(0,0,0,0.4)" stroke-width="${stroke}"
    paint-order="stroke">${safe}</text>
</svg>`
  );
}

/* ---------- 编码 / 文件处理 ---------- */

// 编码参数尽量"跟随原图": 格式跟扩展名, JPEG 的色度抽样/渐进跟原图, 不强加额外优化
function applyEncoding(pipeline, ext, quality, meta) {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return pipeline.jpeg({
        quality,
        // 跟随原图的色度抽样(4:2:0 / 4:4:4); sharp 仅接受这两档, 其余回退 4:2:0
        chromaSubsampling: meta.chromaSubsampling === '4:4:4' ? '4:4:4' : '4:2:0',
        progressive: !!meta.isProgressive, // 跟随原图: 基线 / 渐进
        mozjpeg: false,                     // 不擅自优化编码, 保持普通 JPEG
      });
    case '.png':
      return pipeline.png({ compressionLevel: 9 }); // PNG 本就无损
    case '.webp':
      return pipeline.webp({ quality });
    case '.tiff':
    case '.tif':
      return pipeline.tiff({ quality, compression: 'jpeg' });
    default:
      return pipeline;
  }
}

// 让副本继承原图的文件时间, 放回相册不会乱序
async function copyFileTimes(src, dest) {
  const st = await fsp.stat(src);
  // mtime/atime
  await fsp.utimes(dest, st.atime, st.mtime);
  // macOS: 设置"创建日期"(birthtime); 副本刚生成, birthtime=现在, 用 SetFile 改成原图的
  if (process.platform === 'darwin') {
    const d = st.birthtime && st.birthtime.getTime() > 0 ? st.birthtime : st.mtime;
    const fmt =
      `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()} ` +
      `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    await new Promise((resolve) => {
      execFile('SetFile', ['-d', fmt, dest], () => resolve()); // 无 SetFile 时静默跳过
    });
  }
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
    fontSize, padding, color: opts.color, font: opts.font,
  });
  let pipeline = img.composite([{ input: svg, top: 0, left: 0 }]).withMetadata();
  pipeline = applyEncoding(pipeline, path.extname(filePath), opts.quality, meta);

  await pipeline.toFile(destPath);
  await copyFileTimes(filePath, destPath);
  return { file: name, status: `ok (${label}) -> ${path.basename(destPath)}`, ok: true };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return printHelp();

  if (!fs.existsSync(opts.input)) {
    console.error(`输入不存在: ${opts.input}`);
    process.exit(1);
  }

  const stat = fs.statSync(opts.input);
  let images;
  if (stat.isDirectory()) {
    images = await collectImages(opts.input, opts.recursive);
  } else {
    if (!SUPPORTED.has(path.extname(opts.input).toLowerCase())) {
      console.error(`不支持的图片格式: ${opts.input}`);
      process.exit(1);
    }
    if (isStamped(opts.input)) {
      console.error(`这已经是一个 -stamped 文件, 跳过以避免重复加水印: ${opts.input}`);
      process.exit(1);
    }
    images = [opts.input];
  }

  if (images.length === 0) {
    console.log('没有找到需要处理的图片 (jpg/jpeg/png/webp/tiff)。');
    return;
  }

  console.log(`待处理 ${images.length} 张图片\n`);

  let ok = 0, fail = 0;
  for (const f of images) {
    try {
      const r = await processOne(f, opts);
      console.log(`  ${r.ok ? '✓' : '·'} ${r.file} — ${r.status}`);
      r.ok ? ok++ : fail++;
    } catch (err) {
      fail++;
      console.log(`  ✗ ${path.basename(f)} — 失败: ${err.message}`);
    }
  }
  console.log(`\n完成: ${ok} 张已生成, ${fail} 张跳过/失败。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
