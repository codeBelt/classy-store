import {
  createClassyStore,
  type Snapshot,
  snapshot,
  subscribe,
} from '@codebelt/classy-store';
// @ts-expect-error Auto-tracked hooks no longer expose notification options.
import type {UseClassyStoreOptions} from '@codebelt/classy-store/react';
import {
  createStoreHook,
  prepareStoreForHydration,
  useClassyStore,
  useLocalStore,
} from '@codebelt/classy-store/react';

class ConsumerStore {
  count = 0;
  user = {name: 'Ada'};
  names = ['Ada', 'Grace'];

  increment() {
    this.count++;
  }
}

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Condition extends true> = Condition;

const store = createClassyStore(new ConsumerStore());
const prepared = prepareStoreForHydration(store);
const useStore = createStoreHook(prepared);

export function useConsumerTypeAssertions() {
  const count = useClassyStore(store, (state) => state.count);
  const tracked = useClassyStore(store);
  const boundCount = useStore((state) => state.count);
  const boundTracked = useStore();
  const selected = useClassyStore(
    store,
    (state) => ({label: state.user.name}),
    {isEqual: (previous, next) => previous.label === next.label},
  );
  const boundSelected = useStore((state) => ({label: state.user.name}), {
    isEqual: (previous, next) => previous.label === next.label,
  });
  const local = useLocalStore(() => new ConsumerStore());

  const assertions: [
    Expect<Equal<typeof count, number>>,
    Expect<Equal<typeof boundCount, number>>,
    Expect<Equal<typeof tracked, Snapshot<ConsumerStore>>>,
    Expect<Equal<typeof boundTracked, Snapshot<ConsumerStore>>>,
    Expect<Equal<typeof selected, {label: string}>>,
    Expect<Equal<typeof boundSelected, {label: string}>>,
    Expect<Equal<typeof local, ConsumerStore>>,
    Expect<Equal<typeof prepared, ConsumerStore>>,
  ] = [true, true, true, true, true, true, true, true];

  // @ts-expect-error Snapshots cannot be assigned to.
  tracked.count = 1;
  // @ts-expect-error Nested snapshot objects remain readonly.
  tracked.user.name = 'Changed';
  // @ts-expect-error Snapshot arrays are readonly.
  tracked.names.push('Changed');
  // @ts-expect-error Bound snapshots are deeply readonly too.
  boundTracked.user.name = 'Changed';
  // @ts-expect-error Selector arguments are deeply readonly.
  useClassyStore(store, (state) => state.names.push('Changed'));
  // @ts-expect-error React automatically subscribes synchronously.
  useClassyStore(store, {sync: true});
  // @ts-expect-error React cannot opt back into batched subscriptions.
  useClassyStore(store, {sync: false});
  // @ts-expect-error Selector options only customize equality.
  useClassyStore(store, (state) => state.count, {sync: true});
  // @ts-expect-error Selector options cannot disable synchronous subscriptions.
  useClassyStore(store, (state) => state.count, {sync: false});
  // @ts-expect-error Bound hooks have no sync option.
  useStore({sync: true});
  // @ts-expect-error Bound auto-tracked hooks cannot batch subscriptions.
  useStore({sync: false});
  // @ts-expect-error Bound selector options have no sync option.
  useStore((state) => state.count, {sync: true});
  // @ts-expect-error Bound selector options have no sync option.
  useStore((state) => state.count, {sync: false});
  // @ts-expect-error Selector result inference cannot become any.
  const wrongType: string = count;

  local.increment();
  prepared.increment();
  prepared.count = 2;
  prepared.user.name = 'Prepared and mutable';
  prepared.names.push('Prepared and mutable');
  store.user.name = 'Mutable';
  store.names.push('Mutable');
  const frozen = snapshot(store);
  // @ts-expect-error Core snapshots are also deeply readonly.
  frozen.user.name = 'Changed';
  subscribe(store, () => {}, {sync: true})();

  return {assertions, wrongType, removedOptions: null as UseClassyStoreOptions};
}
