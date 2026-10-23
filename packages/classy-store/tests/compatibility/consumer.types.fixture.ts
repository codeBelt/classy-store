import {
  createClassyStore,
  type Snapshot,
  snapshot,
  subscribe,
} from '@codebelt/classy-store';
import {
  type ReactiveMap,
  type ReactiveSet,
  reactiveMap,
  reactiveSet,
} from '@codebelt/classy-store/collections';
// @ts-expect-error Auto-tracked hooks no longer expose notification options.
import type {UseClassyStoreOptions} from '@codebelt/classy-store/react';
import {
  createStoreHook,
  useClassyStore,
  useHistoryStatus,
  useLocalStore,
  usePersistStatus,
} from '@codebelt/classy-store/react';
import {prepareStoreForHydration} from '@codebelt/classy-store/react/server';
import type * as UtilityTypes from '@codebelt/classy-store/utils';
import {
  type HistoryStatus,
  type PersistHandle,
  type PersistOperation,
  type PersistOptions,
  type PersistStatus,
  type PropertyTransform,
  persist,
  type StorageAdapter,
  subscribeKey,
  withHistory,
} from '@codebelt/classy-store/utils';

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

type CoreExports = typeof import('@codebelt/classy-store');
// @ts-expect-error Store version bookkeeping is internal.
export type RemovedStoreVersion = CoreExports['getVersion'];
// @ts-expect-error The shared utility status contract is internal.
export type RemovedUtilityStatus = UtilityTypes.UtilityStatusSource<unknown>;
// @ts-expect-error Explicit persistence operations have a single error policy.
export type RemovedPersistCallOptions = UtilityTypes.PersistCallOptions;
type ReactExports = typeof import('@codebelt/classy-store/react');
// @ts-expect-error Hydration preparation is exported only from /react/server.
export type RemovedClientHydration = ReactExports['prepareStoreForHydration'];

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

// Compiled through the packed ESM and CommonJS declarations by the existing
// compatibility runner; this function is a type fixture and is never invoked.
export function utilityTypeAssertions(storage: StorageAdapter) {
  const draft = createClassyStore({title: 'Draft', count: 0});
  const options: PersistOptions<typeof draft> = {
    name: 'draft',
    storage,
    properties: [
      'title',
      {
        key: 'count',
        serialize: (value) => {
          const inferred: Expect<Equal<typeof value, number>> = true;
          void inferred;
          return String(value);
        },
        deserialize: (stored) => Number(stored),
      },
    ],
  };
  const persistence = persist(draft, options);
  const unsubscribe = subscribeKey(draft, 'count', (value, previous) => {
    const inferred: [
      Expect<Equal<typeof value, number>>,
      Expect<Equal<typeof previous, number>>,
    ] = [true, true];
    return {inferred, value, previous};
  });
  const users = reactiveMap<string, {name: string}>([['ada', {name: 'Ada'}]]);
  const user = users.get('ada');
  const tags = reactiveSet<string>(['saved']);
  const assertions: [
    Expect<Equal<typeof persistence, PersistHandle>>,
    Expect<Equal<typeof unsubscribe, () => void>>,
    Expect<Equal<typeof users, ReactiveMap<string, {name: string}>>>,
    Expect<Equal<typeof user, {name: string} | undefined>>,
    Expect<Equal<typeof tags, ReactiveSet<string>>>,
  ] = [true, true, true, true, true];
  return {assertions, persistence, unsubscribe};
}

// Compile-only public API checks, exercised through both ESM and CJS declarations.
export function useUtilityApiTypes(storage: StorageAdapter) {
  const store = createClassyStore({
    count: 0,
    title: '',
    updatedAt: new Date(),
    nested: {labels: ['a']},
    optional: undefined as number | undefined,
  });
  const handle = persist(store, {
    name: 'typed',
    storage,
    properties: [
      {
        key: 'count',
        serialize: (value) => value.toFixed(),
        deserialize: Number,
      },
      {
        key: 'title',
        serialize: (value) => value.toUpperCase(),
        deserialize: String,
      },
      {
        key: 'updatedAt',
        serialize: (value) => value.toISOString(),
        deserialize: (value) => new Date(String(value)),
      },
      {
        key: 'optional',
        serialize: (value) => value?.toFixed(),
        deserialize: (value) => (value === null ? undefined : Number(value)),
      },
      {
        key: 'nested',
        serialize: (value) => {
          // @ts-expect-error Serialization reads immutable snapshot data.
          value.labels.push('mutated');
          return value.labels;
        },
        deserialize: () => ({labels: []}),
      },
    ],
  });
  const invalidTransform: PropertyTransform<typeof store, 'count'> = {
    key: 'count',
    serialize: (value) => value,
    // @ts-expect-error Deserialization must restore the selected property's type.
    deserialize: () => 'wrong',
  };
  const optionalOptions: PersistOptions<{count?: number}> = {
    name: 'optional',
    storage,
    properties: [
      {
        key: 'count',
        serialize: (value) => value?.toFixed(),
        deserialize: () => undefined,
      },
    ],
  };
  // @ts-expect-error Getter-only handle metadata cannot be assigned.
  handle.isHydrated = true;
  // @ts-expect-error Getter-only handle metadata cannot be assigned.
  handle.isExpired = true;
  const operation: PersistOperation = 'write';
  const saved: Promise<void> = handle.save();
  const cleared: Promise<void> = handle.clear();
  const rehydrated: Promise<void> = handle.rehydrate();
  // @ts-expect-error Explicit save always rejects on failure.
  handle.save({throwOnError: false});
  // @ts-expect-error Explicit clear always rejects on failure.
  handle.clear({throwOnError: false});
  // @ts-expect-error Explicit rehydrate always rejects on failure.
  handle.rehydrate({throwOnError: false});
  const status = usePersistStatus(handle);
  const history = withHistory(store);
  const historyStatus = useHistoryStatus(history);
  // @ts-expect-error History status requires a history handle.
  useHistoryStatus(handle);
  // @ts-expect-error Persistence status requires a persistence handle.
  usePersistStatus(history);
  // @ts-expect-error Store data is read with useClassyStore.
  useHistoryStatus(store);
  // @ts-expect-error Store data is read with useClassyStore.
  usePersistStatus(store);
  const types: [
    Expect<Equal<typeof status, PersistStatus>>,
    Expect<Equal<typeof historyStatus, HistoryStatus>>,
  ] = [true, true];
  // @ts-expect-error Status snapshots are readonly.
  status.isHydrated = false;
  // @ts-expect-error History snapshots are readonly.
  historyStatus.canUndo = true;
  // @ts-expect-error Persistence cleanup is dispose(), with no unsubscribe alias.
  handle.unsubscribe();
  handle.dispose();
  return {
    invalidTransform,
    optionalOptions,
    operation,
    saved,
    cleared,
    rehydrated,
    types,
  };
}
