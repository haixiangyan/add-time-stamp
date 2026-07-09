import { useState } from 'react';
import type { Layout, LayoutChangedMeta } from 'react-resizable-panels';
import {
  DEFAULT_COLOR,
  DEFAULT_DATE_FORMAT,
  DEFAULT_SELECTED_FONTS,
  type StampSettings,
} from '@/lib/stamp-settings';
import { formatStampLabel } from './preview';

const SETTINGS_KEY = 'ts-settings';
const LAYOUT_PREFIX = 'ts-layout:';

export const DEFAULT_SETTINGS: StampSettings = {
  fonts: DEFAULT_SELECTED_FONTS,
  color: DEFAULT_COLOR,
  position: 'bottom-right',
  dateSource: 'auto',
  customDate: formatStampLabel(new Date().toISOString()),
  dateFormat: DEFAULT_DATE_FORMAT,
  fontSize: '38',
  offsetX: 0,
  offsetY: 0,
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadSettings(): StampSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const parsed = safeParse<Partial<StampSettings>>(localStorage.getItem(SETTINGS_KEY));
  if (!parsed) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...parsed };
}

export function saveSettings(settings: StampSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage disabled / quota */
  }
}

export function usePersistedLayout(groupId: string) {
  const key = `${LAYOUT_PREFIX}${groupId}`;
  const [defaultLayout] = useState<Layout | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return safeParse<Layout>(localStorage.getItem(key)) ?? undefined;
  });
  const onLayoutChanged = (layout: Layout, meta: LayoutChangedMeta) => {
    if (!meta.isUserInteraction) return;
    try {
      localStorage.setItem(key, JSON.stringify(layout));
    } catch {
      /* ignore */
    }
  };
  return { defaultLayout, onLayoutChanged };
}

export function resetAllPersistence() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SETTINGS_KEY);
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LAYOUT_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
