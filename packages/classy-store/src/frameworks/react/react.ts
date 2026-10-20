import {createProxy, isChanged} from 'proxy-compare';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  subscribe as coreSubscribe,
  createClassyStore,
  getInternal,
} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

type EqualityFn<T> = (a: T, b: T) => boolean;

export type UseClassyStoreSelectorOptions<S> = {
  isEqual?: EqualityFn<S>;
};

// ── Overloads ─────────────────────────────────────────────────────────────────

/**
 * Subscribe to a store proxy with an explicit selector.
 *
 * Re-renders only when the selected value changes (compared via `Object.is`
 * by default, or `options.isEqual`).
 *
 * @param proxyStore - A reactive proxy created by `createClassyStore()`.
 * @param selector  - Picks data from the immutable snapshot.
 * @param options   - Controls selected-value equality.
 */
export function useClassyStore<T extends object, S>(
  proxyStore: T,
  selector: (snap: Snapshot<T>) => S,
  options?: UseClassyStoreSelectorOptions<S>,
): S;

/**
 * Subscribe to a store proxy **without** a selector (auto-tracked mode).
 *
 * Returns a `proxy-compare` tracking proxy over the immutable snapshot.
 * The component only re-renders when a property it actually read changes.
 *
 * @param proxyStore - A reactive proxy created by `createClassyStore()`.
 */
export function useClassyStore<T extends object>(proxyStore: T): Snapshot<T>;

// ── Implementation ────────────────────────────────────────────────────────────

export function useClassyStore<T extends object, S>(
  proxyStore: T,
  selector?: (snap: Snapshot<T>) => S,
  selectorOptions?: UseClassyStoreSelectorOptions<S>,
): Snapshot<T> | S {
  // Validate that the argument is actually a store proxy (throws if not).
  getInternal(proxyStore);

  const isEqual = selectorOptions?.isEqual;

  // React must observe mutations during the event that changes a controlled
  // input. Ordinary core subscriptions retain their default microtask batching.
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      coreSubscribe(proxyStore, onStoreChange, {sync: true}),
    [proxyStore],
  );

  // ── Refs used by both modes (always allocated to satisfy Rules of Hooks) ──

  // Keep only committed selections shared between selector instances.
  // Each selector gets its own snapshot cache so concurrent renders do not
  // overwrite one another's cached snapshot or selected result.
  const committedSelectionRef = useRef<{value: S} | undefined>(undefined);
  const getSelectedSnapshot = useMemo(
    () =>
      selector
        ? createSelectorSnapshotGetter(
            proxyStore,
            selector,
            committedSelectionRef,
            isEqual,
          )
        : undefined,
    [proxyStore, selector, isEqual],
  );

  // Each render owns its read set. A suspended or abandoned render cannot
  // overwrite the committed getter's tracked properties. Proxy identity is
  // cached across renders so unchanged values remain safe effect dependencies.
  const affected = new WeakMap<object, unknown>();
  const proxyCache = useRef(new WeakMap<object, unknown>()).current;
  let previousAutoSnapshot: Snapshot<T> | undefined;
  const getSnapshot = (): Snapshot<T> | S => {
    if (getSelectedSnapshot) return getSelectedSnapshot();
    const nextSnapshot = snapshot(proxyStore);
    if (
      previousAutoSnapshot &&
      !isChanged(previousAutoSnapshot, nextSnapshot, affected)
    ) {
      return previousAutoSnapshot;
    }
    previousAutoSnapshot = nextSnapshot;
    return nextSnapshot;
  };

  const result = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    committedSelectionRef.current = selector ? {value: result as S} : undefined;
  }, [result, selector]);

  return selector
    ? result
    : (createProxy(result as Snapshot<T>, affected, proxyCache) as Snapshot<T>);
}

// ── Selector mode logic (pure function, no hooks) ─────────────────────────────

/**
 * Create a cached `getSnapshot` for one store, selector, and equality function.
 *
 * Re-evaluates when any of those inputs change, even if the store did not.
 * Repeated reads of the same snapshot return the cached result, including
 * `undefined`. Equal selections retain their reference across selector changes.
 */
function createSelectorSnapshotGetter<T extends object, S>(
  proxyStore: T,
  selector: (snap: Snapshot<T>) => S,
  committedSelectionRef: React.RefObject<{value: S} | undefined>,
  isEqual?: EqualityFn<S>,
): () => S {
  let previousSnapshot: Snapshot<T> | undefined;
  let selection: {value: S} | undefined;

  return () => {
    const nextSnapshot = snapshot(proxyStore);
    if (previousSnapshot === nextSnapshot && selection) {
      return selection.value;
    }

    const nextResult = selector(nextSnapshot);
    const previousSelection = selection ?? committedSelectionRef.current;

    selection =
      previousSelection &&
      (isEqual
        ? isEqual(previousSelection.value, nextResult)
        : Object.is(previousSelection.value, nextResult))
        ? previousSelection
        : {value: nextResult};
    previousSnapshot = nextSnapshot;

    return selection.value;
  };
}

// ── Bound store hook factory ─────────────────────────────────────────────────

/**
 * Create a pre-bound React hook for a specific store proxy.
 *
 * Eliminates the boilerplate of writing a wrapper around `useClassyStore`
 * for every store instance:
 *
 * ```ts
 * // Before:
 * export const catalogStore = createClassyStore(new CatalogStore());
 * export function useCatalogStore<S>(selector: (s: Snapshot<CatalogStore>) => S) {
 *   return useClassyStore(catalogStore, selector);
 * }
 *
 * // After:
 * export const catalogStore = createClassyStore(new CatalogStore());
 * export const useCatalogStore = createStoreHook(catalogStore);
 * ```
 *
 * The returned hook supports both selector mode and auto-tracked (selectorless)
 * mode — identical to `useClassyStore`, but with the store already bound.
 *
 * @param proxyStore - A reactive proxy created by `createClassyStore()`.
 */
export function createStoreHook<T extends object>(proxyStore: T) {
  // Fail fast at creation time rather than on first render.
  getInternal(proxyStore);

  function useStore(): Snapshot<T>;
  function useStore<S>(
    selector: (snap: Snapshot<T>) => S,
    options?: UseClassyStoreSelectorOptions<S>,
  ): S;
  function useStore<S>(
    selector?: (snap: Snapshot<T>) => S,
    options?: UseClassyStoreSelectorOptions<S>,
  ): Snapshot<T> | S {
    return useClassyStore(
      proxyStore,
      selector as (snap: Snapshot<T>) => S,
      options,
    );
  }
  return useStore;
}

// ── Component-scoped store ────────────────────────────────────────────────────

/**
 * Create a component-scoped reactive store that lives for the lifetime of the
 * component. When the component unmounts, the store becomes unreferenced and is
 * garbage collected (all internal bookkeeping uses `WeakMap`).
 *
 * The factory is a `useState` initializer and must be pure. React StrictMode
 * may invoke it more than once in development.
 * Each component instance gets its own isolated store.
 *
 * Use the returned proxy with `useClassyStore()` to read state in the same component
 * or pass it down via props/context to share within a subtree.
 *
 * @param factory - A function that returns a class instance (or plain object).
 *                  Used as the component state initializer.
 * @returns A reactive store proxy scoped to the component's lifetime.
 *
 * @example
 * ```tsx
 * function Counter() {
 *   const store = useLocalStore(() => new CounterStore());
 *   const count = useClassyStore(store, (state) => state.count);
 *   return <button onClick={() => store.increment()}>{count}</button>;
 * }
 * ```
 */
export function useLocalStore<T extends object>(factory: () => T): T {
  const [store] = useState(() => createClassyStore(factory()));
  return store;
}
