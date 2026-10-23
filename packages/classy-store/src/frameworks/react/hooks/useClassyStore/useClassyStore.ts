import {createProxy, isChanged} from 'proxy-compare';
import {useEffect, useMemo, useRef, useSyncExternalStore} from 'react';
import {subscribe as coreSubscribe, getInternal} from '../../../../core/core';
import {snapshot} from '../../../../snapshot/snapshot';
import type {Snapshot} from '../../../../types';
import {hydrationSnapshots} from '../../utils/hydrationSnapshots/hydrationSnapshots';
import {SnapshotTargetCache} from '../../utils/snapshotTargetCache/snapshotTargetCache';
import {TrackingReadMap} from '../../utils/trackingReadMap/trackingReadMap';
import type {
  EqualityFn,
  UseClassyStoreSelectorOptions,
} from './useClassyStore.types';

// A frozen snapshot's backing copy is identical for every consumer. Without
// this cache, each row rescans and copies the entire containing list on access.
const snapshotTargets = new SnapshotTargetCache();

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
  const subscribe = useMemo(() => createSubscription(proxyStore), [proxyStore]);

  // ── Refs used by both modes (always allocated to satisfy Rules of Hooks) ──

  // Keep only committed selections shared between selector instances.
  // Each selector gets its own snapshot cache so concurrent renders do not
  // overwrite one another's cached snapshot or selected result.
  const committedSelectionRef = useRef<{value: S} | undefined>(undefined);
  const initialSnapshot = hydrationSnapshots.get(proxyStore) as
    | Snapshot<T>
    | undefined;
  const {getSelectedSnapshot, getServerSnapshot} = useMemo(
    () =>
      createSnapshotGetters(
        proxyStore,
        selector,
        isEqual,
        committedSelectionRef,
        initialSnapshot,
      ),
    [proxyStore, selector, isEqual, initialSnapshot],
  );

  // Each render owns its read set, seeded from committed reads of the same
  // immutable objects. Memoization can skip those reads on subsequent renders.
  // Weak keys release old dependencies as their snapshots become unreachable.
  const committedReads = useRef(new WeakMap<object, unknown>()).current;
  const affected = new TrackingReadMap(committedReads);
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

  const readServerSnapshot = (): Snapshot<T> | S => {
    const serverResult = getServerSnapshot
      ? getServerSnapshot()
      : getSnapshot();
    // This render's read set can filter the first live update, too. Seed only
    // when React hydrates so client-only mounts always start from current data.
    if (!selector) previousAutoSnapshot = serverResult as Snapshot<T>;
    return serverResult;
  };

  const result = useSyncExternalStore(
    subscribe,
    getSnapshot,
    readServerSnapshot,
  );

  useEffect(() => {
    committedSelectionRef.current = selector ? {value: result as S} : undefined;
    affected.commit();
  }, [result, selector, affected]);

  return selector
    ? result
    : (createProxy(
        result as Snapshot<T>,
        affected,
        proxyCache,
        snapshotTargets,
      ) as Snapshot<T>);
}

// ── Selector mode logic (pure function, no hooks) ─────────────────────────────

// Construct stable callbacks outside the hook's lexical scope. Engines can
// share a closure context with render-local values, otherwise keeping the first
// result and auto-tracked snapshot alive for the entire mounted subscription.
function createSubscription<T extends object>(proxyStore: T) {
  return (onStoreChange: () => void) =>
    coreSubscribe(proxyStore, onStoreChange, {sync: true});
}

function createSnapshotGetters<T extends object, S>(
  proxyStore: T,
  selector: ((snap: Snapshot<T>) => S) | undefined,
  isEqual: EqualityFn<S> | undefined,
  committedSelectionRef: {current: {value: S} | undefined},
  initialSnapshot: Snapshot<T> | undefined,
) {
  let hydrationSelection: {value: S; snapshot: Snapshot<T>} | undefined;
  const readServerSelection =
    initialSnapshot && selector
      ? createSelectorSnapshotGetter(
          () => initialSnapshot,
          selector,
          () => undefined,
          isEqual,
        )
      : undefined;

  return {
    getSelectedSnapshot: selector
      ? createSelectorSnapshotGetter(
          () => snapshot(proxyStore),
          selector,
          () => hydrationSelection ?? committedSelectionRef.current,
          isEqual,
        )
      : undefined,
    getServerSnapshot: initialSnapshot
      ? () => {
          if (!readServerSelection) return initialSnapshot;
          const value = readServerSelection();
          // Seed only this selector's live cache, and only when React actually
          // hydrates. Never overwrite committed data from an abandoned render.
          hydrationSelection = {value, snapshot: initialSnapshot};
          return value;
        }
      : undefined,
  };
}

/**
 * Create a cached `getSnapshot` for one store, selector, and equality function.
 *
 * Re-evaluates when any of those inputs change, even if the store did not.
 * Repeated reads of the same snapshot return the cached result, including
 * `undefined`. Equal selections retain their reference across selector changes.
 */
function createSelectorSnapshotGetter<T extends object, S>(
  getStoreSnapshot: () => Snapshot<T>,
  selector: (snap: Snapshot<T>) => S,
  getPreviousSelection: () => {value: S; snapshot?: Snapshot<T>} | undefined,
  isEqual?: EqualityFn<S>,
): () => S {
  let previousSnapshot: Snapshot<T> | undefined;
  let selection: {value: S; snapshot?: Snapshot<T>} | undefined;

  return () => {
    const nextSnapshot = getStoreSnapshot();
    if (previousSnapshot === nextSnapshot && selection) {
      return selection.value;
    }

    const previousSelection = selection ?? getPreviousSelection();
    // The same immutable input and selector can reuse the hydration result
    // directly, including selectors that allocate an object without isEqual.
    const nextResult =
      !selection && previousSelection?.snapshot === nextSnapshot
        ? previousSelection.value
        : selector(nextSnapshot);

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
