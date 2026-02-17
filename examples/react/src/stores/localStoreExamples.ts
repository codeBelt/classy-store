// Store class used with useLocalStore — not instantiated as a singleton.
// Each component instance creates its own via useLocalStore(() => new LocalCounterStore())

export class LocalCounterStore {
  count = 0;
  label: string;

  constructor(label = 'Counter') {
    this.label = label;
  }

  increment() {
    this.count++;
  }

  decrement() {
    this.count--;
  }

  reset() {
    this.count = 0;
  }
}
