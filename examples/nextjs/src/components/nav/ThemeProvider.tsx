'use client';

import {subscribe} from '@codebelt/classy-store';
import {useEffect} from 'react';
import {settingsStore} from '@/stores/settings-store';

function applyTheme(theme: 'light' | 'dark' | 'system') {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  document.documentElement.classList.toggle('dark', isDark);
}

export function ThemeProvider() {
  useEffect(() => {
    applyTheme(settingsStore.theme);

    const unsub = subscribe(settingsStore, () => {
      applyTheme(settingsStore.theme);
    });

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (settingsStore.theme === 'system') {
        applyTheme('system');
      }
    };
    mql.addEventListener('change', onSystemChange);

    return () => {
      unsub();
      mql.removeEventListener('change', onSystemChange);
    };
  }, []);

  return null;
}
