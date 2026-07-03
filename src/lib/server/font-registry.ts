import fs from 'fs';
import path from 'path';
import { parse, type Font } from 'opentype.js';

export interface BundledFont {
  /** display name shown in the UI */
  name: string;
  /** file under web/fonts */
  file: string;
}

// All fonts are bundled with the app so rendering is identical on every OS /
// serverless environment. The first three are metric-compatible clones of the
// classic Arial / Times New Roman / Courier New (Arimo / Tinos / Cousine).
export const BUNDLED_FONTS: BundledFont[] = [
  { name: 'Arial', file: 'Arimo-Bold.ttf' },
  { name: 'Times New Roman', file: 'Tinos-Bold.ttf' },
  { name: 'Courier New', file: 'Cousine-Bold.ttf' },
  { name: 'Roboto', file: 'Roboto-Bold.ttf' },
  { name: 'Anton', file: 'Anton-Regular.ttf' },
  { name: 'Bebas Neue', file: 'BebasNeue-Regular.ttf' },
  { name: 'DM Serif Display', file: 'DMSerifDisplay-Regular.ttf' },
];

export const FONT_NAMES = BUNDLED_FONTS.map((f) => f.name);
export const DEFAULT_FONT_NAME = 'Arial';

const byName = new Map(BUNDLED_FONTS.map((f) => [f.name, f]));
const cache = new Map<string, Font>();

function fontsDir() {
  return path.join(process.cwd(), 'fonts');
}

/** Load (and cache) the parsed font for a display name, falling back to default. */
export function loadFont(name: string): Font {
  const entry = byName.get(name) ?? byName.get(DEFAULT_FONT_NAME)!;
  const cached = cache.get(entry.name);
  if (cached) return cached;
  const buf = fs.readFileSync(path.join(fontsDir(), entry.file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const font = parse(ab);
  cache.set(entry.name, font);
  return font;
}
