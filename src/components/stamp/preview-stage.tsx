'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ImageOff, ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PreviewStageProps {
  previewUrl: string | null;
  label: string;
  font: string;
  loading: boolean;
  error: string | null;
  empty: boolean;
  overlay?: React.ReactNode;
}

export function PreviewStage({
  previewUrl,
  label,
  font,
  loading,
  error,
  empty,
  overlay,
}: PreviewStageProps) {
  return (
    <Card className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-muted/30 p-0">
      {overlay}

      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-sm">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      )}

      {previewUrl && !error ? (
        <img
          src={previewUrl}
          alt="水印预览"
          className={cn('max-h-full max-w-full object-contain transition-opacity', loading && 'opacity-40')}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          {error ? (
            <>
              <ImageOff className="size-10" />
              <p className="text-sm">{error}</p>
            </>
          ) : empty ? (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ImagePlus className="size-7" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-medium text-foreground">还没有图片</p>
                <p className="text-sm">
                  点击右上角「添加图片」或「选择文件夹」导入
                </p>
                <p className="text-xs text-muted-foreground/80">
                  也可直接把图片 / 文件夹拖拽到此处 · 支持 JPG / PNG / WebP / TIFF / HEIC
                </p>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {(label || font) && !error && (
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
          {label && <Badge className="font-mono">{label}</Badge>}
          {font && <Badge variant="secondary">{font}</Badge>}
        </div>
      )}
    </Card>
  );
}
