'use client';

import {useStore} from '@codebelt/classy-store/react';
import {settingsStore} from '@/stores/settings-store';

const icons: Record<string, string> = {
  light: '\u2600',
  dark: '\u263E',
  system: '\u25D1',
};

const next: Record<string, 'light' | 'dark' | 'system'> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

export function ThemeToggle() {
  const snap = useStore(settingsStore, (s) => s.theme);

  return (
    <button
      type="button"
      onClick={() => {
        settingsStore.theme = next[snap];
      }}
      className="w-8 h-8 flex items-center justify-center rounded-md border border-border text-sm hover:bg-border transition-colors"
      title={`Theme: ${snap}`}
    >
      {icons[snap]}
    </button>
  );
}
