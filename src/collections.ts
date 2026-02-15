import {PROXYABLE} from './utils';

// ── ReactiveMap ───────────────────────────────────────────────────────────────

/**
 * A Map-like class backed by a plain array so `store()` can proxy mutations.
 *
 * Native `Map` uses internal slots that ES6 Proxy can't intercept, so mutations
 * like `.set()` would be invisible to the store. `ReactiveMap` solves this by
 * storing entries in a plain array (`_entries`) that the proxy can track.
 *
 * Usage:
 * ```ts
 * const myStore = store({ users: reactiveMap<string, User>() });
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
      for (const [k, v] of initial) {
        const index = this._entries.findIndex(([ek]) => Object.is(ek, k));
        if (index !== -1) {
          this._entries[index] = [k, v];
        } else {
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
    const entry = this._entries.find(([k]) => Object.is(k, key));
    return entry ? entry[1] : undefined;
  }

  /** Returns `true` if `key` exists. O(n) linear scan. */
  has(key: K): boolean {
    return this._entries.some(([k]) => Object.is(k, key));
  }

  /** Sets `key` to `value`. Updates in-place if key exists, appends otherwise. */
  set(key: K, value: V): this {
    const index = this._entries.findIndex(([k]) => Object.is(k, key));
    if (index !== -1) {
      this._entries[index] = [key, value];
    } else {
      this._entries.push([key, value]);
    }
    return this;
  }

  /** Removes the entry for `key`. Returns `true` if found. */
  delete(key: K): boolean {
    const index = this._entries.findIndex(([k]) => Object.is(k, key));
    if (index === -1) return false;
    this._entries.splice(index, 1);
    return true;
  }

  /** Removes all entries. Uses splice to trigger proxy notification. */
  clear(): void {
    this._entries.splice(0, this._entries.length);
  }

  /** Returns an iterator over the keys. */
  keys(): IterableIterator<K> {
    return this._entries.map(([k]) => k)[Symbol.iterator]();
  }

  /** Returns an iterator over the values. */
  values(): IterableIterator<V> {
    return this._entries.map(([, v]) => v)[Symbol.iterator]();
  }

  /** Returns an iterator over [key, value] pairs. */
  entries(): IterableIterator<[K, V]> {
    return this._entries.map(([k, v]) => [k, v] as [K, V])[Symbol.iterator]();
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
 * A Set-like class backed by a plain array so `store()` can proxy mutations.
 *
 * Native `Set` uses internal slots that ES6 Proxy can't intercept, so mutations
 * like `.add()` would be invisible to the store. `ReactiveSet` solves this by
 * storing items in a plain array (`_items`) that the proxy can track.
 *
 * Usage:
 * ```ts
 * const myStore = store({ tags: reactiveSet<string>(['urgent']) });
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
      for (const v of initial) {
        if (!this._items.some((item) => Object.is(item, v))) {
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
    return this._items.some((item) => Object.is(item, value));
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
    const index = this._items.findIndex((item) => Object.is(item, value));
    if (index === -1) return false;
    this._items.splice(index, 1);
    return true;
  }

  /** Removes all items. Uses splice to trigger proxy notification. */
  clear(): void {
    this._items.splice(0, this._items.length);
  }

  /** Returns an iterator over the values (same as `values()`, matching Set API). */
  keys(): IterableIterator<T> {
    return this._items[Symbol.iterator]();
  }

  /** Returns an iterator over the values. */
  values(): IterableIterator<T> {
    return this._items[Symbol.iterator]();
  }

  /** Returns an iterator over [value, value] pairs, matching the native Set API. */
  entries(): IterableIterator<[T, T]> {
    return this._items.map((v) => [v, v] as [T, T])[Symbol.iterator]();
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
 * Wrap the parent object with `store()` for full reactivity.
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
 * Wrap the parent object with `store()` for full reactivity.
 *
 * @param initial - Optional iterable of values.
 */
export function reactiveSet<T>(initial?: Iterable<T>): ReactiveSet<T> {
  return new ReactiveSet(initial);
}
