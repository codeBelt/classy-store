import {createClassyStore, subscribe} from '../../src/core/core';
import {createStoreHook} from '../../src/frameworks/react/react';

class InputStore {
  text = 'abcdef';
  notes = 'first line';
  checked = false;
  edits = 0;
  first = 'First';
  last = 'Last';
  items = ['a', 'b', 'c'];

  updateTogether() {
    this.first = 'Ada';
    this.last = 'Lovelace';
    this.items.splice(0, 2, 'x');
    this.items.push('z');
    this.items.reverse();
  }
}

export const inputStore = createClassyStore(new InputStore());
export const useInputStore = createStoreHook(inputStore);
export const browserProbe = {
  notifications: 0,
  notificationsDuringEvent: -1,
  commits: [] as string[],
  eventValues: [] as string[],
  compositions: [] as string[],
};

subscribe(inputStore, () => {
  browserProbe.notifications++;
});

declare global {
  interface Window {
    browserProbe: typeof browserProbe;
  }
}

window.browserProbe = browserProbe;
