'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { FontMultiSelect } from './font-multi-select';
import { Download, Loader2 } from 'lucide-react';
import {
  DATE_SOURCE_LABELS,
  POSITION_LABELS,
  type StampSettings,
} from '@/lib/stamp-settings';

interface SettingsPanelProps {
  fonts: string[];
  positions: string[];
  settings: StampSettings;
  onChange: (next: StampSettings) => void;
  onExport: () => void;
  exporting: boolean;
  status: string;
  count: number;
  autoFontSize: number | null;
}

export function SettingsPanel({
  fonts,
  positions,
  settings,
  onChange,
  onExport,
  exporting,
  status,
  count,
  autoFontSize,
}: SettingsPanelProps) {
  const set = <K extends keyof StampSettings>(key: K, value: StampSettings[K]) =>
    onChange({ ...settings, [key]: value });

  // base-ui Slider passes a number for single-thumb sliders and an array otherwise
  const firstNum = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] : (v as number));

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-base">水印设置</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5 overflow-y-auto">
        <div className="space-y-2">
          <Label>位置</Label>
          <Select
            value={settings.position}
            onValueChange={(v) => v && set('position', v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v) => POSITION_LABELS[v as string] ?? (v as string)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {positions.map((p) => (
                <SelectItem key={p} value={p}>
                  {POSITION_LABELS[p] ?? p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <Label>偏移（百分比）</Label>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>左右</span>
              <span className="tabular-nums">{settings.offsetX}%</span>
            </div>
            <Slider
              min={-50}
              max={50}
              step={1}
              value={[settings.offsetX]}
              onValueChange={(v) => set('offsetX', firstNum(v))}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>上下</span>
              <span className="tabular-nums">{settings.offsetY}%</span>
            </div>
            <Slider
              min={-50}
              max={50}
              step={1}
              value={[settings.offsetY]}
              onValueChange={(v) => set('offsetY', firstNum(v))}
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>
            字体 <span className="text-xs font-normal text-muted-foreground">可多选，批量时轮换</span>
          </Label>
          <FontMultiSelect
            fonts={fonts}
            selected={settings.fonts}
            onChange={(next) => set('fonts', next)}
          />
        </div>

        <div className="space-y-2">
          <Label>
            字号{' '}
            <span className="text-xs font-normal text-muted-foreground">
              px，{settings.fontSize ? '自定义' : '自动（清空恢复）'}
            </span>
          </Label>
          <Input
            type="number"
            min={8}
            placeholder="自动"
            value={settings.fontSize !== '' ? settings.fontSize : (autoFontSize ?? '')}
            onChange={(e) => set('fontSize', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>颜色</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={settings.color}
              onChange={(e) => set('color', e.target.value)}
              className="size-9 cursor-pointer rounded-md border border-input bg-background p-1"
            />
            <Input
              value={settings.color}
              onChange={(e) => set('color', e.target.value)}
              className="font-mono"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>日期来源</Label>
          <Select
            value={settings.dateSource}
            onValueChange={(v) => v && set('dateSource', v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v) => DATE_SOURCE_LABELS[v as string] ?? (v as string)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DATE_SOURCE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-auto space-y-2 pt-2">
          <Button className="w-full" onClick={onExport} disabled={exporting || count === 0}>
            {exporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            批量导出下载
          </Button>
          {status && (
            <p className="text-center text-xs text-muted-foreground" aria-live="polite">
              {status}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
