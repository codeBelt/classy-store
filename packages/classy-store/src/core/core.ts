import type {SubscribeOptions} from '../types';
import {canProxy, getArrayIndex} from '../utils/internal/internal';
import type {DepEntry} from './core.types';
import {StoreInternal} from './ownership';

// ── Getters, decided per prototype ────────────────────────────────────────────

const hasOwn = Object.prototype.hasOwnProperty;

/**
 * Per prototype and key: the prototype object that holds an accessor for the
 * key, or `null` when the key is data there or absent everywhere. The table
 * holds no function, so a recompute asks the holder for the getter the class
 * has now. A prototype is assumed not to change after its first read through
 * a store; what happens when it does is unspecified.
 */
const accessorHolders = new WeakMap<
  object,
  Map<string | symbol, object | null>
>();

/**
 * A key absent from the whole chain is recorded only while the table is
 * smaller than this, so reads by keys an object does not have cannot grow
 * it without bound. Past it, such a key is looked up at each read.
 */
const absentKeyLimit = 256;

function inheritedAccessorHolder(
  proto: object | null,
  prop: string | symbol,
): object | null {
  if (!proto) return null;
  let table = accessorHolders.get(proto);
  if (!table) {
    table = new Map();
    accessorHolders.set(proto, table);
  }
  let holder = table.get(prop);
  if (holder !== undefined) return holder;
  holder = null;
  let found = false;
  for (let at: object | null = proto; at; at = Object.getPrototypeOf(at)) {
    const desc = Object.getOwnPropertyDescriptor(at, prop);
    if (desc) {
      if (!('value' in desc)) holder = at;
      found = true;
      break;
    }
  }
  if (found || table.size < absentKeyLimit) table.set(prop, holder);
  return holder;
}

/**
 * The object that holds an accessor for `prop` as seen from the node's raw
 * object, or `null` for data. An own key is data unless the node has an own
 * accessor, so the common read allocates no descriptor.
 */
function accessorHolder(
  internal: StoreInternal,
  prop: string | symbol,
): object | null {
  const target = internal.target;
  if (!hasOwn.call(target, prop)) {
    return inheritedAccessorHolder(Object.getPrototypeOf(target), prop);
  }
  if (!internal.ownAccessors) return null;
  // `hasOwnProperty` found a descriptor for the key a line above.
  const desc = Object.getOwnPropertyDescriptor(
    target,
    prop,
  ) as PropertyDescriptor;
  return 'value' in desc ? null : target;
}

/** How many keys the table of one prototype holds. For tests. */
export function prototypeTableSize(proto: object): number {
  return accessorHolders.get(proto)?.size ?? 0;
}

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

/** @internal Whether a value is a render-tracking proxy over a snapshot. */
export function isTrackingProxy(value: object): boolean {
  return trackedSnapshots.has(value);
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
      if (!cached || !areDepsValid(cached.deps)) return false; // no cache, or nested deps changed
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
  holder: object,
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
      throw new Error(codedMessage('getter-cycle', cycle));
    }
  }

  // The getter is read from its holder only when it has to run. One that was
  // removed since, or replaced by a value, leaves the key to be read as data.
  const getterFn = Object.getOwnPropertyDescriptor(holder, prop)?.get;
  if (!getterFn) {
    internal.computedCache.delete(prop);
    return Reflect.get(internal.target, prop, receiver);
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
 * The text of every error and logged report of the library:
 * `@codebelt/classy-store [code]: facts`. The code is stable from 1.0 and the
 * documentation's page of codes gives the advice for it; the facts are the
 * names the user wrote, when there are any.
 */
export function codedMessage(code: string, facts?: string): string {
  return `@codebelt/classy-store [${code}]${facts === undefined ? '' : `: ${facts}`}`;
}

/**
 * Retrieve the internal bookkeeping for a store proxy.
 * Throws if the object was not created with `createClassyStore()`.
 */
export function getInternal(proxy: object): StoreInternal {
  const internal = internalsMap.get(proxy);
  if (!internal) throw new Error(codedMessage('not-a-store'));
  internal.resumeIfDetached();
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

/** Close one transaction level; the outermost one notifies sync subscribers. */
function settleTransaction(): void {
  if (--transactionDepth === 0 && pendingSync.size) {
    const owners = new Set(pendingSync);
    pendingSync.clear();
    deliver(owners, 'syncListeners');
  }
}

/**
 * Bind a method to its proxy and run each call as a transaction. Versions
 * advance with every write, so reads inside the call are current, but
 * synchronous subscribers hear about it once, after the outermost call returns
 * or throws. A sort of n rows is then one notification rather than n.
 */
function transactional(
  method: (...args: unknown[]) => unknown,
  receiver: object,
): (...args: unknown[]) => unknown {
  return function (...args: unknown[]) {
    // A class stored as data stays constructible, as a bound function would.
    if (new.target) return Reflect.construct(method, args);
    transactionDepth++;
    try {
      return Reflect.apply(method, receiver, args);
    } finally {
      settleTransaction();
    }
  };
}

/**
 * Run several writes as one transaction. Use it for a loop or a group of direct
 * writes made outside a store method: synchronous subscribers, which includes
 * every framework binding, are notified once when `run` returns or throws,
 * instead of once per write. Store methods and array operations are
 * transactions already. Calls nest; the outermost one notifies.
 *
 * Only the synchronous part of `run` is covered. A write made after an `await`
 * happens once `batch()` has already returned, and notifies on its own.
 *
 * @param run - Performs the writes. Its return value is passed through.
 * @returns Whatever `run` returns.
 *
 * @example
 * ```ts
 * batch(() => {
 *   for (const row of rows) store.items.push(row);
 * });
 * ```
 */
export function batch<T>(run: () => T): T {
  transactionDepth++;
  try {
    return run();
  } finally {
    settleTransaction();
  }
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

/**
 * Being frozen is permanent, so a positive answer is remembered: asking a large
 * frozen array again would scan every element on each read.
 */
const frozenValues = new WeakSet<object>();

/** A snapshot, or any object its owner froze: a value the store never proxies. */
function isImmutableValue(value: object): boolean {
  if (snapshotSources.has(value) || frozenValues.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  frozenValues.add(value);
  return true;
}

/** A Proxy must return such a property's own value, never a proxy of it. */
function isReadOnly(descriptor: PropertyDescriptor | undefined): boolean {
  return descriptor?.configurable === false && descriptor.writable === false;
}

/**
 * Make `value` a child of `owner` at `key`, creating its proxy on first sight.
 * Returns nothing when the value stays as it is: a primitive, an opaque type,
 * an immutable value, or the value of a read-only property.
 */
function linkChild(
  owner: StoreInternal,
  key: string | symbol,
  value: unknown,
  pending?: StoreInternal[],
  descriptor?: PropertyDescriptor,
): StoreInternal | undefined {
  if (typeof value !== 'object' || value === null) return;
  // A store embedded by its proxy is already the value the property holds, so
  // it stays a child wherever it sits, including in a frozen object.
  const existing = internalsMap.get(value);
  if (!existing) {
    // An immutable value is held by reference, like a `Date`. Opaque types are
    // ruled out first: they are read far more often than they are frozen.
    if (!canProxy(value) || isImmutableValue(value)) return;
    if (
      isReadOnly(
        descriptor ?? Object.getOwnPropertyDescriptor(owner.target, key),
      )
    )
      return;
  }
  const child = createNode(value, pending);
  owner.attach(key, child);
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
      internal.resumeIfDetached();
      // Store the snapshot itself, never the render-tracking proxy around it.
      const value: unknown =
        typeof incoming === 'object' && incoming !== null
          ? (trackedSnapshots.get(incoming) ?? incoming)
          : incoming;
      if (accessorHolder(internal, prop)) {
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
          !linkChild(internal, prop, own.value, undefined, own)
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
      internal.resumeIfDetached();
      // 1. A getter, own or inherited, is a computed value.
      const holder = accessorHolder(internal, prop);
      if (holder) {
        // Memoized: evaluate with dependency tracking, return cached if deps unchanged.
        const value = evaluateComputed(internal, prop, holder, receiver);
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

    defineProperty(_target, prop, descriptor) {
      const defined = Reflect.defineProperty(_target, prop, descriptor);
      // `Object.freeze(proxy)` arrives here once per property. A property that
      // is now read-only holds its value as it is, as if frozen all along.
      const own = defined && Object.getOwnPropertyDescriptor(_target, prop);
      if (own) {
        if (!('value' in own)) {
          internal.ownAccessors = true;
        } else if (isReadOnly(own)) {
          const child = internal.childInternals.get(prop);
          // An embedded store's proxy is that value: it remains a child.
          if (child && child.proxy !== own.value) internal.detach(prop);
        }
      }
      return defined;
    },

    deleteProperty(_target, prop) {
      internal.resumeIfDetached();
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
        // A Proxy can list a key it does not describe.
        if (!desc) continue;
        if ('value' in desc) linkChild(owner, key, desc.value, nodes, desc);
        else owner.ownAccessors = true;
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
    listeners.delete(listener);
    internal.suspendIfDetached();
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
