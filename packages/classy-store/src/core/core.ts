import type {DepEntry, StoreInternal} from '../types';
import {canProxy, findGetterDescriptor} from '../utils/internal/internal';

// ── Global state ──────────────────────────────────────────────────────────────

/** Global version counter shared across all stores. */
let globalVersion = 0;

/** Maps every store proxy → its internal bookkeeping. */
const internalsMap = new WeakMap<object, StoreInternal>();

// ── Dependency tracking for computed getters ──────────────────────────────────

/**
 * Stack of active dependency trackers. Each entry records which properties
 * a getter reads during evaluation. A stack (not a single variable) is needed
 * because getter A can read getter B, which pushes a second tracker.
 */
const trackerStack: {
  internal: StoreInternal;
  prop: string | symbol;
  deps: DepEntry[];
}[] = [];

/** Returns the tracker currently recording deps, or `null` if none is active. */
function activeTracker() {
  return trackerStack.length > 0 ? trackerStack[trackerStack.length - 1] : null;
}

/**
 * Record a dependency on the active tracker (if any).
 * Called from the GET trap whenever a non-getter, non-method property is read.
 */
function recordDep(
  internal: StoreInternal,
  prop: string | symbol,
  value: unknown,
): void {
  const tracker = activeTracker();
  if (!tracker) return;

  // Only record deps for reads on the SAME proxy that owns the getter.
  // Child-proxy reads don't need explicit tracking because child mutations
  // bubble up via version numbers on the parent's childInternals.
  if (tracker.internal !== internal) return;

  const childInternal = internal.childInternals.get(prop);
  if (childInternal) {
    tracker.deps.push({
      kind: 'version',
      internal: childInternal,
      version: childInternal.version,
      parentTarget: internal.target,
      prop,
    });
  } else {
    tracker.deps.push({kind: 'value', target: internal.target, prop, value});
  }
}

/**
 * Record a computed getter dependency on the active tracker (if any).
 * Unlike `recordDep`, this creates a `'computed'` dep entry that validates
 * through the computed cache rather than re-executing the raw getter.
 */
function recordComputedDep(
  internal: StoreInternal,
  prop: string | symbol,
  value: unknown,
): void {
  const tracker = activeTracker();
  if (!tracker) return;
  if (tracker.internal !== internal) return;

  tracker.deps.push({kind: 'computed', internal, prop, value});
}

/**
 * Check whether all dependencies from a previous computation are still valid.
 */
function areDepsValid(deps: DepEntry[]): boolean {
  for (const dep of deps) {
    if (dep.kind === 'version') {
      // Verify the parent property still references the same child object.
      // If the property was replaced entirely (e.g., store.items = newArray),
      // the old child internal is detached and its version never changes.
      // This check catches that case.
      if (
        !Object.is(Reflect.get(dep.parentTarget, dep.prop), dep.internal.target)
      )
        return false;
      if (dep.internal.version !== dep.version) return false;
    } else if (dep.kind === 'computed') {
      // Validate through the computed cache — never re-execute the raw getter.
      const cached = dep.internal.computedCache.get(dep.prop);
      if (!cached) return false; // no cache → must recompute
      if (!areDepsValid(cached.deps)) return false; // nested deps changed
      if (!Object.is(cached.value, dep.value)) return false; // value changed
    } else {
      // Check that the property still exists — if it was deleted and
      // dep.value was `undefined`, Object.is(undefined, undefined) would
      // incorrectly pass without this guard.
      if (!Reflect.has(dep.target, dep.prop)) return false;
      if (!Object.is(Reflect.get(dep.target, dep.prop), dep.value))
        return false;
    }
  }
  return true;
}

/**
 * Evaluate a computed getter with memoization.
 * Returns the cached value if dependencies haven't changed.
 * Otherwise re-evaluates with dependency tracking and caches the result.
 */
function evaluateComputed(
  internal: StoreInternal,
  prop: string | symbol,
  getterFn: () => unknown,
  receiver: object,
): unknown {
  const cached = internal.computedCache.get(prop);
  if (cached && areDepsValid(cached.deps)) {
    return cached.value;
  }

  // Cycle detection: if this (internal, prop) pair is already being
  // evaluated higher in the stack, the getter chain is recursive.
  for (const existing of trackerStack) {
    if (existing.internal === internal && existing.prop === prop) {
      const cycle = trackerStack
        .slice(trackerStack.indexOf(existing))
        .map((f) => String(f.prop))
        .concat(String(prop))
        .join(' → ');
      throw new Error(
        `@codebelt/classy-store: circular computed getter dependency: ${cycle}`,
      );
    }
  }

  // Push a new tracker frame for this getter evaluation.
  const frame = {internal, prop, deps: [] as DepEntry[]};
  trackerStack.push(frame);
  try {
    const value = getterFn.call(receiver);
    internal.computedCache.set(prop, {value, deps: frame.deps});
    return value;
  } finally {
    trackerStack.pop();
  }
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Retrieve the internal bookkeeping for a store proxy.
 * Throws if the object was not created with `createClassyStore()`.
 */
export function getInternal(proxy: object): StoreInternal {
  const internal = internalsMap.get(proxy);
  if (!internal)
    throw new Error('@codebelt/classy-store: object is not a store proxy');
  return internal;
}

// ── Notification batching ─────────────────────────────────────────────────────

/**
 * Bump version from the mutated node up to the root, invalidate snapshot caches,
 * and schedule a single microtask notification (deduped at the root level).
 *
 * Version propagation is what enables structural sharing in snapshots: unchanged
 * children keep their old version, so the snapshot cache returns the same frozen ref.
 */
function scheduleNotify(internal: StoreInternal): void {
  let current: StoreInternal | null = internal;
  while (current) {
    current.version = ++globalVersion;
    current = current.parent;
  }

  const root = getRoot(internal);
  if (!root.notifyScheduled) {
    root.notifyScheduled = true;
    queueMicrotask(() => {
      root.notifyScheduled = false;
      for (const listener of root.listeners) {
        try {
          listener();
        } catch (e) {
          console.error(e);
        }
      }
    });
  }
}

/** Walk the parent chain to find the root StoreInternal (the notification hub). */
function getRoot(internal: StoreInternal): StoreInternal {
  let current = internal;
  while (current.parent) {
    current = current.parent;
  }
  return current;
}

// ── Create proxy (recursive) ──────────────────────────────────────────────────

/**
 * Create an ES6 Proxy around `target` with SET/GET/DELETE traps.
 *
 * This is the core of the library's reactivity. The proxy intercepts:
 * - **SET**: compares old/new with `Object.is`, cleans up child proxies on replacement,
 *   forwards the write, and schedules a batched notification.
 * - **GET**: detects class getters (memoized), binds methods to the proxy, lazily wraps
 *   nested objects/arrays in child proxies, and records dependencies for computed getters.
 * - **DELETE**: cleans up child proxies and schedules notification.
 *
 * Nested objects are recursively wrapped on first access (lazy deep proxy).
 */
function createStoreProxy<T extends object>(
  target: T,
  parent: StoreInternal | null,
): T {
  const internal: StoreInternal = {
    target,
    version: ++globalVersion,
    listeners: new Set(),
    childProxies: new Map(),
    childInternals: new Map(),
    parent,
    notifyScheduled: false,
    computedCache: new Map(),
  };

  /** Cache for bound methods so we return the same reference each time. */
  const boundMethods = new Map<
    string | symbol,
    (...args: unknown[]) => unknown
  >();

  const proxy = new Proxy(target, {
    set(_target, prop, value, _receiver) {
      const oldValue = Reflect.get(_target, prop);
      if (Object.is(oldValue, value)) return true; // noop — same value

      // If the new value replaces a child proxy, clean it up.
      if (internal.childProxies.has(prop)) {
        internal.childProxies.delete(prop);
        internal.childInternals.delete(prop);
      }

      // Drop any cached bound method — the previous binding is dead now.
      boundMethods.delete(prop);

      Reflect.set(_target, prop, value);
      scheduleNotify(internal);
      return true;
    },

    get(_target, prop, receiver) {
      // 1. Check for getters on the prototype chain (computed values).
      const getterDesc = findGetterDescriptor(_target, prop);
      if (getterDesc?.get) {
        // Memoized: evaluate with dependency tracking, return cached if deps unchanged.
        const value = evaluateComputed(
          internal,
          prop,
          getterDesc.get,
          receiver,
        );
        // Record as a computed dependency for any parent getter currently tracking.
        // Uses 'computed' dep kind so validation goes through the cache, not raw getter.
        recordComputedDep(internal, prop, value);
        return value;
      }

      const value = Reflect.get(_target, prop);

      // 2. Methods: bind to the proxy so `this.prop = x` goes through SET trap.
      if (typeof value === 'function') {
        // Array prototype methods should not be cached the same way as class methods.
        if (Array.isArray(_target)) {
          return value.bind(receiver);
        }
        const cached = boundMethods.get(prop);
        if (cached) return cached;
        const bound = (value as (...args: unknown[]) => unknown).bind(receiver);
        boundMethods.set(prop, bound);
        return bound;
      }

      // 3. Nested plain objects/arrays: lazy-wrap in a child proxy.
      if (canProxy(value)) {
        let childProxy = internal.childProxies.get(prop);
        if (!childProxy) {
          childProxy = createStoreProxy(value as object, internal);
          internal.childProxies.set(prop, childProxy);
          const childInternal = internalsMap.get(childProxy) as StoreInternal;
          internal.childInternals.set(prop, childInternal);
        }
        // Record dependency AFTER ensuring child proxy/internal exists.
        recordDep(internal, prop, value);
        return childProxy;
      }

      // 4. Primitives — record dependency and return.
      recordDep(internal, prop, value);
      return value;
    },

    deleteProperty(_target, prop) {
      if (internal.childProxies.has(prop)) {
        internal.childProxies.delete(prop);
        internal.childInternals.delete(prop);
      }
      boundMethods.delete(prop);
      const deleted = Reflect.deleteProperty(_target, prop);
      if (deleted) {
        scheduleNotify(internal);
      }
      return deleted;
    },
  });

  internalsMap.set(proxy, internal);
  return proxy;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Wraps a class instance in a reactive proxy.
 *
 * - Mutations (property writes, array push/splice, etc.) are intercepted and
 *   batched into a single notification per microtask.
 * - Class getters are automatically memoized — they only recompute when a
 *   dependency they read changes.
 * - Methods are automatically bound so `this` mutations go through the proxy.
 *
 * @param instance - A class instance (or plain object) to make reactive.
 * @returns The same object wrapped in a reactive Proxy.
 *
 * @example
 * ```ts
 * const myStore = createClassyStore(new MyClass());
 * ```
 */
export function createClassyStore<T extends object>(instance: T): T {
  return createStoreProxy(instance, null);
}

/**
 * Subscribe to store changes. The callback fires once per batched mutation
 * (coalesced via `queueMicrotask`), not once per individual property write.
 *
 * @param proxy - A reactive proxy created by `createClassyStore()`.
 * @param callback - Invoked after each batched mutation.
 * @returns An unsubscribe function. Call it to stop receiving notifications.
 */
export function subscribe(proxy: object, callback: () => void): () => void {
  const internal = getInternal(proxy);
  // Always subscribe on the root so notifications fire regardless of
  // whether the user subscribes to the root proxy or a child proxy.
  const root = getRoot(internal);
  root.listeners.add(callback);
  return () => {
    root.listeners.delete(callback);
  };
}

/**
 * Returns the current version number of a store proxy.
 *
 * Versions are monotonically increasing and bump on any mutation in the
 * store's subtree (child mutations propagate up to the root). Useful for
 * debugging, custom cache invalidation, or testing whether a store has changed.
 */
export function getVersion(proxy: object): number {
  return getInternal(proxy).version;
}
