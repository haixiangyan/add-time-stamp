const FALLBACK_FONTS = [
  'Arial',
  'Helvetica',
  'Helvetica Neue',
  'Times New Roman',
  'Times',
  'Georgia',
  'Palatino',
  'Palatino Linotype',
  'Book Antiqua',
  'Courier New',
  'Courier',
  'Menlo',
  'Monaco',
  'Consolas',
  'American Typewriter',
  'Bradley Hand',
  'Marker Felt',
  'Comic Sans MS',
  'Impact',
  'Trebuchet MS',
  'Verdana',
  'Tahoma',
  'Geneva',
  'Optima',
  'Futura',
  'Avenir',
  'Avenir Next',
  'Gill Sans',
  'Baskerville',
  'Didot',
  'Hoefler Text',
  'Lucida Grande',
  'Lucida Sans Unicode',
  'Segoe UI',
  'Calibri',
  'Cambria',
  'Candara',
  'Constantia',
  'Corbel',
  'Garamond',
  'Franklin Gothic Medium',
  'Apple Chancery',
  'Zapfino',
  'Chalkboard',
  'Chalkboard SE',
  'Noteworthy',
  'Papyrus',
  'Brush Script MT',
  'Copperplate',
  'Rockwell',
  'PingFang SC',
  'PingFang TC',
  'PingFang HK',
  'Hiragino Sans',
  'Hiragino Sans GB',
  'Hiragino Mincho ProN',
  'STHeiti',
  'STSong',
  'STKaiti',
  'STFangsong',
  'Songti SC',
  'Kaiti SC',
  'Heiti SC',
  'Yuanti SC',
  'Xingkai SC',
  'Lantinghei SC',
  'Wawati SC',
  'Microsoft YaHei',
  'Microsoft JhengHei',
  'SimSun',
  'SimHei',
  'KaiTi',
  'FangSong',
  'Noto Sans CJK SC',
  'Noto Serif CJK SC',
  'Source Han Sans SC',
  'Source Han Serif SC',
  'WenQuanYi Micro Hei',
  'Apple Color Emoji',
  'SF Pro Text',
  'SF Pro Display',
  'SF Mono',
  'New York',
];

function probeAvailable(candidates: string[]): string[] {
  if (typeof document === 'undefined') return candidates.slice(0, 8);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return candidates.slice(0, 8);
  const sample = 'mmmmmmmmmmlli年月日';
  const size = '72px';
  ctx.font = `${size} monospace`;
  const baseMono = ctx.measureText(sample).width;
  ctx.font = `${size} sans-serif`;
  const baseSans = ctx.measureText(sample).width;
  const out: string[] = [];
  for (const name of candidates) {
    ctx.font = `${size} "${name}", monospace`;
    const w1 = ctx.measureText(sample).width;
    ctx.font = `${size} "${name}", sans-serif`;
    const w2 = ctx.measureText(sample).width;
    if (w1 !== baseMono || w2 !== baseSans) out.push(name);
  }
  return out;
}

/** List local fonts via Local Font Access API, else canvas-probe common names. */
export async function listSystemFonts(): Promise<string[]> {
  try {
    const query = (
      window as unknown as {
        queryLocalFonts?: () => Promise<Array<{ family: string }>>;
      }
    ).queryLocalFonts;
    if (typeof query === 'function') {
      const fonts = await query();
      const set = new Set<string>();
      for (const f of fonts) {
        if (f.family) set.add(f.family);
      }
      return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }
  } catch {
    /* permission denied / unsupported */
  }
  return probeAvailable(FALLBACK_FONTS).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}
