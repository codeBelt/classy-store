import {createProxy, isChanged} from 'proxy-compare';
import {useCallback, useRef, useSyncExternalStore} from 'react';
import {subscribe as coreSubscribe, getInternal} from '../core/core';
import {snapshot} from '../snapshot/snapshot';
import type {Snapshot} from '../types';

// ── Overloads ─────────────────────────────────────────────────────────────────

/**
 * Subscribe to a store proxy with an explicit selector.
 *
 * Re-renders only when the selected value changes (compared via `Object.is`
 * by default, or a custom `isEqual`).
 *
 * @param proxyStore - A reactive proxy created by `store()`.
 * @param selector  - Picks data from the immutable snapshot.
 * @param isEqual   - Optional custom equality function (default: `Object.is`).
 */
export function useStore<T extends object, S>(
  proxyStore: T,
  selector: (snap: Snapshot<T>) => S,
  isEqual?: (a: S, b: S) => boolean,
): S;

/**
 * Subscribe to a store proxy **without** a selector (auto-tracked mode).
 *
 * Returns a `proxy-compare` tracking proxy over the immutable snapshot.
 * The component only re-renders when a property it actually read changes.
 *
 * @param proxyStore - A reactive proxy created by `store()`.
 */
export function useStore<T extends object>(proxyStore: T): Snapshot<T>;

// ── Implementation ────────────────────────────────────────────────────────────

export function useStore<T extends object, S>(
  proxyStore: T,
  selector?: (snap: Snapshot<T>) => S,
  isEqual?: (a: S, b: S) => boolean,
): Snapshot<T> | S {
  // Validate that the argument is actually a store proxy (throws if not).
  getInternal(proxyStore);

  // Stable subscribe function (internal identity never changes for a given store).
  const subscribe = useCallback(
    (onStoreChange: () => void) => coreSubscribe(proxyStore, onStoreChange),
    [proxyStore],
  );

  // ── Refs used by both modes (always allocated to satisfy Rules of Hooks) ──

  // Selector mode refs
  const snapRef = useRef<Snapshot<T> | undefined>(undefined);
  const resultRef = useRef<S | undefined>(undefined);

  // Auto-track mode refs
  const affected = useRef(new WeakMap<object, unknown>()).current;
  const proxyCache = useRef(new WeakMap<object, unknown>()).current;
  const prevSnapRef = useRef<Snapshot<T> | undefined>(undefined);
  const wrappedRef = useRef<Snapshot<T> | undefined>(undefined);

  // ── Single getSnapshot for useSyncExternalStore ───────────────────────────

  const getSnapshot = (): Snapshot<T> | S =>
    selector
      ? getSelectorSnapshot(proxyStore, snapRef, resultRef, selector, isEqual)
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
 * previous one via `Object.is` (or a custom `isEqual`). Returns the previous
 * result reference when equal, preventing unnecessary React re-renders.
 *
 * Pure function -- no hooks, safe to call from `useSyncExternalStore`.
 */
function getSelectorSnapshot<T extends object, S>(
  proxyStore: T,
  snapRef: React.RefObject<Snapshot<T> | undefined>,
  resultRef: React.RefObject<S | undefined>,
  selector: (snap: Snapshot<T>) => S,
  isEqual?: (a: S, b: S) => boolean,
): S {
  const nextSnap = snapshot(proxyStore);

  // Fast path: same snapshot reference → same result.
  if (snapRef.current === nextSnap && resultRef.current !== undefined) {
    return resultRef.current;
  }

  const nextResult = selector(nextSnap);
  snapRef.current = nextSnap;

  // Check equality with previous result.
  if (
    resultRef.current !== undefined &&
    (isEqual
      ? isEqual(resultRef.current, nextResult)
      : Object.is(resultRef.current, nextResult))
  ) {
    return resultRef.current;
  }

  resultRef.current = nextResult;
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
