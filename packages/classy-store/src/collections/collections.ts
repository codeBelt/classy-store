import {identityOf, isTrackingProxy, unwrap} from '../storeRuntime';
import {PROXYABLE} from '../utils/internal/internal';

// ── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Find a key (map) or value (set) in a backing array.
 *
 * Members are compared by identity, so an object matches whether it is given
 * raw, as a store proxy, or as a snapshot of the same object; primitives use
 * `Object.is`. Live state and plain snapshots are scanned on the raw array,
 * with no proxy work per entry. A tracked read in a React component still goes
 * entry by entry through its proxy, so that the component records what it
 * compared.
 */
function indexOfMember(
  backing: readonly unknown[],
  member: unknown,
  keyed: boolean,
): number {
  const wanted = identityOf(member);
  const source = isTrackingProxy(backing) ? backing : unwrap(backing);
  for (let index = 0; index < source.length; index++) {
    const entry = source[index];
    const candidate = keyed ? (entry as readonly unknown[])[0] : entry;
    const identity =
      typeof candidate === 'object' && candidate !== null
        ? identityOf(candidate)
        : candidate;
    if (Object.is(identity, wanted)) return index;
  }
  return -1;
}

// ── ReactiveMap ───────────────────────────────────────────────────────────────

/**
 * A Map-like class backed by a plain array so `createClassyStore()` can proxy mutations.
 *
 * Native `Map` uses internal slots that ES6 Proxy can't intercept, so mutations
 * like `.set()` would be invisible to the store. `ReactiveMap` solves this by
 * storing entries in a plain array (`_entries`) that the proxy can track.
 *
 * Usage:
 * ```ts
 * const myStore = createClassyStore({ users: reactiveMap<string, User>() });
 * myStore.users.set('id1', { name: 'Alice' }); // reactive
 * ```
 */
export class ReactiveMap<K, V> {
  static [PROXYABLE] = true;

  /** @internal Backing storage — proxied by store(). */
  _entries: [K, V][] = [];

  /** Deduplicates initial entries by key (last value wins, matching native `Map`). */
  constructor(initial?: Iterable<[K, V]>) {
    if (initial) {
      // Track key → index for O(1) dedupe instead of O(n) linear scan.
      const indexByKey = new Map<K, number>();
      for (const [k, v] of initial) {
        const existing = indexByKey.get(k);
        if (existing !== undefined) {
          this._entries[existing] = [k, v];
        } else {
          indexByKey.set(k, this._entries.length);
          this._entries.push([k, v]);
        }
      }
    }
  }

  /** Returns the number of entries. */
  get size(): number {
    return this._entries.length;
  }

  /** Returns the value for `key`, or `undefined`. O(n) linear scan. */
  get(key: K): V | undefined {
    const entries = this._entries;
    const index = indexOfMember(entries, key, true);
    // Read the hit through `entries`: a live value comes back reactive.
    return index === -1 ? undefined : entries[index][1];
  }

  /** Returns `true` if `key` exists. O(n) linear scan. */
  has(key: K): boolean {
    return indexOfMember(this._entries, key, true) !== -1;
  }

  /** Sets `key` to `value`. Keeps the existing key and position if present, appends otherwise. */
  set(key: K, value: V): this {
    const entries = this._entries;
    const index = indexOfMember(entries, key, true);
    if (index !== -1) {
      entries[index][1] = value;
    } else {
      entries.push([key, value]);
    }
    return this;
  }

  /** Removes the entry for `key`. Returns `true` if found. */
  delete(key: K): boolean {
    const entries = this._entries;
    const index = indexOfMember(entries, key, true);
    if (index === -1) return false;
    entries.splice(index, 1);
    return true;
  }

  /** Removes all entries. Uses splice to trigger proxy notification. */
  clear(): void {
    this._entries.splice(0, this._entries.length);
  }

  /**
   * Returns an iterator over the keys.
   * Snapshot semantics: the iterator reflects the entries at call time and
   * is unaffected by subsequent mutations.
   */
  keys(): IterableIterator<K> {
    const snap = this._entries.slice();
    let i = 0;
    return {
      next: () =>
        i < snap.length
          ? {value: snap[i++][0], done: false}
          : {value: undefined as unknown as K, done: true},
      [Symbol.iterator]() {
        return this;
      },
    };
  }

  /**
   * Returns an iterator over the values.
   * Snapshot semantics: the iterator reflects the entries at call time and
   * is unaffected by subsequent mutations.
   */
  values(): IterableIterator<V> {
    const snap = this._entries.slice();
    let i = 0;
    return {
      next: () =>
        i < snap.length
          ? {value: snap[i++][1], done: false}
          : {value: undefined as unknown as V, done: true},
      [Symbol.iterator]() {
        return this;
      },
    };
  }

  /**
   * Returns an iterator over [key, value] pairs.
   * Snapshot semantics: the iterator reflects the entries at call time and
   * is unaffected by subsequent mutations.
   */
  entries(): IterableIterator<[K, V]> {
    const snap = this._entries.slice();
    let i = 0;
    return {
      next: () => {
        if (i >= snap.length) {
          return {value: undefined as unknown as [K, V], done: true};
        }
        const e = snap[i++];
        return {value: [e[0], e[1]] as [K, V], done: false};
      },
      [Symbol.iterator]() {
        return this;
      },
    };
  }

  /** Calls `callback` for each entry, matching the native `Map.forEach` signature. */
  forEach(callback: (value: V, key: K, map: ReactiveMap<K, V>) => void): void {
    for (const [k, v] of this._entries) {
      callback(v, k, this);
    }
  }

  /** Enables `for...of` iteration over [key, value] pairs. */
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries();
  }
}

// ── ReactiveSet ───────────────────────────────────────────────────────────────

/**
 * A Set-like class backed by a plain array so `createClassyStore()` can proxy mutations.
 *
 * Native `Set` uses internal slots that ES6 Proxy can't intercept, so mutations
 * like `.add()` would be invisible to the store. `ReactiveSet` solves this by
 * storing items in a plain array (`_items`) that the proxy can track.
 *
 * Usage:
 * ```ts
 * const myStore = createClassyStore({ tags: reactiveSet<string>(['urgent']) });
 * myStore.tags.add('bug'); // reactive
 * ```
 */
export class ReactiveSet<T> {
  static [PROXYABLE] = true;

  /** @internal Backing storage — proxied by store(). */
  _items: T[] = [];

  /** Deduplicates initial values using `Object.is` comparison. */
  constructor(initial?: Iterable<T>) {
    if (initial) {
      // Use a Set for O(1) dedupe (Set uses SameValueZero — NaN-aware, like Object.is for our purposes).
      const seen = new Set<T>();
      for (const v of initial) {
        if (!seen.has(v)) {
          seen.add(v);
          this._items.push(v);
        }
      }
    }
  }

  /** Returns the number of unique items. */
  get size(): number {
    return this._items.length;
  }

  /** Returns `true` if `value` exists. O(n) linear scan. */
  has(value: T): boolean {
    return indexOfMember(this._items, value, false) !== -1;
  }

  /** Adds `value` if not already present (no-op for duplicates). */
  add(value: T): this {
    if (!this.has(value)) {
      this._items.push(value);
    }
    return this;
  }

  /** Removes `value`. Returns `true` if found. */
  delete(value: T): boolean {
    const items = this._items;
    const index = indexOfMember(items, value, false);
    if (index === -1) return false;
    items.splice(index, 1);
    return true;
  }

  /** Removes all items. Uses splice to trigger proxy notification. */
  clear(): void {
    this._items.splice(0, this._items.length);
  }

  /**
   * Returns an iterator over the values (same as `values()`, matching Set API).
   * Snapshot semantics: the iterator reflects the items at call time and
   * is unaffected by subsequent mutations.
   */
  keys(): IterableIterator<T> {
    return this.values();
  }

  /**
   * Returns an iterator over the values.
   * Snapshot semantics: the iterator reflects the items at call time and
   * is unaffected by subsequent mutations.
   */
  values(): IterableIterator<T> {
    const snap = this._items.slice();
    let i = 0;
    return {
      next: () =>
        i < snap.length
          ? {value: snap[i++], done: false}
          : {value: undefined as unknown as T, done: true},
      [Symbol.iterator]() {
        return this;
      },
    };
  }

  /**
   * Returns an iterator over [value, value] pairs, matching the native Set API.
   * Snapshot semantics: the iterator reflects the items at call time and
   * is unaffected by subsequent mutations.
   */
  entries(): IterableIterator<[T, T]> {
    const snap = this._items.slice();
    let i = 0;
    return {
      next: () => {
        if (i >= snap.length) {
          return {value: undefined as unknown as [T, T], done: true};
        }
        const v = snap[i++];
        return {value: [v, v] as [T, T], done: false};
      },
      [Symbol.iterator]() {
        return this;
      },
    };
  }

  /** Calls `callback` for each item, matching the native `Set.forEach` signature. */
  forEach(callback: (value: T, key: T, set: ReactiveSet<T>) => void): void {
    for (const v of this._items) {
      callback(v, v, this);
    }
  }

  /** Enables `for...of` iteration over values. */
  [Symbol.iterator](): IterableIterator<T> {
    return this.values();
  }
}

// ── Factory functions ─────────────────────────────────────────────────────────

/**
 * Creates a reactive Map-like collection backed by a plain array.
 * Wrap the parent object with `createClassyStore()` for full reactivity.
 *
 * @param initial - Optional iterable of `[key, value]` pairs.
 */
export function reactiveMap<K, V>(
  initial?: Iterable<[K, V]>,
): ReactiveMap<K, V> {
  return new ReactiveMap(initial);
}

/**
 * Creates a reactive Set-like collection backed by a plain array.
 * Wrap the parent object with `createClassyStore()` for full reactivity.
 *
 * @param initial - Optional iterable of values.
 */
export function reactiveSet<T>(initial?: Iterable<T>): ReactiveSet<T> {
  return new ReactiveSet(initial);
}
