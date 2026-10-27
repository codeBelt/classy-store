import {createClassyStore, subscribe} from '@codebelt/classy-store';
import {getListenerCounts} from './getListenerCounts';

class FormStore {
  text = 'abcdef';
  enabled = false;
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
}

export const formStore = createClassyStore(new FormStore());
export const probe = {
  effects: [] as string[],
  snapshotDuringEvent: '',
  coreDuringEvent: -1,
  coreNotifications: 0,
};
subscribe(formStore, () => {
  probe.coreNotifications += 1;
});
export function getProbe() {
  return {
    ...probe,
    listeners: getListenerCounts(formStore),
  };
}
