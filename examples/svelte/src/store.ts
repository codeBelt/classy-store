import {createClassyStore} from '@codebelt/classy-store';
import {toSvelteStore} from '@codebelt/classy-store/svelte';
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

  get doubled() {
    return this.count * 2;
  }

  increment() {
    this.count += this.step;
  }
  decrement() {
    this.count -= this.step;
  }
  setStep(n: number) {
    this.step = n;
  }
  setLabel(s: string) {
    this.label = s;
  }
  reset() {
    this.count = 0;
  }
}

export const counterStore = createClassyStore(new CounterStore());

export const persistHandle = persist(counterStore, {
  name: 'classy-svelte-example',
  properties: ['count', 'step', 'label'],
});

export const history = withHistory(counterStore, {limit: 20});

subscribeKey(counterStore, 'count', (next, prev) => {
  console.log(`[classy-store] count: ${prev} → ${next}`);
});

devtools(counterStore, {name: 'Svelte Counter'});

export const snap = toSvelteStore(counterStore);
