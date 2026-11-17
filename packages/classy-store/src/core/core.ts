import type {SubscribeOptions} from '../types';
import {
  canProxy,
  findPropertyDescriptor,
  getArrayIndex,
} from '../utils/internal/internal';
import type {DepEntry} from './core.types';
import {StoreInternal} from './ownership';

// ── Global state ──────────────────────────────────────────────────────────────

/** Maps every store proxy → its internal bookkeeping. */
const internalsMap = new WeakMap<object, StoreInternal>();
const targetNodes = new WeakMap<object, StoreInternal>();

/** Maps every frozen snapshot → the raw object it was built from. */
const snapshotSources = new WeakMap<object, object>();

/** Maps a React tracking proxy → the frozen snapshot it wraps. */
const trackedSnapshots = new WeakMap<object, object>();

/** @internal Record a frozen snapshot so the store recognises it later. */
export function registerSnapshot(snap: object, target: object): void {
  snapshotSources.set(snap, target);
}

/** @internal Record a render-tracking proxy created over a snapshot. */
export function registerTrackingProxy(proxy: object, snap: object): void {
  trackedSnapshots.set(proxy, snap);
}

/**
 * @internal Strip a store proxy or a tracking proxy, leaving the object it
 * wraps: the raw target for live state, the frozen snapshot for tracked reads.
 */
export function unwrap<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  const internal = internalsMap.get(value);
  if (internal) return internal.target as T;
  return (trackedSnapshots.get(value) ?? value) as T;
}

/**
 * @internal One identity for a raw object, its store proxy, every snapshot of
 * it, and tracked reads of those snapshots. Primitives are their own identity.
 */
export function identityOf(value: unknown): unknown {
  const raw = unwrap(value);
  if (typeof raw !== 'object' || raw === null) return raw;
  return snapshotSources.get(raw) ?? raw;
}

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
      parent: internal,
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
      if (dep.parent.childInternals.get(dep.prop) !== dep.internal)
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
  internal.resumeScope();
  return internal;
}

// ── Mutation notification ─────────────────────────────────────────────────────

/**
 * Bump version from the mutated node up to the root, invalidate snapshot caches,
 * notify sync subscribers, and schedule a single batched microtask notification.
 *
 * Version propagation is what enables structural sharing in snapshots: unchanged
 * children keep their old version, so the snapshot cache returns the same frozen ref.
 */
function notifyMutation(internal: StoreInternal): void {
  const owners = internal.ancestors();
  // Invalidate every path before any synchronous subscriber reads a snapshot.
  for (const node of owners) node.version++;
  if (transactionDepth) {
    // Inside a store method or array operation: tell synchronous subscribers
    // once, when the outermost call returns.
    for (const node of owners) {
      if (node.syncListeners.size) pendingSync.add(node);
    }
  } else {
    deliver(owners, 'syncListeners');
  }
  for (const node of owners) {
    if (!node.batchedListeners.size) continue;
    if (!pendingNotifications.size) queueMicrotask(flushNotifications);
    pendingNotifications.add(node);
  }
}

const pendingNotifications = new Set<StoreInternal>();

// ── Transactions ──────────────────────────────────────────────────────────────

let transactionDepth = 0;
const pendingSync = new Set<StoreInternal>();

/**
 * Run one store method or array operation as a transaction. Versions advance
 * with every write, so reads inside the call are current, but synchronous
 * subscribers hear about it once, after the outermost call returns or throws.
 * A sort of n rows is then one notification rather than n.
 */
function runTransaction<T>(run: () => T): T {
  transactionDepth++;
  try {
    return run();
  } finally {
    if (--transactionDepth === 0 && pendingSync.size) {
      const owners = new Set(pendingSync);
      pendingSync.clear();
      deliver(owners, 'syncListeners');
    }
  }
}

/** Bind a method to its proxy and run each call as a transaction. */
function transactional(
  method: (...args: unknown[]) => unknown,
  receiver: object,
): (...args: unknown[]) => unknown {
  return function (...args: unknown[]) {
    // A class stored as data stays constructible, as a bound function would.
    if (new.target) return Reflect.construct(method, args);
    return runTransaction(() => Reflect.apply(method, receiver, args));
  };
}

function flushNotifications(): void {
  const owners = new Set(pendingNotifications);
  pendingNotifications.clear();
  deliver(owners, 'batchedListeners');
}

function deliver(
  owners: Set<StoreInternal>,
  kind: 'syncListeners' | 'batchedListeners',
): void {
  // Copy first: a listener may subscribe or unsubscribe during delivery.
  const listeners: (() => void)[] = [];
  for (const node of owners) listeners.push(...node[kind]);
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error(error);
    }
  }
}

function linkChild(
  owner: StoreInternal,
  key: string | symbol,
  value: unknown,
  pending?: StoreInternal[],
): StoreInternal | undefined {
  if (typeof value !== 'object' || value === null) return;
  // A snapshot kept in a store stays an immutable value, held by reference.
  if (snapshotSources.has(value)) return;
  const child =
    internalsMap.get(value) ??
    (canProxy(value) ? createNode(value, pending) : undefined);
  if (child) owner.attach(key, child);
  return child;
}

/** Native array length writes remove indices without invoking DELETE traps. */
function detachTruncatedChildren(
  internal: StoreInternal,
  length: number,
): void {
  for (const prop of internal.childInternals.keys()) {
    const index = getArrayIndex(prop);
    if (index !== undefined && index >= length) internal.detach(prop);
  }
}

// ── Create proxy (recursive) ──────────────────────────────────────────────────

/** Register one write proxy for the target and index its outgoing data edges. */
function createNode(target: object, pending?: StoreInternal[]): StoreInternal {
  const existing = targetNodes.get(target) ?? internalsMap.get(target);
  if (existing) return existing;

  /** Cache for bound methods so we return the same reference each time. */
  const boundMethods = new Map<
    string | symbol,
    (...args: unknown[]) => unknown
  >();

  const proxy = new Proxy(target, {
    set(_target, prop, incoming, receiver) {
      internal.resumeScope();
      // Store the snapshot itself, never the render-tracking proxy around it.
      const value: unknown =
        typeof incoming === 'object' && incoming !== null
          ? (trackedSnapshots.get(incoming) ?? incoming)
          : incoming;
      const descriptor = findPropertyDescriptor(_target, prop);
      if (descriptor && !('value' in descriptor)) {
        // Setters perform their own writes. Use the proxy as `this` so nested
        // mutations invalidate their actual owners and notify just once.
        return Reflect.set(_target, prop, value, receiver);
      }
      const oldValue = Reflect.get(_target, prop);
      const previousChild = internal.childInternals.get(prop);
      if (
        Object.hasOwn(_target, prop) &&
        (Object.is(oldValue, value) ||
          (previousChild &&
            (previousChild.proxy === value || previousChild.target === value)))
      )
        return true;
      const oldLength =
        Array.isArray(_target) && prop === 'length'
          ? _target.length
          : undefined;
      const written = Reflect.set(_target, prop, value);
      const truncated =
        oldLength !== undefined && (_target as unknown[]).length < oldLength;
      // A non-configurable array index can reject the requested length after
      // higher indices were already removed. Clean up the actual truncation.
      if (truncated) {
        detachTruncatedChildren(internal, (_target as unknown[]).length);
      }
      if (!written && !truncated) return false;

      // Keep the old child connected when a property rejects the write.
      if (written) {
        const own = Object.getOwnPropertyDescriptor(_target, prop);
        if (
          !own ||
          !('value' in own) ||
          !linkChild(internal, prop, own.value)
        ) {
          internal.detach(prop);
        }
      }

      // Drop any cached bound method — the previous binding is dead now.
      boundMethods.delete(prop);

      notifyMutation(internal);
      return written;
    },

    get(_target, prop, receiver) {
      internal.resumeScope();
      // 1. Check for getters on the prototype chain (computed values).
      const getterDesc = findPropertyDescriptor(_target, prop);
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

      // 2. Methods: bind to the proxy so `this.prop = x` goes through SET trap,
      // and run each call as one transaction.
      if (typeof value === 'function') {
        const method = value as (...args: unknown[]) => unknown;
        // Array prototype methods should not be cached the same way as class methods.
        if (Array.isArray(_target)) return transactional(method, receiver);
        const cached = boundMethods.get(prop);
        if (cached) return cached;
        const bound = transactional(method, receiver);
        boundMethods.set(prop, bound);
        return bound;
      }

      // Own data edges are indexed before a retained alias can be mutated.
      // An inherited data property becomes an edge on its first proxy read.
      const child =
        internal.childInternals.get(prop) ?? linkChild(internal, prop, value);
      recordDep(internal, prop, value);
      return child ? child.proxy : value;
    },

    deleteProperty(_target, prop) {
      internal.resumeScope();
      const deleted = Reflect.deleteProperty(_target, prop);
      if (deleted) {
        internal.detach(prop);
        boundMethods.delete(prop);
        notifyMutation(internal);
      }
      return deleted;
    },
  });

  const internal = new StoreInternal(target, proxy);
  internalsMap.set(proxy, internal);
  targetNodes.set(target, internal);
  // Index each raw object once. A work list also permits deep input graphs
  // and cycles without invoking getters or recursing during construction.
  if (pending) {
    pending.push(internal);
  } else {
    const nodes = [internal];
    for (const owner of nodes) {
      for (const key of Reflect.ownKeys(owner.target)) {
        const desc = Object.getOwnPropertyDescriptor(owner.target, key);
        if (desc && 'value' in desc) linkChild(owner, key, desc.value, nodes);
      }
    }
  }
  return internal;
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
  const node = createNode(instance);
  node.isStoreRoot = true;
  node.resumeScope();
  return node.proxy as T;
}

/**
 * Subscribe to changes in a store, or in the subtree under one of its nested
 * proxies. By default, the callback fires once per batched mutation turn
 * (coalesced via `queueMicrotask`). Pass `{sync: true}` to be notified in the
 * same call stack: after each direct write, and once after each store method
 * or array operation.
 *
 * @param proxy - A reactive proxy created by `createClassyStore()`, or a nested proxy read from one.
 * @param callback - Invoked when that proxy's subtree changes.
 * @param options - Controls subscriber notification timing.
 * @returns An unsubscribe function. Call it to stop receiving notifications.
 */
export function subscribe(
  proxy: object,
  callback: () => void,
  options?: SubscribeOptions,
): () => void {
  const internal = getInternal(proxy);
  const listeners = options?.sync
    ? internal.syncListeners
    : internal.batchedListeners;
  // One entry per call: registering a callback twice gives two subscriptions.
  const listener = () => callback();
  listeners.add(listener);
  return () => {
    if (listeners.delete(listener)) internal.suspendIfDetached();
  };
}

/**
 * @internal Returns the current version number of a store proxy.
 *
 * Versions are monotonically increasing and bump on any mutation in the
 * store's subtree (child mutations propagate up to the root). Useful for
 * debugging, custom cache invalidation, or testing whether a store has changed.
 */
export function getVersion(proxy: object): number {
  return getInternal(proxy).version;
}
