'use strict';

const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const path = require('path');
const { getFontsPayload, preloadFonts } = require('./lib/fonts');
const {
  POSITIONS, DEFAULT_COLOR, DEFAULT_FONT, extractMetadata, stampBuffer, stampPreviewBuffer, formatDate,
} = require('./lib/stamp');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const PORT = process.env.PORT || 3456;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/fonts', (_req, res) => {
  res.json(getFontsPayload());
});

app.get('/api/positions', (_req, res) => {
  res.json({ positions: POSITIONS });
});

app.post('/api/metadata', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '缺少文件' });
    const meta = await extractMetadata(req.file.buffer);
    if (!meta.stampDate && req.body.fileDate) {
      const d = new Date(req.body.fileDate);
      if (!isNaN(d)) meta.stampDate = formatDate(d);
    }
    res.json(meta);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '缺少文件' });
    const opts = {
      font: req.body.font || DEFAULT_FONT,
      color: req.body.color || DEFAULT_COLOR,
      position: req.body.position || 'bottom-right',
      dateSource: req.body.dateSource || 'auto',
      fallbackDate: req.body.fileDate || null,
    };
    if (req.body.fontSize) opts.fontSize = Number(req.body.fontSize);
    const { buffer, label } = await stampPreviewBuffer(req.file.buffer, req.file.originalname, opts);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('X-Stamp-Label', label);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/stamp', upload.array('files', 100), async (req, res) => {
  try {
    const files = req.files;
    if (!files?.length) return res.status(400).json({ error: '缺少文件' });

    const opts = {
      font: req.body.font || DEFAULT_FONT,
      color: req.body.color || DEFAULT_COLOR,
      position: req.body.position || 'bottom-right',
      dateSource: req.body.dateSource || 'auto',
      quality: Number(req.body.quality) || 100,
    };
    if (req.body.fontSize) opts.fontSize = Number(req.body.fontSize);
    if (req.body.padding) opts.padding = Number(req.body.padding);

    if (files.length === 1) {
      opts.fallbackDate = (req.body.fileDates && JSON.parse(req.body.fileDates)[0]) || null;
      const { buffer, outName } = await stampBuffer(files[0].buffer, files[0].originalname, opts);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(outName)}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.send(buffer);
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="time-stamp-export.zip"');
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    const fileDates = req.body.fileDates ? JSON.parse(req.body.fileDates) : [];
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      opts.fallbackDate = fileDates[i] || null;
      try {
        const { buffer, outName, label } = await stampBuffer(file.buffer, file.originalname, opts);
        archive.append(buffer, { name: outName });
        results.push({ name: file.originalname, ok: true, label, outName });
      } catch (e) {
        results.push({ name: file.originalname, ok: false, error: e.message });
      }
    }
    archive.append(JSON.stringify(results, null, 2), { name: '_manifest.json' });
    await archive.finalize();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  preloadFonts();
});
