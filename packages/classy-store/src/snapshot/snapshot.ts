import {markToTrack} from 'proxy-compare';
import {getInternal} from '../core/core';
import type {StoreInternal} from '../core/ownership';
import type {Snapshot} from '../types';
import {mapOwnArrayElements} from '../utils/internal/internal';

// ── Caches ────────────────────────────────────────────────────────────────────

/**
 * Version-stamped snapshot cache for tracked (proxied) sub-trees.
 * Key: raw target object → [version, frozen snapshot].
 */
const snapshotCache = new WeakMap<object, [version: number, snap: object]>();

/**
 * Per-snapshot, per-getter cache. Ensures repeated access to the same getter
 * on the same frozen snapshot returns the identical reference.
 */
const snapshotGetterCache = new WeakMap<
  object,
  Map<string | symbol, unknown>
>();

// A mutable restore needs the user's own descriptor, or the inherited getter
// already present on the clone's prototype.
const originalAccessors = new WeakMap<
  () => unknown,
  PropertyDescriptor | null
>();

export function originalSnapshotAccessor(getter: (() => unknown) | undefined) {
  return getter && originalAccessors.get(getter);
}

// ── Cross-snapshot getter memoization ─────────────────────────────────────────

/**
 * A dependency recorded during getter execution.
 * prop: the property name read on `this`.
 * value: the value returned (reference).
 */
type GetterDep = {prop: string | symbol; value: unknown};

/**
 * Cached result of a snapshot getter with the dependencies it read,
 * used for cross-snapshot memoization. When a new snapshot is created,
 * we check if the deps are still reference-equal (via structural sharing)
 * and return the cached result if so -- avoiding re-execution of the getter.
 */
type GetterMemoEntry = {deps: GetterDep[]; result: unknown};

/**
 * Cross-snapshot getter memoization cache.
 * Keyed by raw class instance (target), maps each getter name to its last
 * deps + result. This enables getter result stability across snapshot
 * boundaries: if `this.items` hasn't changed between snapshots (same
 * reference via structural sharing), the getter returns the same result.
 */
const crossSnapshotMemo = new WeakMap<
  object,
  Map<string | symbol, GetterMemoEntry>
>();

/**
 * Run a getter against the snapshot with dependency tracking.
 *
 * Creates a lightweight Proxy that intercepts `this.prop` reads and records
 * which properties (and their values/references) the getter accessed. The
 * Proxy delegates to the real frozen snapshot for actual values, so getters
 * that read other getters trigger the memoized getter chain correctly.
 */
function computeWithTracking(
  snap: object,
  getterFn: () => unknown,
): {deps: GetterDep[]; result: unknown} {
  const deps: GetterDep[] = [];
  const readProps = new Set<string | symbol>();

  // Use an empty non-frozen target — we delegate everything to `snap`.
  const handler: ProxyHandler<object> = {
    get(_dummyTarget, prop, _receiver) {
      // Delegate to the real snapshot (receiver = snap so installed getters
      // run with `this = snap`, triggering their own memoization chain).
      const value = Reflect.get(snap, prop, snap);
      if (!readProps.has(prop)) {
        readProps.add(prop);
        deps.push({prop, value});
      }
      return value;
    },
  };

  const tracked = new Proxy({}, handler);
  const result = getterFn.call(tracked);
  return {deps, result};
}

/**
 * Check if all previously recorded deps still hold on the current snapshot.
 * For data properties this is a reference comparison (structural sharing
 * guarantees stable refs for unchanged sub-trees). For getter properties
 * this invokes the getter (which is itself memoized), then compares.
 */
function areMemoizedDepsValid(currentSnap: object, deps: GetterDep[]): boolean {
  for (const dep of deps) {
    const currentValue = Reflect.get(currentSnap, dep.prop, currentSnap);
    if (!Object.is(currentValue, dep.value)) return false;
  }
  return true;
}

/**
 * Evaluate a snapshot getter with two layers of caching:
 *
 * 1. **Per-snapshot cache** — same getter on the same frozen snapshot always
 *    returns the same reference.
 * 2. **Cross-snapshot memo** — if the properties the getter read last time are
 *    structurally the same (reference equality via structural sharing), the
 *    previous result is returned without re-running the getter body.
 */
function evaluateSnapshotGetter(
  currentSnap: object,
  target: object,
  key: string | symbol,
  getterFn: () => unknown,
): unknown {
  // ── Per-snapshot fast path ──
  const perSnapCache = snapshotGetterCache.get(currentSnap);
  if (perSnapCache?.has(key)) return perSnapCache.get(key);

  // ── Cross-snapshot memo ──
  let memoMap = crossSnapshotMemo.get(target);
  const prev = memoMap?.get(key);

  let result: unknown;

  if (prev && areMemoizedDepsValid(currentSnap, prev.deps)) {
    // Dependencies unchanged → reuse previous result.
    result = prev.result;
  } else {
    // Compute fresh with dep tracking.
    const computation = computeWithTracking(currentSnap, getterFn);
    result = computation.result;

    // Save cross-snapshot memo.
    if (!memoMap) {
      memoMap = new Map();
      crossSnapshotMemo.set(target, memoMap);
    }
    memoMap.set(key, {deps: computation.deps, result});
  }

  // Save per-snapshot cache.
  let cache = snapshotGetterCache.get(currentSnap);
  if (!cache) {
    cache = new Map();
    snapshotGetterCache.set(currentSnap, cache);
  }
  cache.set(key, result);

  return result;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function markSnapshotForTracking(value: object): void {
  // proxy-compare 3 copies frozen string descriptors, but leaves symbol
  // descriptors frozen. Wrapping an object-valued symbol then violates Proxy
  // invariants. Compare those nodes as a whole until that dependency is fixed.
  const hasObjectSymbol = Object.getOwnPropertySymbols(value).some((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor &&
      'value' in descriptor &&
      typeof descriptor.value === 'object' &&
      descriptor.value !== null
    );
  });
  markToTrack(value, !hasObjectSymbol);
}

/** Return the versioned snapshot for a data edge, or its opaque/primitive value. */
function snapshotValue(
  value: unknown,
  parent: StoreInternal,
  key: string | symbol,
  inProgress: WeakSet<object>,
): unknown {
  const child = parent.childInternals.get(key);
  return child
    ? createSnapshotRecursive(child.target, child, inProgress)
    : value;
}

/** Install the nearest accessor for each key without invoking user code. */
function installMemoizedGetters(snap: object, target: object): void {
  const seen = new Set<string | symbol>();
  let proto: object | null = target;
  while (proto && proto !== Object.prototype) {
    for (const key of Reflect.ownKeys(proto)) {
      if (seen.has(key)) continue;
      seen.add(key);
      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      if (!descriptor || 'value' in descriptor) continue;
      const getter = descriptor.get;
      function memoizedGetter(this: object) {
        return getter
          ? evaluateSnapshotGetter(this, target, key, getter)
          : undefined;
      }
      const own = proto === target;
      originalAccessors.set(memoizedGetter, own ? descriptor : null);
      Object.defineProperty(snap, key, {
        get: memoizedGetter,
        enumerable: own ? descriptor.enumerable : true,
        configurable: true,
      });
    }
    proto = Object.getPrototypeOf(proto);
  }
}

/**
 * Recursively creates a frozen snapshot from a tracked (proxied) sub-tree.
 *
 * Each node checks its version-stamped cache first (O(1) hit). On a miss,
 * it builds a new frozen object by recursing into child internals (tracked
 * sub-trees). Unchanged children
 * return the same cached reference, achieving structural sharing -- the key
 * to efficient `Object.is` equality in selectors.
 *
 * For class instances, the prototype chain is preserved and class getters
 * are installed as lazy-memoizing accessors via `installMemoizedGetters`.
 */
function createSnapshotRecursive<T extends object>(
  target: T,
  internal: StoreInternal,
  inProgress: WeakSet<object> = new WeakSet(),
): T {
  // Cache hit: version unchanged → return the same frozen snapshot reference.
  const cached = snapshotCache.get(target);
  if (cached && cached[0] === internal.version) {
    return cached[1] as T;
  }

  if (inProgress.has(target)) {
    throw new Error(
      '@codebelt/classy-store: circular reference detected in snapshot',
    );
  }
  inProgress.add(target);

  let snap: Record<string | symbol, unknown> | unknown[];

  if (Array.isArray(target)) {
    snap = mapOwnArrayElements(target, (value, key) =>
      snapshotValue(value, internal, key, inProgress),
    );
  } else {
    // Preserve the prototype chain and install memoized getters on the snapshot.
    snap = Object.create(Object.getPrototypeOf(target));
    for (const key of Reflect.ownKeys(target)) {
      const desc = Object.getOwnPropertyDescriptor(target, key);
      if (!desc || !('value' in desc)) continue;
      // Assignment can call an inherited setter (including Object.prototype.__proto__).
      Object.defineProperty(snap, key, {
        value: snapshotValue(desc.value, internal, key, inProgress),
        enumerable: desc.enumerable,
        configurable: true,
        writable: true,
      });
    }

    // Install lazy-memoizing getters with cross-snapshot caching.
    installMemoizedGetters(snap as Record<string | symbol, unknown>, target);
  }

  markSnapshotForTracking(snap);
  Object.freeze(snap);
  // Cache AFTER populating + freezing. The reference is stable.
  snapshotCache.set(target, [internal.version, snap]);
  inProgress.delete(target);
  return snap as T;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates an immutable, deeply-frozen snapshot of the store proxy's current state.
 *
 * **Structural sharing:** unchanged sub-trees reuse the previous snapshot's
 * object reference, so `===` comparison can cheaply detect changes.
 *
 * **Version-cached:** calling `snapshot()` multiple times without intervening
 * mutations returns the identical snapshot object (O(1) cache hit).
 *
 * **Getters:** class getters are automatically memoized — they compute once
 * per snapshot and their results are stable across snapshots when dependencies
 * haven't changed (cross-snapshot memoization).
 *
 * @param proxyStore - A reactive proxy created by `createClassyStore()`.
 * @returns A deeply frozen plain-JS object (Snapshot<T>).
 */
export function snapshot<T extends object>(proxyStore: T): Snapshot<T> {
  const internal = getInternal(proxyStore);
  return createSnapshotRecursive(internal.target, internal) as Snapshot<T>;
}
