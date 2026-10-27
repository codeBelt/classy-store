import {
  createClassyStore,
  getInternal,
  subscribe,
} from '../../../src/core/core';

class FormStore {
  text = 'abcdef';
  count = 1;
  enabled = false;
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
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
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
  coreNotifications: 0,
  coreDuringEvent: -1,
  snapshotDuringEvent: '',
  summaryAfterNextTick: '',
  commits: [] as string[],
};
subscribe(formStore, () => {
  probe.coreNotifications += 1;
});

export function getProbe() {
  return {
    ...probe,
    syncListeners: getInternal(formStore).syncListeners.size,
    batchedListeners: getInternal(formStore).batchedListeners.size,
  };
}
