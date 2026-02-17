import {createClassyStore} from '@codebelt/classy-store';

export class CounterStore {
  count = 0;
  name = 'World';
  other = 'unchanged';

  increment() {
    this.count++;
  }

  decrement() {
    this.count--;
  }

  setName(name: string) {
    this.name = name;
  }

  setOther(val: string) {
    this.other = val;
  }

  incrementMany(n: number) {
    for (let i = 0; i < n; i++) {
      this.count++;
    }
  }

  reset() {
    this.count = 0;
    this.name = 'World';
    this.other = 'unchanged';
  }
}

export const counterStore = createClassyStore(new CounterStore());
