import {createClassyStore, type Snapshot} from '@codebelt/classy-store';
import {useClassyStore} from '@codebelt/classy-store/vue';
import {computed, effectScope, type Ref} from 'vue';

class Counter {
  count = 0;
  nested = {label: 'Initial'};
  increment() {
    this.count += 1;
  }
}
const store = createClassyStore(new Counter());
const scope = effectScope();
scope.run(() => {
  const state = useClassyStore(store);
  const compatible: Ref<Snapshot<Counter>> = state;
  void compatible;
  const doubled: number = computed(() => state.value.count * 2).value;
  void doubled;
  store.increment();
  // @ts-expect-error Snapshot fields remain readonly.
  state.value.count = 1;
  // @ts-expect-error Nested snapshot fields remain readonly.
  state.value.nested.label = 'changed';
});
scope.stop();
