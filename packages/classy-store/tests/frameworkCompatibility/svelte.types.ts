import {createClassyStore, type Snapshot} from '@codebelt/classy-store';
import {
  type ClassyReadable,
  toSvelteStore,
} from '@codebelt/classy-store/svelte';
import {derived, get, type Readable} from 'svelte/store';

class Counter {
  count = 0;
  nested = {label: 'Initial'};
  increment() {
    this.count += 1;
  }
}
const store = createClassyStore(new Counter());
const readable: ClassyReadable<Snapshot<Counter>> = toSvelteStore(store);
const compatible: Readable<Snapshot<Counter>> = readable;
const doubled: number = get(derived(compatible, (state) => state.count * 2));
void doubled;
store.increment();
const stop: () => void = readable.subscribe((state) => {
  // @ts-expect-error Snapshot fields remain readonly.
  state.count = 1;
  // @ts-expect-error Nested snapshot fields remain readonly.
  state.nested.label = 'changed';
});
stop();
