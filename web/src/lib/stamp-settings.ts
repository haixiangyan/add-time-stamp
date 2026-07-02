export const POSITION_LABELS: Record<string, string> = {
  'bottom-right': '右下',
  'bottom-left': '左下',
  'top-right': '右上',
  'top-left': '左上',
  'bottom-center': '下中',
  'top-center': '上中',
};

export const DATE_SOURCE_LABELS: Record<string, string> = {
  auto: '自动（EXIF → 文件时间）',
  exif: '仅 EXIF',
  file: '文件修改时间',
};

export const DEFAULT_FONTS = [
  'Helvetica',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'American Typewriter',
  'Menlo',
  'Monaco',
  'PingFang SC',
  'Songti SC',
];

export const DEFAULT_SELECTED_FONTS = ['Helvetica'];
export const DEFAULT_COLOR = '#ff7a1a';

export interface ImageMeta {
  width?: number;
  height?: number;
  format?: string;
  space?: string;
  channels?: number;
  density?: number;
  hasAlpha?: boolean;
  isProgressive?: boolean;
  chromaSubsampling?: string;
  exif: Record<string, unknown> | null;
  stampDate: string | null;
  error?: string;
}

export interface StampSettings {
  fonts: string[];
  color: string;
  position: string;
  dateSource: string;
  fontSize: string;
  offsetX: number;
  offsetY: number;
}

export interface ImageItem {
  id: string;
  file: File;
  url: string;
  meta: ImageMeta | null;
}

export function filterImageFiles(files: Iterable<File>): File[] {
  return Array.from(files).filter(
    (f) => /\.(jpe?g|png|webp|tiff?)$/i.test(f.name) || /^image\//.test(f.type),
  );
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
