import {createClassyStore} from '@codebelt/classy-store';
import {devtools, persist} from '@codebelt/classy-store/utils';
import {ssrSafeLocalStorage} from './_storage';

class SettingsStore {
  theme = 'system' as 'light' | 'dark' | 'system';
  fontSize = 16;
  compactMode = false;
  notifications = true;
  defaultServings = 4;
  measurementUnit = 'metric' as 'metric' | 'imperial';
}

export const settingsStore = createClassyStore(new SettingsStore());

export const settingsPersist = persist(settingsStore, {
  name: 'classy-kitchen-settings',
  storage: ssrSafeLocalStorage,
  debounce: 300,
});

devtools(settingsStore, {name: 'Settings Store'});
