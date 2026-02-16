import {getInternal} from '../core/core';
import type {Snapshot, StoreInternal} from '../types';
import {canProxy, findGetterDescriptor} from '../utils/internal/internal';

// ── Caches ────────────────────────────────────────────────────────────────────

/**
 * Version-stamped snapshot cache for tracked (proxied) sub-trees.
 * Key: raw target object → [version, frozen snapshot].
 */
const snapCache = new WeakMap<object, [version: number, snap: object]>();

/**
 * Cache for untracked nested objects (never accessed through the proxy).
 * Key: the raw mutable object → frozen deep clone.
 * Safe because untracked objects can't be mutated through the proxy.
 */
const untrackedCache = new WeakMap<object, object>();

/**
 * Per-snapshot, per-getter cache. Ensures repeated access to the same getter
 * on the same frozen snapshot returns the identical reference.
 */
const snapshotGetterCache = new WeakMap<
  object,
  Map<string | symbol, unknown>
>();

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
const crossSnapMemo = new WeakMap<
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
function areMemoedDepsValid(currentSnap: object, deps: GetterDep[]): boolean {
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
  let memoMap = crossSnapMemo.get(target);
  const prev = memoMap?.get(key);

  let result: unknown;

  if (prev && areMemoedDepsValid(currentSnap, prev.deps)) {
    // Dependencies unchanged → reuse previous result.
    result = prev.result;
  } else {
    // Compute fresh with dep tracking.
    const computation = computeWithTracking(currentSnap, getterFn);
    result = computation.result;

    // Save cross-snapshot memo.
    if (!memoMap) {
      memoMap = new Map();
      crossSnapMemo.set(target, memoMap);
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

/**
 * Resolve a single property value into its snapshot equivalent.
 *
 * - If the key has a tracked child internal → recurse (version-cached, structural sharing).
 * - If the value is a nested plain object/array without tracking → deep-clone & freeze (cached by identity).
 * - Otherwise → return the value as-is (primitive, Date, Map, function, etc.).
 */
function snapshotValue(
  value: unknown,
  parentInternal: StoreInternal,
  key: string | symbol,
): unknown {
  const childInternal = parentInternal.childInternals.get(key);
  if (childInternal) {
    return createSnapshotRecursive(childInternal.target, childInternal);
  }
  if (canProxy(value)) {
    return deepFreezeClone(value as object);
  }
  return value;
}

/**
 * Deep-clone and freeze a plain object or array that is NOT tracked by a proxy.
 * Cached by raw object identity for structural sharing across snapshots.
 */
function deepFreezeClone(value: object): object {
  const cached = untrackedCache.get(value);
  if (cached) return cached;

  let clone: Record<string | symbol, unknown> | unknown[];

  if (Array.isArray(value)) {
    clone = [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      (clone as unknown[])[i] = canProxy(item)
        ? deepFreezeClone(item as object)
        : item;
    }
  } else {
    clone = Object.create(Object.getPrototypeOf(value));
    for (const key of Reflect.ownKeys(value)) {
      const desc = Object.getOwnPropertyDescriptor(value, key);
      if (!desc || !('value' in desc)) continue;
      const item = desc.value;
      (clone as Record<string | symbol, unknown>)[key] = canProxy(item)
        ? deepFreezeClone(item as object)
        : item;
    }
  }

  Object.freeze(clone);
  untrackedCache.set(value, clone);
  return clone;
}

/**
 * Collect all getter descriptors from the prototype chain of `target`.
 * Returns an array of [propertyName, getterFunction] pairs.
 *
 * Only includes getters defined on the prototype (class getters), not on the
 * instance itself. When a getter is overridden in a subclass, the most-derived
 * version wins (we walk from the instance's direct prototype upward and skip
 * keys already seen).
 */
function collectGetters(
  target: object,
): Array<[string | symbol, () => unknown]> {
  const getters: Array<[string | symbol, () => unknown]> = [];
  const seen = new Set<string | symbol>();
  let proto: object | null = Object.getPrototypeOf(target);
  while (proto && proto !== Object.prototype) {
    for (const key of Reflect.ownKeys(proto)) {
      if (key === 'constructor') continue;
      if (seen.has(key)) continue; // most-derived version already collected
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc?.get) {
        getters.push([key, desc.get]);
        seen.add(key);
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  return getters;
}

/**
 * Install lazy-memoizing getters on a snapshot object.
 *
 * Each getter uses cross-snapshot memoization:
 * - Tracks which `this` properties the getter reads on first evaluation.
 * - On subsequent snapshots, if those properties are structurally the same
 *   (thanks to structural sharing), the previous result is returned.
 * - Within the same snapshot, repeated accesses always return the same ref.
 */
function installMemoizedGetters(
  snap: Record<string | symbol, unknown>,
  target: object,
): void {
  const getters = collectGetters(target);
  for (const [key, getterFn] of getters) {
    Object.defineProperty(snap, key, {
      get() {
        return evaluateSnapshotGetter(this as object, target, key, getterFn);
      },
      enumerable: true,
      configurable: true, // required so Object.freeze can make it non-configurable
    });
  }
}

/**
 * Recursively creates a frozen snapshot from a tracked (proxied) sub-tree.
 *
 * Each node checks its version-stamped cache first (O(1) hit). On a miss,
 * it builds a new frozen object by recursing into child internals (tracked
 * sub-trees) and deep-cloning untracked nested objects. Unchanged children
 * return the same cached reference, achieving structural sharing -- the key
 * to efficient `Object.is` equality in selectors.
 *
 * For class instances, the prototype chain is preserved and class getters
 * are installed as lazy-memoizing accessors via `installMemoizedGetters`.
 */
function createSnapshotRecursive<T extends object>(
  target: T,
  internal: StoreInternal,
): T {
  // Cache hit: version unchanged → return the same frozen snapshot reference.
  const cached = snapCache.get(target);
  if (cached && cached[0] === internal.version) {
    return cached[1] as T;
  }

  let snap: Record<string | symbol, unknown> | unknown[];

  if (Array.isArray(target)) {
    snap = [];
    for (let i = 0; i < target.length; i++) {
      (snap as unknown[])[i] = snapshotValue(target[i], internal, String(i));
    }
  } else {
    // Preserve the prototype chain and install memoized getters on the snapshot.
    snap = Object.create(Object.getPrototypeOf(target));
    for (const key of Reflect.ownKeys(target)) {
      // Skip prototype getters — they re-evaluate via the preserved prototype.
      if (findGetterDescriptor(target, key)?.get) continue;

      const desc = Object.getOwnPropertyDescriptor(target, key);
      if (!desc || !('value' in desc)) continue;

      (snap as Record<string | symbol, unknown>)[key] = snapshotValue(
        desc.value,
        internal,
        key,
      );
    }

    // Install lazy-memoizing getters with cross-snapshot caching.
    installMemoizedGetters(snap as Record<string | symbol, unknown>, target);
  }

  Object.freeze(snap);
  // Cache AFTER populating + freezing. The reference is stable.
  snapCache.set(target, [internal.version, snap]);
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
 * @param proxyStore - A reactive proxy created by `store()`.
 * @returns A deeply frozen plain-JS object (Snapshot<T>).
 */
export function snapshot<T extends object>(proxyStore: T): Snapshot<T> {
  const internal = getInternal(proxyStore);
  return createSnapshotRecursive(internal.target, internal) as Snapshot<T>;
}
