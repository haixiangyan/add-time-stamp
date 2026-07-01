#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  SUPPORTED, isStamped, collectImages, processOne,
} = require('./lib/stamp');

function parseArgs(argv) {
  const opts = {
    input: null,
    fontSize: null,
    padding: null,
    color: '#ff7a1a',
    font: 'Helvetica',
    quality: 100,
    dateSource: 'auto',
    recursive: false,
    position: 'bottom-right',
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
      case '--position': opts.position = next(); break;
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

选项:
  -s, --size <px>        字号(像素)
      --font <css>       字体 (默认: Helvetica)
      --position <pos>   位置: bottom-right|bottom-left|top-right|top-left|bottom-center|top-center
  -p, --padding <px>     内边距(像素)
  -c, --color <css>      字体颜色 (默认: #ff7a1a)
  -q, --quality <1-100>  JPEG/WebP 质量 (默认: 100)
      --date-source <s>  日期来源: auto | exif | file
  -r, --recursive        目录模式下递归处理子目录
  -h, --help             显示帮助
`);
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
      console.error(`这已经是一个 -stamped 文件, 跳过: ${opts.input}`);
      process.exit(1);
    }
    images = [opts.input];
  }

  if (images.length === 0) {
    console.log('没有找到需要处理的图片。');
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
