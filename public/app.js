'use strict';

const SUPPORTED = /\.(jpe?g|png|webp|tiff?)$/i;
const POSITION_LABELS = {
  'bottom-right': '右下',
  'bottom-left': '左下',
  'top-right': '右上',
  'top-left': '左上',
  'bottom-center': '下中',
  'top-center': '上中',
};

const DEFAULT_FONTS = [
  'Helvetica', 'Arial', 'Georgia', 'Times New Roman', 'Courier New',
  'American Typewriter', 'Menlo', 'Monaco', 'PingFang SC', 'Songti SC',
];

const FONT_RENDER_LIMIT = 300;
const DEFAULT_SELECTED_FONTS = ['Helvetica'];

const state = {
  items: [],
  selectedId: null,
  fonts: [],
  selectedFonts: new Set(DEFAULT_SELECTED_FONTS),
  previewUrl: null,
  previewTimer: null,
  previewAbort: null,
  previewSeq: 0,
};

const $ = (sel) => document.querySelector(sel);

const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const pickBtn = $('#pickBtn');
const addBtn = $('#addBtn');
const workspace = $('#workspace');
const filmstrip = $('#filmstrip');
const metaPanel = $('#metaPanel');
const metaTitle = $('#metaTitle');
const metaList = $('#metaList');
const countLabel = $('#countLabel');
const statusEl = $('#status');
const exportBtn = $('#exportBtn');
const clearBtn = $('#clearBtn');

const previewImg = $('#previewImg');
const previewLabel = $('#previewLabel');
const previewFont = $('#previewFont');
const previewLoading = $('#previewLoading');
const previewEmpty = $('#previewEmpty');

const fontSearch = $('#fontSearch');
const fontList = $('#fontList');
const fontTrigger = $('#fontTrigger');
const fontTriggerLabel = $('#fontTriggerLabel');
const fontPanel = $('#fontPanel');
const fontSelectedCount = $('#fontSelectedCount');
const fontClear = $('#fontClear');

const offsetXVal = $('#offsetXVal');
const offsetYVal = $('#offsetYVal');

function uid() { return crypto.randomUUID(); }

async function waitForShoelace() {
  const tags = ['sl-select', 'sl-input', 'sl-color-picker', 'sl-range', 'sl-button'];
  await Promise.all(tags.map((t) => customElements.whenDefined(t)));
}

async function init() {
  await waitForShoelace();

  const positionEl = $('#position');
  const posRes = await fetch('/api/positions').then((r) => r.json());
  for (const p of posRes.positions || []) {
    const opt = document.createElement('sl-option');
    opt.value = p;
    opt.textContent = POSITION_LABELS[p] || p;
    positionEl.appendChild(opt);
  }
  positionEl.value = 'bottom-right';

  renderFontList();
  fillFonts(DEFAULT_FONTS);
  state.fonts = DEFAULT_FONTS;
  refreshFonts();

  setupListeners();
}

async function refreshFonts() {
  try {
    const data = await fetch('/api/fonts').then((r) => r.json());
    if (data.fonts?.length) {
      state.fonts = data.fonts;
      const q = fontSearch.value.trim().toLowerCase();
      fillFonts(q ? state.fonts.filter((f) => f.toLowerCase().includes(q)) : state.fonts);
    }
    if (!data.ready) setTimeout(refreshFonts, 2000);
  } catch { /* keep defaults */ }
}

/* ---------- Font multi-select ---------- */

function fillFonts(list) {
  fontList.innerHTML = '';
  const subset = list.slice(0, FONT_RENDER_LIMIT);
  for (const f of subset) {
    const item = document.createElement('label');
    item.className = 'font-item' + (state.selectedFonts.has(f) ? ' selected' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.selectedFonts.has(f);
    cb.value = f;
    cb.addEventListener('change', () => {
      if (cb.checked) state.selectedFonts.add(f);
      else state.selectedFonts.delete(f);
      item.classList.toggle('selected', cb.checked);
      updateFontTrigger();
      schedulePreview();
    });
    const name = document.createElement('span');
    name.className = 'font-item-name';
    name.textContent = f;
    item.append(cb, name);
    fontList.appendChild(item);
  }
  if (list.length > FONT_RENDER_LIMIT) {
    const hint = document.createElement('div');
    hint.className = 'font-item';
    hint.style.color = '#555';
    hint.style.fontSize = '0.7rem';
    hint.style.cursor = 'default';
    hint.textContent = `显示前 ${FONT_RENDER_LIMIT} 个，共 ${list.length} 个，请搜索…`;
    fontList.appendChild(hint);
  }
}

function renderFontList() {
  updateFontTrigger();
}

function updateFontTrigger() {
  const count = state.selectedFonts.size;
  if (count === 0) {
    fontTriggerLabel.textContent = '请选择字体';
  } else if (count === 1) {
    fontTriggerLabel.textContent = [...state.selectedFonts][0];
  } else {
    fontTriggerLabel.textContent = `已选 ${count} 个字体`;
  }
  fontSelectedCount.textContent = `已选 ${count} 个`;
}

fontTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !fontPanel.hidden;
  fontPanel.hidden = open;
  fontTrigger.setAttribute('aria-expanded', !open);
  if (!open) fontSearch.focus();
});

document.addEventListener('click', (e) => {
  if (!fontPanel.hidden && !fontPanel.contains(e.target) && e.target !== fontTrigger) {
    fontPanel.hidden = true;
    fontTrigger.setAttribute('aria-expanded', 'false');
  }
});

fontSearch.addEventListener('input', () => {
  const q = fontSearch.value.trim().toLowerCase();
  fillFonts(q ? state.fonts.filter((f) => f.toLowerCase().includes(q)) : state.fonts);
});

fontClear.addEventListener('click', () => {
  state.selectedFonts.clear();
  fillFonts(getCurrentFontList());
  updateFontTrigger();
  schedulePreview();
});

function getCurrentFontList() {
  const q = fontSearch.value.trim().toLowerCase();
  return q ? state.fonts.filter((f) => f.toLowerCase().includes(q)) : state.fonts;
}

/* ---------- File handling ---------- */

function isImageFile(file) {
  return SUPPORTED.test(file.name) || /^image\//.test(file.type);
}

function addFiles(fileList) {
  const incoming = [...fileList].filter(isImageFile);
  if (!incoming.length) return;
  for (const file of incoming) {
    const id = uid();
    const url = URL.createObjectURL(file);
    state.items.push({ id, file, url, meta: null });
  }
  render();
  workspace.hidden = false;
  dropzone.hidden = true;
  addBtn.hidden = false;
  clearBtn.hidden = false;
  for (const item of state.items.filter((i) => !i.meta)) loadMeta(item);
  if (!state.selectedId && state.items.length) selectItem(state.items[0].id);
}

async function loadMeta(item) {
  const fd = new FormData();
  fd.append('file', item.file);
  fd.append('fileDate', new Date(item.file.lastModified).toISOString());
  try {
    const res = await fetch('/api/metadata', { method: 'POST', body: fd });
    item.meta = await res.json();
    if (state.selectedId === item.id) {
      showMeta(item);
      schedulePreview();
    }
    updateCard(item);
  } catch {
    item.meta = { error: '读取失败' };
  }
}

function updateCard(item) {
  const el = filmstrip.querySelector(`[data-id="${item.id}"] .thumb-name`);
  if (!el || !item.meta) return;
  const parts = [];
  if (item.meta.width) parts.push(`${item.meta.width}×${item.meta.height}`);
  if (item.meta.stampDate) parts.push(item.meta.stampDate);
  el.textContent = parts.join(' · ') || item.file.name;
}

function render() {
  countLabel.textContent = `${state.items.length} 张`;
  filmstrip.innerHTML = '';
  for (const item of state.items) {
    const thumb = document.createElement('div');
    thumb.className = 'thumb' + (item.id === state.selectedId ? ' selected' : '');
    thumb.dataset.id = item.id;
    thumb.setAttribute('role', 'listitem');
    thumb.tabIndex = 0;
    thumb.setAttribute('aria-label', item.file.name);
    thumb.innerHTML = `
      <img src="${item.url}" alt="${item.file.name}" loading="lazy">
      <span class="thumb-name">${item.file.name}</span>
    `;
    thumb.addEventListener('click', () => selectItem(item.id));
    thumb.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectItem(item.id);
      }
    });
    filmstrip.appendChild(thumb);
  }
}

function selectItem(id) {
  state.selectedId = id;
  render();
  scrollThumbIntoView(id);
  const item = state.items.find((i) => i.id === id);
  if (item) {
    showMeta(item);
    schedulePreview();
  }
}

function scrollThumbIntoView(id) {
  const el = filmstrip.querySelector(`[data-id="${id}"]`);
  if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

/* ---------- Preview ---------- */

function getSettings() {
  const fonts = [...state.selectedFonts];
  return {
    fonts: fonts.length ? fonts : DEFAULT_SELECTED_FONTS,
    color: $('#color').value,
    position: $('#position').value,
    dateSource: $('#dateSource').value,
    fontSize: $('#fontSize').value,
    offsetX: $('#offsetX').value,
    offsetY: $('#offsetY').value,
  };
}

function schedulePreview() {
  clearTimeout(state.previewTimer);
  state.previewTimer = setTimeout(refreshPreview, 280);
}

async function refreshPreview() {
  const item = state.items.find((i) => i.id === state.selectedId);
  if (!item) {
    previewEmpty.hidden = false;
    previewImg.hidden = true;
    previewLabel.textContent = '';
    previewFont.textContent = '';
    return;
  }

  if (state.previewAbort) state.previewAbort.abort();
  state.previewAbort = new AbortController();
  const seq = ++state.previewSeq;
  const signal = state.previewAbort.signal;

  previewEmpty.hidden = true;
  previewLoading.hidden = false;
  previewImg.classList.add('loading');

  const fd = new FormData();
  fd.append('file', item.file);
  fd.append('fileDate', new Date(item.file.lastModified).toISOString());
  const s = getSettings();
  fd.append('fonts', JSON.stringify(s.fonts));
  fd.append('color', s.color);
  fd.append('position', s.position);
  fd.append('dateSource', s.dateSource);
  if (s.fontSize) fd.append('fontSize', s.fontSize);
  fd.append('offsetX', s.offsetX);
  fd.append('offsetY', s.offsetY);

  try {
    const res = await fetch('/api/preview', { method: 'POST', body: fd, signal });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }
    if (seq !== state.previewSeq) return;
    const blob = await res.blob();
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(blob);
    previewImg.src = state.previewUrl;
    previewImg.hidden = false;
    previewLabel.textContent = res.headers.get('X-Stamp-Label') || '';
    previewFont.textContent = res.headers.get('X-Stamp-Font') || '';
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (seq !== state.previewSeq) return;
    previewLabel.textContent = '';
    previewFont.textContent = '';
    previewImg.hidden = true;
    previewEmpty.textContent = e.message || '预览失败';
    previewEmpty.hidden = false;
  } finally {
    if (seq === state.previewSeq) {
      previewLoading.hidden = true;
      previewImg.classList.remove('loading');
    }
  }
}

/* ---------- Metadata ---------- */

function showMeta(item) {
  metaPanel.hidden = false;
  metaTitle.textContent = item.file.name;
  metaList.innerHTML = '';
  const rows = flattenMeta(item);
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    metaList.appendChild(dt);
    metaList.appendChild(dd);
  }
}

function flattenMeta(item) {
  const rows = [];
  rows.push(['文件名', item.file.name]);
  rows.push(['大小', formatBytes(item.file.size)]);
  rows.push(['修改时间', new Date(item.file.lastModified).toLocaleString()]);
  if (!item.meta) {
    rows.push(['状态', '加载中…']);
    return rows;
  }
  if (item.meta.error) {
    rows.push(['错误', item.meta.error]);
    return rows;
  }
  const m = item.meta;
  if (m.width) rows.push(['尺寸', `${m.width} × ${m.height}`]);
  if (m.format) rows.push(['格式', m.format]);
  if (m.space) rows.push(['色彩空间', m.space]);
  if (m.density) rows.push(['DPI', String(m.density)]);
  if (m.stampDate) rows.push(['水印日期', m.stampDate]);
  if (m.exif) {
    for (const [k, v] of Object.entries(m.exif)) {
      rows.push([`EXIF.${k}`, String(v)]);
    }
  }
  return rows;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/* ---------- Listeners ---------- */

function setupListeners() {
  pickBtn.addEventListener('click', () => fileInput.click());
  addBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) addFiles(fileInput.files);
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  clearBtn.addEventListener('click', () => {
    for (const item of state.items) URL.revokeObjectURL(item.url);
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
    state.items = [];
    state.selectedId = null;
    filmstrip.innerHTML = '';
    metaPanel.hidden = true;
    previewImg.hidden = true;
    previewImg.src = '';
    previewEmpty.hidden = false;
    previewEmpty.textContent = '点击底部缩略图预览…';
    previewLabel.textContent = '';
    previewFont.textContent = '';
    countLabel.textContent = '';
    workspace.hidden = true;
    dropzone.hidden = false;
    addBtn.hidden = true;
    clearBtn.hidden = true;
    statusEl.textContent = '';
  });

  exportBtn.addEventListener('click', async () => {
    if (!state.items.length) return;
    exportBtn.loading = true;
    statusEl.textContent = '处理中…';
    const fd = new FormData();
    for (const item of state.items) fd.append('files', item.file);
    const s = getSettings();
    fd.append('fonts', JSON.stringify(s.fonts));
    fd.append('color', s.color);
    fd.append('position', s.position);
    fd.append('dateSource', s.dateSource);
    if (s.fontSize) fd.append('fontSize', s.fontSize);
    fd.append('offsetX', s.offsetX);
    fd.append('offsetY', s.offsetY);
    fd.append('fileDates', JSON.stringify(state.items.map((i) => new Date(i.file.lastModified).toISOString())));

    try {
      const res = await fetch('/api/stamp', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const blob = await res.blob();
      const disp = res.headers.get('Content-Disposition') || '';
      const match = disp.match(/filename="?([^";]+)"?/);
      const name = match ? decodeURIComponent(match[1]) : 'time-stamp-export.zip';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      statusEl.textContent = `已下载 ${name}`;
    } catch (e) {
      statusEl.textContent = `失败: ${e.message}`;
    } finally {
      exportBtn.loading = false;
    }
  });

  const onChange = schedulePreview;
  $('#position').addEventListener('sl-change', onChange);
  $('#dateSource').addEventListener('sl-change', onChange);
  $('#fontSize').addEventListener('sl-input', onChange);
  $('#color').addEventListener('sl-change', () => {
    $('#colorVal').textContent = $('#color').value;
    onChange();
  });

  const ox = $('#offsetX');
  const oy = $('#offsetY');
  ox.addEventListener('sl-input', () => {
    offsetXVal.textContent = `${ox.value}%`;
    onChange();
  });
  oy.addEventListener('sl-input', () => {
    offsetYVal.textContent = `${oy.value}%`;
    onChange();
  });
}

init();
