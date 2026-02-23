import {createClassyStore} from '@codebelt/classy-store';
import {devtools, persist} from '@codebelt/classy-store/utils';

export const settingsStore = createClassyStore({
  theme: 'system' as 'light' | 'dark' | 'system',
  fontSize: 16,
  compactMode: false,
  notifications: true,
  defaultServings: 4,
  measurementUnit: 'metric' as 'metric' | 'imperial',
});

export const settingsPersist = persist(settingsStore, {
  name: 'classy-kitchen-settings',
  debounce: 300,
  merge: 'replace',
});

devtools(settingsStore, {name: 'Settings Store'});
