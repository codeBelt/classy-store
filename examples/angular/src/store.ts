import {createClassyStore} from '@codebelt/classy-store';
import {
  devtools,
  persist,
  subscribeKey,
  withHistory,
} from '@codebelt/classy-store/utils';

export class CounterStore {
  count = 0;
  step = 1;
  label = 'My Counter';
  enabled = true;
  items = [{id: 1, label: 'First item'}];
  nextItemId = 2;

  get doubled() {
    return this.count * 2;
  }

  increment() {
    this.count += this.step;
  }
  decrement() {
    this.count -= this.step;
  }
  setStep(step: number) {
    this.step = step;
  }
  setLabel(label: string) {
    this.label = label;
  }
  addItem() {
    const id = this.nextItemId++;
    this.items.push({id, label: `Item ${id}`});
  }
  reverseItems() {
    this.items.reverse();
  }
  reset() {
    this.count = 0;
  }
}

export const counterStore = createClassyStore(new CounterStore());

export const persistHandle = persist(counterStore, {
  name: 'classy-angular-example',
  storage: localStorage,
  properties: ['count', 'step', 'label'],
});

export const history = withHistory(counterStore, {limit: 20});

subscribeKey(counterStore, 'count', (next, prev) => {
  console.log(`[classy-store] count: ${prev} → ${next}`);
});

devtools(counterStore, {name: 'Angular Counter'});
