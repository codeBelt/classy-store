import {createProxy, isChanged} from 'proxy-compare';
import {useCallback, useRef, useState, useSyncExternalStore} from 'react';
import {
  subscribe as coreSubscribe,
  createClassyStore,
  getInternal,
} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

type EqualityFn<T> = (a: T, b: T) => boolean;

export type UseClassyStoreOptions = {
  sync?: boolean;
};

export type UseClassyStoreSelectorOptions<S> = UseClassyStoreOptions & {
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
 * @param options   - Controls equality and subscriber notification timing.
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
 * @param options - Controls subscriber notification timing.
 */
export function useClassyStore<T extends object>(
  proxyStore: T,
  options?: UseClassyStoreOptions,
): Snapshot<T>;

// ── Implementation ────────────────────────────────────────────────────────────

export function useClassyStore<T extends object, S>(
  proxyStore: T,
  selectorOrOptions?: ((snap: Snapshot<T>) => S) | UseClassyStoreOptions,
  selectorOptions?: UseClassyStoreSelectorOptions<S>,
): Snapshot<T> | S {
  // Validate that the argument is actually a store proxy (throws if not).
  getInternal(proxyStore);

  const selector =
    typeof selectorOrOptions === 'function' ? selectorOrOptions : undefined;
  const options:
    | UseClassyStoreOptions
    | UseClassyStoreSelectorOptions<S>
    | undefined =
    typeof selectorOrOptions === 'function'
      ? selectorOptions
      : selectorOrOptions;
  const sync = options?.sync === true;
  const isEqual = selectorOptions?.isEqual;

  // Stable subscribe function (internal identity never changes for a given store).
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      coreSubscribe(proxyStore, onStoreChange, sync ? {sync: true} : undefined),
    [proxyStore, sync],
  );

  // ── Refs used by both modes (always allocated to satisfy Rules of Hooks) ──

  // Selector mode refs
  const snapRef = useRef<Snapshot<T> | undefined>(undefined);
  const resultRef = useRef<S | undefined>(undefined);
  // Tracks whether `resultRef` holds a real prior result (so a selector that
  // legitimately returns `undefined` still benefits from the fast path).
  const hasResultRef = useRef(false);

  // Auto-track mode refs
  const affected = useRef(new WeakMap<object, unknown>()).current;
  const proxyCache = useRef(new WeakMap<object, unknown>()).current;
  const prevSnapRef = useRef<Snapshot<T> | undefined>(undefined);
  const wrappedRef = useRef<Snapshot<T> | undefined>(undefined);

  // ── Single getSnapshot for useSyncExternalStore ───────────────────────────

  const getSnapshot = (): Snapshot<T> | S =>
    selector
      ? getSelectorSnapshot(
          proxyStore,
          snapRef,
          resultRef,
          hasResultRef,
          selector,
          isEqual,
        )
      : getAutoTrackSnapshot(
          proxyStore,
          affected,
          proxyCache,
          prevSnapRef,
          wrappedRef,
        );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── Selector mode logic (pure function, no hooks) ─────────────────────────────

/**
 * `getSnapshot` implementation for selector mode.
 *
 * Fast-paths when the snapshot reference hasn't changed (O(1)). Otherwise
 * runs the selector against the new snapshot and compares the result to the
 * previous one via `Object.is` (or `options.isEqual`). Returns the previous
 * result reference when equal, preventing unnecessary React re-renders.
 *
 * Pure function -- no hooks, safe to call from `useSyncExternalStore`.
 */
function getSelectorSnapshot<T extends object, S>(
  proxyStore: T,
  snapRef: React.RefObject<Snapshot<T> | undefined>,
  resultRef: React.RefObject<S | undefined>,
  hasResultRef: React.RefObject<boolean>,
  selector: (snap: Snapshot<T>) => S,
  isEqual?: EqualityFn<S>,
): S {
  const nextSnap = snapshot(proxyStore);

  // Fast path: same snapshot reference → same result.
  if (snapRef.current === nextSnap && hasResultRef.current) {
    return resultRef.current as S;
  }

  const nextResult = selector(nextSnap);
  snapRef.current = nextSnap;

  // Check equality with previous result.
  if (
    hasResultRef.current &&
    (isEqual
      ? isEqual(resultRef.current as S, nextResult)
      : Object.is(resultRef.current as S, nextResult))
  ) {
    return resultRef.current as S;
  }

  resultRef.current = nextResult;
  hasResultRef.current = true;
  return nextResult;
}

// ── Auto-tracked (selectorless) mode logic (pure function, no hooks) ──────────

/**
 * `getSnapshot` implementation for auto-tracked (selectorless) mode.
 *
 * Uses `proxy-compare` to diff only the properties the component actually read.
 * If the snapshot reference is the same, returns the cached tracking proxy.
 * If the snapshot changed but no tracked property differs (`isChanged` returns
 * false), also returns the cached proxy -- avoiding re-render. Only when a
 * relevant property changed does it create a new `createProxy` wrapper.
 *
 * Pure function -- no hooks, safe to call from `useSyncExternalStore`.
 */
function getAutoTrackSnapshot<T extends object>(
  proxyStore: T,
  affected: WeakMap<object, unknown>,
  proxyCache: WeakMap<object, unknown>,
  prevSnapRef: React.RefObject<Snapshot<T> | undefined>,
  wrappedRef: React.RefObject<Snapshot<T> | undefined>,
): Snapshot<T> {
  const nextSnap = snapshot(proxyStore);

  // If the raw snapshot is the same reference, nothing changed.
  if (prevSnapRef.current === nextSnap) {
    return wrappedRef.current as Snapshot<T>;
  }

  // Check if any property the component actually read has changed.
  if (
    prevSnapRef.current !== undefined &&
    !isChanged(prevSnapRef.current, nextSnap, affected)
  ) {
    // No property the component cares about changed → return same wrapped proxy.
    return wrappedRef.current as Snapshot<T>;
  }

  // Something relevant changed — create a new tracking proxy.
  prevSnapRef.current = nextSnap;
  const wrapped = createProxy(nextSnap, affected, proxyCache) as Snapshot<T>;
  wrappedRef.current = wrapped;
  return wrapped;
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

  function useStore(options?: UseClassyStoreOptions): Snapshot<T>;
  function useStore<S>(
    selector: (snap: Snapshot<T>) => S,
    options?: UseClassyStoreSelectorOptions<S>,
  ): S;
  function useStore<S>(
    selectorOrOptions?: ((snap: Snapshot<T>) => S) | UseClassyStoreOptions,
    options?: UseClassyStoreSelectorOptions<S>,
  ): Snapshot<T> | S {
    return useClassyStore(
      proxyStore,
      selectorOrOptions as (snap: Snapshot<T>) => S,
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
 * The factory function runs **once** per mount (via `useState` initializer).
 * Each component instance gets its own isolated store.
 *
 * Use the returned proxy with `useClassyStore()` to read state in the same component
 * or pass it down via props/context to share within a subtree.
 *
 * @param factory - A function that returns a class instance (or plain object).
 *                  Called once per component mount.
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
