'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const FALLBACK = [
  'Helvetica', 'Arial', 'Georgia', 'Times New Roman', 'Courier New',
  'American Typewriter', 'Menlo', 'Monaco', 'PingFang SC', 'Songti SC',
  'Helvetica Neue', 'SF Pro Display', 'Fredoka', 'Impact',
];

const CACHE_FILE = path.join(os.homedir(), '.cache', 'time-stamp-fonts.json');
const CACHE_TTL = 7 * 24 * 3600 * 1000;

let cache = readDiskCache();
let ready = !!cache;
let loading = null;

function readDiskCache() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const { ts, fonts } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL && Array.isArray(fonts) && fonts.length) return fonts;
  } catch { /* ignore */ }
  return null;
}

function writeDiskCache(fonts) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ ts: Date.now(), fonts }));
  } catch { /* ignore */ }
}

async function listMacFonts() {
  const { stdout } = await execFileAsync('system_profiler', ['SPFontsDataType', '-json'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const data = JSON.parse(stdout);
  const fonts = new Set();
  for (const block of data.SPFontsDataType || []) {
    for (const tf of block.typefaces || block.fonts || []) {
      const family = tf.family || tf.fullname || tf._name;
      if (family && !family.startsWith('.')) fonts.add(family);
    }
  }
  return [...fonts].sort((a, b) => a.localeCompare(b));
}

async function listLinuxFonts() {
  const { stdout } = await execFileAsync('fc-list', [':', 'family'], { maxBuffer: 16 * 1024 * 1024 });
  const fonts = new Set();
  for (const line of stdout.split('\n')) {
    const name = line.split(',')[0]?.trim();
    if (name) fonts.add(name);
  }
  return [...fonts].sort((a, b) => a.localeCompare(b));
}

async function listWinFonts() {
  const ps = `
    Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts' |
    Select-Object -ExpandProperty PSObject.Properties |
    Where-Object { $_.Name -notmatch '^PS' } |
    ForEach-Object { ($_.Value -replace '\\s*\\(.*\\)$','').Trim() }
  `;
  const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', ps], {
    maxBuffer: 8 * 1024 * 1024,
  });
  const fonts = [...new Set(stdout.split('\n').map((s) => s.trim()).filter(Boolean))];
  return fonts.sort((a, b) => a.localeCompare(b));
}

async function loadAllFonts() {
  if (process.platform === 'darwin') return listMacFonts();
  if (process.platform === 'linux') return listLinuxFonts();
  if (process.platform === 'win32') return listWinFonts();
  return FALLBACK;
}

function preloadFonts() {
  if (loading) return loading;
  loading = loadAllFonts()
    .then((fonts) => {
      cache = fonts.length ? fonts : FALLBACK;
      ready = true;
      writeDiskCache(cache);
      return cache;
    })
    .catch(() => {
      cache = FALLBACK;
      ready = true;
      return cache;
    });
  return loading;
}

function getFontsPayload() {
  return { fonts: cache || FALLBACK, ready };
}

async function getSystemFonts() {
  if (cache) return cache;
  return preloadFonts();
}

module.exports = { getSystemFonts, getFontsPayload, preloadFonts, FALLBACK };
