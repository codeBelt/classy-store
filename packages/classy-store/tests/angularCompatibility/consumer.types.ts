import {
  computed,
  Injector,
  runInInjectionContext,
  type Signal,
} from '@angular/core';
import {createClassyStore, type Snapshot} from '@codebelt/classy-store';
import {injectStore} from '@codebelt/classy-store/angular';

class Counter {
  count = 0;
  increment() {
    this.count += 1;
  }
}
const store = createClassyStore(new Counter());
const injector = Injector.create({providers: []});
const state: Signal<Snapshot<Counter>> = runInInjectionContext(injector, () =>
  injectStore(store),
);
const doubled: Signal<number> = computed(() => state().count * 2);
void doubled;
// @ts-expect-error Snapshot fields are readonly.
state().count = 2;
// @ts-expect-error injectStore does not expose a writable signal.
state.set({count: 2});
injector.destroy();
