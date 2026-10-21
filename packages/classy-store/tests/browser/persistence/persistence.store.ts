import {createClassyStore} from '../../../src/index';
import {persist} from '../../../src/utils/index';

const parameters = new URLSearchParams(location.search);
export const persistenceKey = parameters.get('key') ?? 'two-tab-draft';
export const persistenceStore = createClassyStore({text: 'Initial'});
let nextEventEdit: string | undefined;

export const persistenceProbe = {
  writes: 0,
  events: 0,
  trustedEvents: 0,
  writeOnNextEvent(text: string) {
    nextEventEdit = text;
  },
};

// A capture listener makes the conflict deterministic: a newer local save
// happens while an older, genuinely browser-delivered event is being handled.
window.addEventListener(
  'storage',
  (event) => {
    if (event.key !== persistenceKey || event.newValue === null) return;
    persistenceProbe.events++;
    if (event.isTrusted) persistenceProbe.trustedEvents++;
    if (nextEventEdit !== undefined) {
      persistenceStore.text = nextEventEdit;
      nextEventEdit = undefined;
      void persistence.save();
    }
  },
  true,
);

export const persistence = persist(persistenceStore, {
  name: persistenceKey,
  storage: {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      persistenceProbe.writes++;
      localStorage.setItem(name, value);
    },
    removeItem: (name) => localStorage.removeItem(name),
  },
  debounce: Number(parameters.get('debounce') ?? 0),
  syncTabs: true,
});

declare global {
  interface Window {
    persistenceProbe: typeof persistenceProbe;
  }
}
window.persistenceProbe = persistenceProbe;
