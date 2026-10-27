import {createClassyStore, subscribe} from '../../../src/core/core';
import {
  type ClassyReadable,
  toSvelteStore,
} from '../../../src/frameworks/svelte/svelte';
import type {Snapshot} from '../../../src/types';
import {getListenerCounts} from '../getListenerCounts';

class FormStore {
  text = 'abcdef';
  count = 1;
  items = [
    {id: 1, label: 'One'},
    {id: 2, label: 'Two'},
  ];

  get doubled() {
    return this.count * 2;
  }

  setText(text: string) {
    this.text = text;
  }

  updateTogether() {
    this.text = 'updated';
    this.count = 3;
  }

  addItem() {
    this.items.push({id: 3, label: 'Three'});
  }

  renameFirst() {
    this.items[0].label = 'Renamed';
  }

  removeFirst() {
    this.items.splice(0, 1);
  }

  replaceItems() {
    this.items = [{id: 4, label: 'Four'}];
  }
}

export const formStore = createClassyStore(new FormStore());
export const probe = {
  activeSubscriptions: 0,
  deliveries: 0,
  coreNotifications: 0,
  coreDuringEvent: -1,
  snapshotDuringEvent: '',
};

subscribe(formStore, () => {
  probe.coreNotifications += 1;
});

const readable = toSvelteStore(formStore);
export const snap: ClassyReadable<Snapshot<FormStore>> = {
  subscribe(run) {
    probe.activeSubscriptions += 1;
    const unsubscribe = readable.subscribe((value) => {
      probe.deliveries += 1;
      run(value);
    });
    return () => {
      probe.activeSubscriptions -= 1;
      unsubscribe();
    };
  },
};

export function getProbe() {
  return {
    ...probe,
    listeners: getListenerCounts(formStore),
  };
}
