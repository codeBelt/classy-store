import {describe, expect, it, mock} from 'bun:test';
import {batch, createClassyStore, snapshot, subscribe} from '../index';

// Characterisation tests for the proxy invariants of a store: sealed and
// read-only objects, symbols, `__proto__`, sparse arrays, array length writes,
// `Object.defineProperty` and reflection. They pin what the code does today,
// through the public API only, so that a rewrite of the internals shows up as a
// failing test. A `FINDING` comment marks behaviour that looks like a bug, a
// silent failure or a surprise: it is pinned as it is, not endorsed.
//
// The store proxy has four traps: get, set, defineProperty and deleteProperty.
// Every other operation (`in`, `Object.keys`, a property descriptor, the
// prototype, extensibility) is answered by the raw object.

/** Flush the microtask that delivers batched notifications. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Only a store proxy can be subscribed to, which tells it from a raw value. */
function isStoreProxy(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  try {
    subscribe(value, () => {})();
    return true;
  } catch {
    return false;
  }
}

/** A synchronous subscriber, so that notifications can be counted at once. */
function watch(store: object) {
  const listener = mock(() => {});
  subscribe(store, listener, {sync: true});
  return listener;
}

/** A batched subscriber: assert on it only after `flush()`. */
function watchBatched(store: object) {
  const listener = mock(() => {});
  subscribe(store, listener);
  return listener;
}

/** Narrow away `undefined` where a test knows the value is there. */
function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected a value');
  return value;
}

/** The name of the error a call throws. */
function errorNameOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.name : String(error);
  }
  return 'no error';
}

/** The attributes of a property created by plain assignment. */
const ordinary = {writable: true, enumerable: true, configurable: true};

// ── Sealed and non-extensible objects ────────────────────────────────────────

describe('a sealed or non-extensible object as the store root', () => {
  it('a sealed root takes writes to its fields, and a new key or a delete throws a TypeError', () => {
    type Sealed = {count?: number; nested: {limit: number}; extra?: number};
    const store = createClassyStore<Sealed>(
      Object.seal({count: 1, nested: {limit: 10}}),
    );
    const listener = watch(store);

    store.count = 2;
    store.nested.limit = 11;
    expect(listener).toHaveBeenCalledTimes(2);

    expect(() => {
      store.extra = 1;
    }).toThrow(TypeError);
    expect(() => {
      delete store.count;
    }).toThrow(TypeError);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(snapshot(store)).toEqual({count: 2, nested: {limit: 11}});
  });

  it('Reflect.set and Reflect.deleteProperty report the same refusals as false, without throwing', () => {
    const store = createClassyStore(Object.seal({count: 1}));
    const listener = watch(store);
    const before = snapshot(store);

    expect(Reflect.set(store, 'extra', 1)).toBe(false);
    expect(Reflect.deleteProperty(store, 'count')).toBe(false);

    expect(listener).not.toHaveBeenCalled();
    expect(snapshot(store)).toBe(before);
    expect(Object.keys(store)).toEqual(['count']);
  });

  it('a non-extensible root lets a field be deleted, and then refuses to take it back', () => {
    type Closed = {count?: number; extra?: number};
    const store = createClassyStore<Closed>(
      Object.preventExtensions({count: 1}),
    );
    const listener = watch(store);

    expect(() => {
      store.extra = 1;
    }).toThrow(TypeError);
    expect(listener).not.toHaveBeenCalled();

    expect(delete store.count).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    expect(() => {
      store.count = 5;
    }).toThrow(TypeError);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({});
  });
});

describe('a sealed object held in a store', () => {
  it('is proxied: its fields are reactive, and a new key or a delete throws a TypeError', () => {
    type Config = {rate?: number; extra?: number};
    const config: Config = Object.seal({rate: 1});
    const store = createClassyStore({config});
    const listener = watch(store);

    store.config.rate = 2;
    expect(isStoreProxy(store.config)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    expect(() => {
      store.config.extra = 1;
    }).toThrow(TypeError);
    expect(() => {
      delete store.config.rate;
    }).toThrow(TypeError);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({config: {rate: 2}});
  });

  it('a sealed array takes index writes, and push, pop and a shorter length throw a TypeError', () => {
    const store = createClassyStore({list: Object.seal([{id: 1}, {id: 2}])});
    const listener = watch(store);

    store.list[0] = {id: 10};
    expect(listener).toHaveBeenCalledTimes(1);

    expect(() => store.list.push({id: 3})).toThrow(TypeError);
    expect(() => store.list.pop()).toThrow(TypeError);
    expect(() => {
      store.list.length = 0;
    }).toThrow(TypeError);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({list: [{id: 10}, {id: 2}]});
  });
});

describe('sealing or closing a store through its proxy', () => {
  it('Object.seal seals the raw object and notifies no one; fields stay reactive, a new key or a delete throws', () => {
    type Shape = {count?: number; nested: {limit: number}; extra?: number};
    const raw: Shape = {count: 1, nested: {limit: 10}};
    const store = createClassyStore(raw);
    const nested = store.nested;
    const listener = watch(store);

    expect(Object.seal(store)).toBe(store);
    expect(Object.isSealed(raw)).toBe(true);
    expect(listener).not.toHaveBeenCalled();

    store.count = 2;
    nested.limit = 11;
    expect(store.nested).toBe(nested);
    expect(listener).toHaveBeenCalledTimes(2);

    expect(() => {
      store.extra = 1;
    }).toThrow(TypeError);
    expect(() => {
      delete store.count;
    }).toThrow(TypeError);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(snapshot(store)).toEqual({count: 2, nested: {limit: 11}});
  });

  it('Object.preventExtensions closes the raw object: a new key throws, assigned or defined, and a delete still notifies', () => {
    type Shape = {count?: number; extra?: number};
    const raw: Shape = {count: 1};
    const store = createClassyStore(raw);
    const listener = watch(store);

    Object.preventExtensions(store);
    expect(Object.isExtensible(raw)).toBe(false);

    expect(() => {
      store.extra = 1;
    }).toThrow(TypeError);
    expect(() => Object.defineProperty(store, 'extra', {value: 1})).toThrow(
      TypeError,
    );
    expect(listener).not.toHaveBeenCalled();

    expect(delete store.count).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({});
  });
});

describe('frozen objects: what core.frozenValues.test.ts leaves out', () => {
  // FINDING: a frozen plain object throws on every assignment; a frozen store accepts one that changes nothing.
  it('assigning a frozen store the value a field already holds does not throw, where the raw object does', () => {
    const raw: {count: number} = Object.freeze({count: 1});
    const store = createClassyStore(raw);

    expect(() => {
      raw.count = 1;
    }).toThrow(TypeError);
    expect(() => {
      store.count = 1;
    }).not.toThrow();
    expect(() => {
      store.count = 2;
    }).toThrow(TypeError);
  });

  // FINDING: freezing a raw object after its store exists makes its nested objects unreadable through the store.
  it('a nested object throws a TypeError when read, once its raw parent was frozen behind the store', () => {
    const raw = {config: {rate: 1, nested: {limit: 10}}};
    const store = createClassyStore(raw);

    Object.freeze(raw.config);

    expect(store.config.rate).toBe(1);
    expect(() => store.config.nested).toThrow(TypeError);
    // A snapshot is built from the raw objects, so it is unaffected.
    expect(snapshot(store)).toEqual({config: {rate: 1, nested: {limit: 10}}});
  });

  // FINDING: for the same reason a store whose raw root was frozen cannot be spread or serialised.
  it('a store whose raw root was frozen behind it throws a TypeError when spread or passed to JSON.stringify', () => {
    const raw = {config: {rate: 1}, count: 0};
    const store = createClassyStore(raw);

    Object.freeze(raw);

    expect(store.count).toBe(0);
    expect(Object.keys(store)).toEqual(['config', 'count']);
    expect(() => store.config).toThrow(TypeError);
    expect(() => ({...store})).toThrow(TypeError);
    expect(() => JSON.stringify(store)).toThrow(TypeError);
  });
});

// ── Non-writable and non-configurable properties ─────────────────────────────

describe('a field that is non-writable, non-configurable, or both, holding a primitive', () => {
  it('non-writable and configurable: it can be deleted, which notifies, and then assigned as an ordinary field', () => {
    const raw: {locked?: number} = {};
    Object.defineProperty(raw, 'locked', {
      value: 1,
      writable: false,
      enumerable: true,
      configurable: true,
    });
    const store = createClassyStore(raw);
    const listener = watch(store);

    expect(delete store.locked).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect('locked' in store).toBe(false);

    store.locked = 2;
    expect(listener).toHaveBeenCalledTimes(2);
    expect(Object.getOwnPropertyDescriptor(store, 'locked')).toEqual({
      value: 2,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  });

  it('writable and non-configurable: it takes writes, and deleting it throws a TypeError without notifying', () => {
    const raw: {pinned?: number} = {};
    Object.defineProperty(raw, 'pinned', {
      value: 1,
      writable: true,
      enumerable: true,
      configurable: false,
    });
    const store = createClassyStore(raw);
    const listener = watch(store);

    store.pinned = 2;
    expect(listener).toHaveBeenCalledTimes(1);

    expect(() => {
      delete store.pinned;
    }).toThrow(TypeError);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({pinned: 2});
  });

  it('neither: a write and a delete each throw a TypeError, and no one is notified', () => {
    const raw: {fixed?: number} = {};
    Object.defineProperty(raw, 'fixed', {
      value: 1,
      writable: false,
      enumerable: true,
      configurable: false,
    });
    const store = createClassyStore(raw);
    const listener = watch(store);
    const before = snapshot(store);

    expect(() => {
      store.fixed = 2;
    }).toThrow(TypeError);
    expect(() => {
      delete store.fixed;
    }).toThrow(TypeError);

    expect(store.fixed).toBe(1);
    expect(listener).not.toHaveBeenCalled();
    expect(snapshot(store)).toBe(before);
  });
});

/** A store whose `meta` field holds an object and has the given attributes. */
function createWithMeta(attributes: {
  writable: boolean;
  configurable: boolean;
}) {
  const meta = {tag: 'a'};
  const raw: {meta?: {tag: string}} = {};
  Object.defineProperty(raw, 'meta', {
    value: meta,
    enumerable: true,
    ...attributes,
  });
  return {store: createClassyStore(raw), meta};
}

describe('a field that is non-writable, non-configurable, or both, holding an object', () => {
  it('non-writable and configurable: the object is a proxy, and deleting the field disconnects it', () => {
    const {store} = createWithMeta({writable: false, configurable: true});
    const listener = watch(store);
    const meta = present(store.meta);

    meta.tag = 'b';
    expect(isStoreProxy(meta)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({meta: {tag: 'b'}});

    expect(delete store.meta).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    meta.tag = 'c';
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('writable and non-configurable: the object is a proxy and can be replaced, and deleting the field throws a TypeError', () => {
    const {store} = createWithMeta({writable: true, configurable: false});
    const listener = watch(store);
    const first = present(store.meta);
    expect(isStoreProxy(first)).toBe(true);

    store.meta = {tag: 'b'};
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.meta).not.toBe(first);
    first.tag = 'old';
    expect(listener).toHaveBeenCalledTimes(1);

    expect(() => {
      delete store.meta;
    }).toThrow(TypeError);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({meta: {tag: 'b'}});
  });

  // FINDING: a snapshot shares the raw object of a read-only field, so it is not immutable there.
  it('neither: the object is handed out raw, so a write to it notifies no one and shows in an existing snapshot', () => {
    const {store, meta} = createWithMeta({
      writable: false,
      configurable: false,
    });
    const listener = watch(store);
    const before = snapshot(store);
    expect(store.meta).toBe(meta);

    present(store.meta).tag = 'b';

    expect(listener).not.toHaveBeenCalled();
    expect(snapshot(store)).toBe(before);
    expect(Object.isFrozen(before.meta)).toBe(false);
    expect(before.meta?.tag).toBe('b');
  });
});

// ── Symbols ──────────────────────────────────────────────────────────────────

describe('symbols as data keys', () => {
  it('a write to a symbol key notifies, and the key is in the snapshot but not in Object.keys or JSON', () => {
    const tag = Symbol('tag');
    const store = createClassyStore({count: 0, [tag]: 'a'});
    const listener = watch(store);
    const before = snapshot(store);

    store[tag] = 'b';

    expect(listener).toHaveBeenCalledTimes(1);
    expect(before[tag]).toBe('a');
    expect(snapshot(store)[tag]).toBe('b');
    expect(Object.getOwnPropertySymbols(snapshot(store))).toEqual([tag]);
    expect(Object.keys(store)).toEqual(['count']);
    expect(JSON.stringify(store)).toBe('{"count":0}');
  });

  it('an object under a symbol key is a proxy: a write inside it notifies and gives a new frozen snapshot of it', () => {
    const meta = Symbol('meta');
    const store = createClassyStore({count: 0, [meta]: {n: 1}});
    const listener = watch(store);
    const before = snapshot(store);

    store[meta].n = 2;

    expect(isStoreProxy(store[meta])).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(before[meta]).toEqual({n: 1});
    const after = snapshot(store);
    expect(after[meta]).toEqual({n: 2});
    expect(Object.isFrozen(after[meta])).toBe(true);

    // It is shared between snapshots like any other nested object.
    store.count = 1;
    expect(snapshot(store)[meta]).toBe(after[meta]);
  });

  // FINDING: a snapshot of an array keeps its indices and its length; its other own properties are dropped.
  it("an array's own named and symbol-keyed properties are reactive on the store and missing from its snapshot", () => {
    const mark = Symbol('mark');
    const list = Object.assign([1, 2], {label: 'x', [mark]: {k: 1}});
    const store = createClassyStore({list});
    const listener = watch(store);

    store.list.label = 'y';
    store.list[mark].k = 2;

    expect(isStoreProxy(store.list[mark])).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    const snap = snapshot(store).list;
    expect(Reflect.ownKeys(snap)).toEqual(['0', '1', 'length']);
    expect('label' in snap).toBe(false);
    expect(mark in snap).toBe(false);
  });
});

describe('the well-known symbols a store is asked for', () => {
  it('spread, for...of, Array.from and destructuring over a nested array hand out the element proxies in a plain array', () => {
    const store = createClassyStore({items: [{id: 1}, {id: 2}]});
    const listener = watch(store);

    const spread = [...store.items];
    const visited: object[] = [];
    for (const item of store.items) visited.push(item);
    const [first] = store.items;

    expect(isStoreProxy(store.items[0])).toBe(true);
    expect(spread[0]).toBe(store.items[0]);
    expect(visited[1]).toBe(store.items[1]);
    expect(Array.from(store.items)[1]).toBe(store.items[1]);
    expect(first).toBe(store.items[0]);
    expect(listener).not.toHaveBeenCalled();

    // A write to an element of the copy reaches the store; a push to the copy does not.
    spread[0].id = 10;
    expect(listener).toHaveBeenCalledTimes(1);
    spread.push({id: 3});
    expect(isStoreProxy(spread)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({items: [{id: 10}, {id: 2}]});
  });

  it('a nested array is an array to Array.isArray and Object.prototype.toString, and slice, filter and concat return plain arrays of proxies', () => {
    const store = createClassyStore({items: [{id: 1}, {id: 2}]});
    const none: {id: number}[] = [];

    expect(Array.isArray(store.items)).toBe(true);
    expect(Object.prototype.toString.call(store.items)).toBe('[object Array]');
    expect(Object.prototype.toString.call(store)).toBe('[object Object]');

    // The array's own `constructor` reads as a bound wrapper, not as Array
    // (the FINDING on `store.constructor` in the getters file), so a derived
    // array is never a proxy.
    const sliced = store.items.slice();
    expect(store.items.constructor).not.toBe(Array);
    expect(sliced.constructor).toBe(Array);
    expect(isStoreProxy(sliced)).toBe(false);
    expect(sliced[0]).toBe(store.items[0]);
    expect(store.items.filter(() => true)[1]).toBe(store.items[1]);
    expect(none.concat(store.items)[0]).toBe(store.items[0]);
  });

  it('a class with a Symbol.iterator generator yields its rows as proxies from the store and as frozen snapshots from a snapshot', () => {
    class Bag {
      rows = [{id: 1}, {id: 2}];

      *[Symbol.iterator]() {
        yield* this.rows;
      }
    }
    const store = createClassyStore(new Bag());

    const live = [...store];
    const frozen = [...snapshot(store)];

    expect(live[0]).toBe(store.rows[0]);
    expect(isStoreProxy(live[1])).toBe(true);
    expect(frozen[0]).toBe(snapshot(store).rows[0]);
    expect(Object.isFrozen(frozen[1])).toBe(true);
  });

  it('a Symbol.toPrimitive method is called with the hint, with the proxy as this on the store and the snapshot as this on a snapshot', () => {
    const receivers: boolean[] = [];
    class Money {
      amount = 5;

      [Symbol.toPrimitive](hint: string) {
        receivers.push(isStoreProxy(this));
        return hint === 'number' ? this.amount : `USD ${this.amount}`;
      }
    }
    const store = createClassyStore(new Money());

    expect(Number(store)).toBe(5);
    expect(`${store}`).toBe('USD 5');

    store.amount = 7;
    expect(Number(store)).toBe(7);
    expect(`${snapshot(store)}`).toBe('USD 7');
    expect(receivers).toEqual([true, true, true, false]);
  });

  it('a Symbol.toStringTag getter is read as a memoized getter by Object.prototype.toString, on the store and on a snapshot', () => {
    let runs = 0;
    class Cart {
      items = [1];

      get [Symbol.toStringTag]() {
        runs++;
        return `Cart(${this.items.length})`;
      }
    }
    const store = createClassyStore(new Cart());

    expect(Object.prototype.toString.call(store)).toBe('[object Cart(1)]');
    expect(String(store)).toBe('[object Cart(1)]');
    expect(runs).toBe(1);

    store.items.push(2);
    expect(Object.prototype.toString.call(store)).toBe('[object Cart(2)]');
    expect(Object.prototype.toString.call(snapshot(store))).toBe(
      '[object Cart(2)]',
    );
  });
});

// ── __proto__ ────────────────────────────────────────────────────────────────

// The key is spelled through a constant because the linter warns on a literal
// `.__proto__`, and these tests are about that accessor. `store[PROTO]` reads
// and writes exactly as `store.__proto__` does.
const PROTO = '__proto__';

type Polluted = {count: number; admin?: boolean; __proto__?: {admin: boolean}};

/** A record parsed from JSON, where `__proto__` is an own key and not the prototype. */
function createPolluted() {
  const parsed: Polluted = JSON.parse(
    '{"__proto__": {"admin": true}, "count": 0}',
  );
  return createClassyStore(parsed);
}

describe('an own property named __proto__', () => {
  it('is an ordinary nested object: read as a proxy of the value, never as the prototype', () => {
    const store = createPolluted();

    expect(Object.getPrototypeOf(store)).toBe(Object.prototype);
    expect(Object.keys(store)).toEqual(['__proto__', 'count']);
    expect(isStoreProxy(store[PROTO])).toBe(true);
    expect(store[PROTO]).toEqual({admin: true});
    expect(store.admin).toBeUndefined();
  });

  it('a write inside it and a replacement of it each notify once and leave the prototype alone', () => {
    const store = createPolluted();
    const listener = watch(store);

    present(store[PROTO]).admin = false;
    expect(listener).toHaveBeenCalledTimes(1);
    expect(
      Object.getOwnPropertyDescriptor(snapshot(store), '__proto__')?.value,
    ).toEqual({admin: false});

    store[PROTO] = {admin: true};
    expect(listener).toHaveBeenCalledTimes(2);
    expect(
      Object.getOwnPropertyDescriptor(snapshot(store), '__proto__')?.value,
    ).toEqual({admin: true});
    expect(Object.getPrototypeOf(store)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(snapshot(store))).toBe(Object.prototype);
    expect(store.admin).toBeUndefined();
  });

  it('deleting it notifies once and uncovers the real prototype', () => {
    const store = createPolluted();
    const listener = watch(store);

    expect(delete store[PROTO]).toBe(true);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(Object.hasOwn(store, '__proto__')).toBe(false);
    // Typed by hand: after `delete`, TypeScript takes the property for undefined.
    expect<unknown>(store[PROTO]).toBe(Object.prototype);
  });
});

describe('assigning __proto__ or calling Object.setPrototypeOf on a store', () => {
  // FINDING: `store.__proto__ = x` is not a write to a field: it swaps the prototype of the raw object, in silence.
  it('store.__proto__ = x swaps the prototype of the raw object and notifies no one', async () => {
    type Swapped = {count: number; inherited?: number; __proto__?: object};
    const raw: Swapped = {count: 0};
    const store = createClassyStore(raw);
    const sync = watch(store);
    const batched = watchBatched(store);
    const proto = {inherited: 1};

    store[PROTO] = proto;
    await flush();

    expect(Object.getPrototypeOf(raw)).toBe(proto);
    expect(Object.hasOwn(store, '__proto__')).toBe(false);
    expect(store.inherited).toBe(1);
    expect(sync).not.toHaveBeenCalled();
    expect(batched).not.toHaveBeenCalled();
  });

  // FINDING: the swap does not advance the store, so a cached snapshot keeps the old prototype.
  it('a snapshot taken before Object.setPrototypeOf is still returned after it, until the next ordinary write', () => {
    const store = createClassyStore<{count: number; inherited?: number}>({
      count: 0,
    });
    const before = snapshot(store);

    Object.setPrototypeOf(store, {inherited: 1});

    expect(store.inherited).toBe(1);
    expect(snapshot(store)).toBe(before);
    expect(snapshot(store).inherited).toBeUndefined();

    store.count = 1;
    expect(snapshot(store).inherited).toBe(1);
    expect(Object.keys(snapshot(store))).toEqual(['count']);
  });

  // FINDING: `__proto__` is read as a getter with no dependencies, so its first result is kept for good.
  it('store.__proto__ keeps returning the prototype it first read, after a swap and after a write', () => {
    const store = createClassyStore<{count: number; __proto__?: object}>({
      count: 0,
    });
    const next = {inherited: 1};
    expect(store[PROTO]).toBe(Object.prototype);

    Object.setPrototypeOf(store, next);

    expect(Object.getPrototypeOf(store)).toBe(next);
    expect(store[PROTO]).toBe(Object.prototype);
    store.count = 1;
    expect(store[PROTO]).toBe(Object.prototype);
  });

  // FINDING: a method the store has handed out is cached by name, so a prototype swap never replaces it.
  it('a method called before a prototype swap keeps the old body for good; one first called after it has the new body', () => {
    class Before {
      count = 2;

      describe() {
        return 'before';
      }

      later() {
        return 'before';
      }
    }
    class After {
      count = 0;

      describe() {
        return 'after';
      }

      later() {
        return 'after';
      }
    }
    const store = createClassyStore(new Before());
    expect(store.describe()).toBe('before');

    Object.setPrototypeOf(store, After.prototype);

    expect(store).toBeInstanceOf(After);
    expect(store.describe()).toBe('before');
    expect(store.later()).toBe('after');

    store.count = 3;
    expect(store.describe()).toBe('before');
    expect(snapshot(store).describe()).toBe('after');
  });

  // FINDING: a getter result is cached by name too (see the redefined getter in the getters file).
  it('a getter read before a prototype swap keeps its old result until a dependency changes', () => {
    class Before {
      count = 2;

      get label() {
        return `before ${this.count}`;
      }

      get onlyBefore() {
        return 'before';
      }
    }
    class After {
      count = 0;

      get label() {
        return `after ${this.count}`;
      }

      get onlyAfter() {
        return `after ${this.count}`;
      }
    }
    const store = createClassyStore<Before & {onlyAfter?: string}>(
      new Before(),
    );
    expect([store.label, store.onlyBefore]).toEqual(['before 2', 'before']);

    Object.setPrototypeOf(store, After.prototype);

    expect(store.label).toBe('before 2');
    expect(store.onlyBefore).toBeUndefined();
    expect(store.onlyAfter).toBe('after 2');

    store.count = 3;
    expect(store.label).toBe('after 3');
    const snap = snapshot(store);
    expect(snap).toBeInstanceOf(After);
    expect(Object.keys(snap)).toEqual(['count', 'label', 'onlyAfter']);
    expect(snap.label).toBe('after 3');
  });

  // FINDING: so data from JSON can swap a store's prototype without a notification; a plain object does the same.
  it('Object.assign with a JSON __proto__ key swaps the prototype, as on a plain object, and notifies for the other keys only', () => {
    const store = createClassyStore<{count: number; admin?: boolean}>({
      count: 0,
    });
    const listener = watch(store);

    Object.assign(
      store,
      JSON.parse('{"__proto__": {"admin": true}, "count": 1}'),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(Object.hasOwn(store, '__proto__')).toBe(false);
    expect(store.admin).toBe(true);
    expect(Object.keys(snapshot(store))).toEqual(['count']);
    expect(snapshot(store).admin).toBe(true);
  });

  // FINDING: an object the store only inherits is tracked on the store but handed out raw by a snapshot.
  it('an object inherited from the new prototype is a proxy on the store, and the raw unfrozen object on a snapshot', () => {
    const proto = {shared: {n: 1}};
    const store = createClassyStore<{count: number; shared?: {n: number}}>({
      count: 0,
    });
    Object.setPrototypeOf(store, proto);
    const listener = watch(store);
    const shared = present(store.shared);

    shared.n = 2;

    expect(isStoreProxy(shared)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(proto.shared.n).toBe(2);
    const snap = snapshot(store);
    expect(snap.shared).toBe(proto.shared);
    expect(Object.isFrozen(snap.shared)).toBe(false);
  });
});

// ── Sparse arrays ────────────────────────────────────────────────────────────

describe('sparse arrays', () => {
  it('a hole reads as undefined and stays a hole to in, Object.keys, forEach and JSON on the live store', () => {
    // Built by index: `[{id: 0}, <hole>, <hole>, {id: 3}]`.
    const items = new Array<{id: number}>(4);
    items[0] = {id: 0};
    items[3] = {id: 3};
    const store = createClassyStore({items});
    let visited = 0;
    store.items.forEach(() => {
      visited++;
    });

    expect(store.items[1]).toBeUndefined();
    expect(1 in store.items).toBe(false);
    expect(store.items.length).toBe(4);
    expect(Object.keys(store.items)).toEqual(['0', '3']);
    expect(visited).toBe(2);
    expect(JSON.stringify(store.items)).toBe('[{"id":0},null,null,{"id":3}]');
  });

  it('a write past the end notifies once and leaves holes, in the store and in the snapshot', () => {
    const store = createClassyStore({items: ['a', 'b']});
    const listener = watch(store);
    const before = snapshot(store);

    store.items[5] = 'f';

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.items.length).toBe(6);
    expect(Object.keys(store.items)).toEqual(['0', '1', '5']);
    const after = snapshot(store).items;
    expect(after.length).toBe(6);
    expect(Object.keys(after)).toEqual(['0', '1', '5']);
    expect(3 in after).toBe(false);
    expect(before.items.length).toBe(2);
  });

  it('delete list[1] leaves a hole and the length, notifies once, and disconnects the element', () => {
    const store = createClassyStore({list: [{id: 0}, {id: 1}, {id: 2}]});
    const listener = watch(store);
    const removed = store.list[1];
    const before = snapshot(store);

    expect(delete store.list[1]).toBe(true);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.list.length).toBe(3);
    expect(1 in store.list).toBe(false);
    expect(store.list[1]).toBeUndefined();
    const after = snapshot(store).list;
    expect(Object.keys(after)).toEqual(['0', '2']);
    expect(after[0]).toBe(before.list[0]);
    expect(before.list[1]).toEqual({id: 1});

    removed.id = 99;
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('sort moves a hole to the end, in one notification', () => {
    // Built by index: `[{id: 0}, <hole>, {id: 2}]`.
    const list = new Array<{id: number}>(3);
    list[0] = {id: 0};
    list[2] = {id: 2};
    const store = createClassyStore({list});
    const listener = watch(store);

    store.list.sort((a, b) => b.id - a.id);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.list.length).toBe(3);
    expect(Object.keys(store.list)).toEqual(['0', '1']);
    expect(JSON.stringify(snapshot(store).list)).toBe(
      '[{"id":2},{"id":0},null]',
    );
  });
});

// ── Array length writes ──────────────────────────────────────────────────────

describe('writing the length of an array', () => {
  it('a longer length notifies once and adds holes, not undefined elements', () => {
    const store = createClassyStore({rows: [{v: 0}, {v: 1}]});
    const listener = watch(store);
    const before = snapshot(store);

    store.rows.length = 5;

    expect(listener).toHaveBeenCalledTimes(1);
    expect(Object.keys(store.rows)).toEqual(['0', '1']);
    expect(2 in store.rows).toBe(false);
    const after = snapshot(store).rows;
    expect(after.length).toBe(5);
    expect(Object.keys(after)).toEqual(['0', '1']);
    expect(after[0]).toBe(before.rows[0]);
    expect(before.rows.length).toBe(2);
  });

  it('length = 0 notifies a sync and a batched subscriber once each, however many elements go', async () => {
    const store = createClassyStore({rows: [{v: 0}, {v: 1}, {v: 2}]});
    const sync = watch(store);
    const batched = watchBatched(store);
    const before = snapshot(store);

    store.rows.length = 0;
    await flush();

    expect(sync).toHaveBeenCalledTimes(1);
    expect(batched).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({rows: []});
    expect(before.rows).toEqual([{v: 0}, {v: 1}, {v: 2}]);
  });

  it('a shorter length keeps the snapshots of the elements that stay', () => {
    const store = createClassyStore({rows: [{v: 0}, {v: 1}, {v: 2}]});
    const before = snapshot(store);

    store.rows.length = 1;

    const after = snapshot(store);
    expect(after.rows).toEqual([{v: 0}]);
    expect(after.rows).not.toBe(before.rows);
    expect(after.rows[0]).toBe(before.rows[0]);
    expect(2 in store.rows).toBe(false);
  });

  it('an element removed by a length write stays a working store of its own: its subscriber is notified, its old owner is not', () => {
    const store = createClassyStore({rows: [{v: 0}, {v: 1}]});
    const removed = store.rows[1];
    const onStore = watch(store);
    store.rows.length = 0;
    const onRemoved = watch(removed);

    removed.v = 10;

    expect(store.rows[1]).toBeUndefined();
    expect(removed.v).toBe(10);
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(onStore).toHaveBeenCalledTimes(1);
    expect(snapshot(removed)).toEqual({v: 10});

    // Pushing it back reconnects the same proxy.
    store.rows.push(removed);
    expect(store.rows[0]).toBe(removed);
    expect(onStore).toHaveBeenCalledTimes(2);
    removed.v = 11;
    expect(onStore).toHaveBeenCalledTimes(3);
    expect(snapshot(store)).toEqual({rows: [{v: 11}]});
  });

  // FINDING: a length set by definition truncates the raw array without the store dropping the removed elements.
  it('a length defined with Object.defineProperty empties the raw array in silence, and the store still hands out the removed element', () => {
    const store = createClassyStore({rows: [{v: 0}, {v: 1}]});
    const listener = watch(store);
    const removed = store.rows[1];
    const before = snapshot(store);

    Object.defineProperty(store.rows, 'length', {value: 0});

    expect(store.rows.length).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    expect(snapshot(store)).toBe(before);
    expect(1 in store.rows).toBe(false);
    expect(store.rows[1]).toBe(removed);

    // The removed element is still owned, so a write to it notifies the store.
    removed.v = 5;
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({rows: []});
  });
});

// ── Object.defineProperty ────────────────────────────────────────────────────

describe('Object.defineProperty on a store: a new data property', () => {
  // FINDING: the definition changes the store without telling anyone.
  it('is live at once, notifies no one, and is missing from the snapshot cached before it', async () => {
    const store = createClassyStore<{a: number; b?: number}>({a: 1});
    const sync = watch(store);
    const batched = watchBatched(store);
    const before = snapshot(store);

    expect(Object.defineProperty(store, 'b', {value: 2, ...ordinary})).toBe(
      store,
    );
    await flush();

    expect(store.b).toBe(2);
    expect('b' in store).toBe(true);
    expect(Object.keys(store)).toEqual(['a', 'b']);
    expect(sync).not.toHaveBeenCalled();
    expect(batched).not.toHaveBeenCalled();
    expect(snapshot(store)).toBe(before);
    expect('b' in snapshot(store)).toBe(false);
  });

  it('is in a snapshot first taken after it, when none was cached', () => {
    const store = createClassyStore<{a: number; b?: number}>({a: 1});

    Object.defineProperty(store, 'b', {value: 2, ...ordinary});

    expect(snapshot(store)).toEqual({a: 1, b: 2});
  });

  // FINDING: assigning the value the property already holds is no write, so it cannot bring the snapshot up to date.
  it('reaches a cached snapshot with the next write that changes a field, not with a write of the value it holds', () => {
    const store = createClassyStore<{a: number; b?: number}>({a: 1});
    const listener = watch(store);
    const before = snapshot(store);
    Object.defineProperty(store, 'b', {value: 2, ...ordinary});

    store.b = 2;
    expect(listener).not.toHaveBeenCalled();
    expect(snapshot(store)).toBe(before);

    store.a = 2;
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({a: 2, b: 2});
  });

  // FINDING: a defined object is unknown to the store until it is read, so a snapshot shares it raw.
  it('holding an object: a snapshot hands it out raw and unfrozen until the store has read it; then it is a proxy', () => {
    const store = createClassyStore<{a: number; child?: {n: number}}>({a: 1});
    const listener = watch(store);
    const raw = {n: 1};
    Object.defineProperty(store, 'child', {value: raw, ...ordinary});

    store.a = 2;
    const early = snapshot(store);
    expect(early.child).toBe(raw);
    expect(Object.isFrozen(early.child)).toBe(false);

    const child = present(store.child);
    expect(isStoreProxy(child)).toBe(true);
    child.n = 2;
    expect(listener).toHaveBeenCalledTimes(2);
    expect(snapshot(store).child).not.toBe(raw);
    expect(Object.isFrozen(snapshot(store).child)).toBe(true);
    expect(snapshot(store)).toEqual({a: 2, child: {n: 2}});
  });
});

describe('Object.defineProperty on a store: an existing property', () => {
  // FINDING: the live store and its cached snapshot disagree until the next write that changes a field.
  it('a redefined value is read at once, by the store and by a live getter, while the cached snapshot and its getter stay behind', () => {
    class Model {
      a = 1;

      get double() {
        return this.a * 2;
      }
    }
    const store = createClassyStore(new Model());
    const listener = watch(store);
    const before = snapshot(store);
    expect([store.double, before.double]).toEqual([2, 2]);

    Object.defineProperty(store, 'a', {value: 5});

    expect(listener).not.toHaveBeenCalled();
    expect([store.a, store.double]).toEqual([5, 10]);
    expect(snapshot(store)).toBe(before);
    expect([before.a, before.double]).toEqual([1, 2]);

    store.a = 6;
    expect([snapshot(store).a, snapshot(store).double]).toEqual([6, 12]);
  });

  // FINDING: the store keeps the proxy of the object it first saw under that key, and an assignment cannot repair it.
  it('a redefined object is ignored: reads, writes and snapshots stay on the old object, even after it is assigned', () => {
    const store = createClassyStore({child: {n: 1}});
    const listener = watch(store);
    const old = store.child;
    const replacement = {n: 100};

    Object.defineProperty(store, 'child', {value: replacement});

    expect(Object.getOwnPropertyDescriptor(store, 'child')?.value).toBe(
      replacement,
    );
    expect(store.child).toBe(old);

    // The raw object already holds it, so the assignment is taken for no change.
    store.child = replacement;
    expect(listener).not.toHaveBeenCalled();
    expect(store.child).toBe(old);

    store.child.n = 2;
    expect(replacement.n).toBe(100);
    expect(snapshot(store)).toEqual({child: {n: 2}});
  });

  // FINDING: the same happens when the new value is a primitive: the store answers with an object the raw data no longer has.
  it('a field redefined from an object to a primitive keeps returning the old object', () => {
    const store = createClassyStore<{child: {n: number} | number}>({
      child: {n: 1},
    });
    const old = store.child;

    Object.defineProperty(store, 'child', {value: 7});

    expect(Object.getOwnPropertyDescriptor(store, 'child')?.value).toBe(7);
    expect(store.child).toBe(old);
    expect(snapshot(store)).toEqual({child: {n: 1}});

    store.child = 8;
    expect(store.child).toBe(8);
    expect(snapshot(store)).toEqual({child: 8});
  });

  it('a field made non-enumerable leaves Object.keys and JSON at once, and the keys of a cached snapshot with the next write', () => {
    const store = createClassyStore({a: 1, b: 2});
    const listener = watch(store);
    const before = snapshot(store);

    Object.defineProperty(store, 'a', {enumerable: false});

    expect(Object.keys(store)).toEqual(['b']);
    expect(JSON.stringify(store)).toBe('{"b":2}');
    expect(store.a).toBe(1);
    expect(listener).not.toHaveBeenCalled();
    expect(snapshot(store)).toBe(before);
    expect(Object.keys(before)).toEqual(['a', 'b']);

    store.b = 3;
    expect(Object.keys(snapshot(store))).toEqual(['b']);
    expect(snapshot(store).a).toBe(1);
  });
});

describe('Object.defineProperty on a store: accessors, and several properties at once', () => {
  it('a new accessor is a memoized getter on the live store, and reaches a cached snapshot with the next write', () => {
    let runs = 0;
    const store = createClassyStore<{a: number; double?: number}>({a: 2});
    const listener = watch(store);
    const before = snapshot(store);

    Object.defineProperty(store, 'double', {
      get(this: {a: number}) {
        runs++;
        return this.a * 2;
      },
      enumerable: true,
      configurable: true,
    });

    expect([store.double, store.double]).toEqual([4, 4]);
    expect(runs).toBe(1);
    expect(listener).not.toHaveBeenCalled();
    expect(snapshot(store)).toBe(before);

    store.a = 3;
    expect(store.double).toBe(6);
    expect(snapshot(store).double).toBe(6);
  });

  // FINDING: the object the accessor replaced is still a child of the store.
  it('an accessor defined over a nested object leaves that object connected: a write to it still notifies the store', () => {
    const store = createClassyStore<{child: {n: number} | string}>({
      child: {n: 1},
    });
    const held = store.child;
    if (typeof held === 'string') throw new Error('Expected an object');
    const listener = watch(store);

    Object.defineProperty(store, 'child', {
      get: () => 'computed',
      enumerable: true,
      configurable: true,
    });

    expect(store.child).toBe('computed');
    held.n = 2;
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store).child).toBe('computed');
  });

  it('Object.defineProperties defines each property and notifies no one', () => {
    const store = createClassyStore<{a: number; b?: number; c?: {n: number}}>({
      a: 1,
    });
    const listener = watch(store);
    const before = snapshot(store);

    Object.defineProperties(store, {
      a: {value: 10},
      b: {value: 2, ...ordinary},
      c: {value: {n: 3}, ...ordinary},
    });

    expect([store.a, store.b]).toEqual([10, 2]);
    expect(listener).not.toHaveBeenCalled();
    expect(snapshot(store)).toBe(before);

    present(store.c).n = 4;
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({a: 10, b: 2, c: {n: 4}});
  });
});

// ── Reflection ───────────────────────────────────────────────────────────────

describe('what reflection on a store hands out for a nested object', () => {
  // FINDING: a property descriptor reaches the raw object, and a write to it is invisible to subscribers and snapshots.
  it('Object.getOwnPropertyDescriptor hands out the raw object: a write through it notifies no one and misses the snapshot', () => {
    const store = createClassyStore({nested: {n: 1}, other: 0});
    const listener = watch(store);
    const before = snapshot(store);
    const raw: {n: number} = Object.getOwnPropertyDescriptor(
      store,
      'nested',
    )?.value;

    raw.n = 2;

    expect(isStoreProxy(raw)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(store.nested.n).toBe(2);
    expect(snapshot(store)).toBe(before);

    // A write elsewhere makes a new snapshot, which shares the stale one of this object.
    store.other = 1;
    expect(snapshot(store).nested).toBe(before.nested);
    expect(snapshot(store).nested.n).toBe(1);
  });

  it('Object.values and Object.entries hand out the nested proxies', () => {
    const store = createClassyStore({
      nested: {n: 1},
      list: [{id: 1}],
      count: 0,
    });

    const [nested, list, count] = Object.values(store);
    const [, [key, value]] = Object.entries(store);

    expect(isStoreProxy(store.nested)).toBe(true);
    expect(nested).toBe(store.nested);
    expect(list).toBe(store.list);
    expect(count).toBe(0);
    expect(key).toBe('list');
    expect(value).toBe(store.list);
  });

  it('a spread copy and Object.assign({}, store) are plain objects that hold the nested proxies', () => {
    const store = createClassyStore({nested: {n: 1}, count: 0});
    const listener = watch(store);
    const spread = {...store};
    const assigned = Object.assign({}, store);

    expect(isStoreProxy(spread)).toBe(false);
    expect(spread.nested).toBe(store.nested);
    expect(assigned.nested).toBe(store.nested);

    // A field of the copy belongs to the copy; a nested object is still the store's.
    spread.count = 5;
    expect(listener).not.toHaveBeenCalled();
    expect(store.count).toBe(0);
    spread.nested.n = 2;
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({nested: {n: 2}, count: 0});
  });

  // FINDING: a store cannot be cloned; only its snapshot can.
  it('structuredClone throws a DataCloneError for a store and for a nested proxy', () => {
    const store = createClassyStore({nested: {n: 1}, count: 0});

    expect(errorNameOf(() => structuredClone(store))).toBe('DataCloneError');
    expect(errorNameOf(() => structuredClone(store.nested))).toBe(
      'DataCloneError',
    );
  });

  it('structuredClone of a snapshot is a plain, unfrozen copy with getter results as data and no class', () => {
    class Model {
      count = 1;
      nested = {n: 1};

      get double() {
        return this.count * 2;
      }
    }
    const store = createClassyStore(new Model());

    const clone = structuredClone(snapshot(store));

    expect(clone).toEqual({count: 1, nested: {n: 1}, double: 2});
    expect(Object.getOwnPropertyDescriptor(clone, 'double')?.value).toBe(2);
    expect(clone).not.toBeInstanceOf(Model);
    expect(Object.isFrozen(clone)).toBe(false);
    expect(Object.isFrozen(clone.nested)).toBe(false);
  });

  it('JSON.stringify reads a store through its proxies and notifies no one; a toJSON method runs on the store and on a snapshot', () => {
    class Account {
      balance = 1;
      secret = 'x';
      history = [{amount: 1}];

      toJSON() {
        return {balance: this.balance, entries: this.history.length};
      }
    }
    const plain = createClassyStore({
      nested: {n: 1},
      list: [{id: 1}],
      count: 0,
    });
    const account = createClassyStore(new Account());
    const listener = watch(plain);

    expect(JSON.stringify(plain)).toBe(
      '{"nested":{"n":1},"list":[{"id":1}],"count":0}',
    );
    expect(listener).not.toHaveBeenCalled();
    expect(JSON.stringify(account)).toBe('{"balance":1,"entries":1}');
    expect(JSON.stringify(snapshot(account))).toBe('{"balance":1,"entries":1}');
  });
});

// ── Object.assign, delete, in and Object.keys ────────────────────────────────

describe('Object.assign onto a store', () => {
  it('notifies a sync subscriber once for each key whose value changes, and a batched subscriber once', async () => {
    const store = createClassyStore<{
      a: number;
      b: number;
      c: number;
      d?: number;
    }>({a: 1, b: 2, c: 3});
    const sync = watch(store);
    const batched = watchBatched(store);

    const returned: object = Object.assign(store, {a: 10, b: 2, d: 40});
    await flush();

    expect(returned).toBe(store);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(batched).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({a: 10, b: 2, c: 3, d: 40});
  });

  it('inside batch() it notifies a sync subscriber once', () => {
    const store = createClassyStore({a: 1, b: 2, c: 3});
    const sync = watch(store);

    batch(() => {
      Object.assign(store, {a: 10, b: 20, c: 30});
    });

    expect(sync).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({a: 10, b: 20, c: 30});
  });
});

describe('delete on a store', () => {
  // A delete that removes nothing is no change (decision 8).
  it('deleting a key the store never had returns true and neither notifies nor replaces the snapshot', async () => {
    const store = createClassyStore<{a: number; missing?: number}>({a: 1});
    const sync = watch(store);
    const batched = watchBatched(store);
    const before = snapshot(store);

    expect(delete store.missing).toBe(true);
    await flush();

    expect(sync).toHaveBeenCalledTimes(0);
    expect(batched).toHaveBeenCalledTimes(0);
    expect(snapshot(store)).toBe(before);
    expect(snapshot(store)).toEqual({a: 1});
  });

  // The same holds for an array index that is not there, and for a name the store only inherits.
  it('so does deleting an index past the end of an array, or a name the store only inherits', () => {
    const store = createClassyStore({list: [1, 2, 3]});
    const listener = watch(store);
    const before = snapshot(store);

    expect(delete store.list[10]).toBe(true);
    expect(listener).toHaveBeenCalledTimes(0);
    expect(snapshot(store).list).toBe(before.list);
    expect(snapshot(store)).toEqual({list: [1, 2, 3]});

    expect(Reflect.deleteProperty(store, 'toString')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(0);
    expect(typeof store.toString).toBe('function');
  });
});

describe('the in operator and Object.keys on a store', () => {
  it('in answers from the raw object: own fields and symbols, and inherited getters and methods', () => {
    const tag = Symbol('tag');
    class Model {
      count = 0;
      [tag] = 1;

      get double() {
        return this.count * 2;
      }

      bump() {
        this.count++;
      }
    }
    const store = createClassyStore(new Model());

    expect('count' in store).toBe(true);
    expect(tag in store).toBe(true);
    expect('double' in store).toBe(true);
    expect('bump' in store).toBe(true);
    expect('toString' in store).toBe(true);
    expect('missing' in store).toBe(false);
  });

  it('Object.keys lists the own enumerable string keys in property order, at once after an add, a delete or a definition', () => {
    const store = createClassyStore<Record<string, unknown>>({count: 0});

    store.added = 1;
    store[2] = 'two';
    store[1] = 'one';
    expect(Object.keys(store)).toEqual(['1', '2', 'count', 'added']);

    delete store.added;
    expect(Object.keys(store)).toEqual(['1', '2', 'count']);

    Object.defineProperty(store, 'hidden', {value: 1, enumerable: false});
    expect(Object.keys(store)).toEqual(['1', '2', 'count']);
    expect(Reflect.ownKeys(store)).toEqual(['1', '2', 'count', 'hidden']);
  });
});

describe('a delete that removes nothing (decision 8)', () => {
  const cases: [
    string,
    (store: {
      dict: Record<string, number>;
      list: number[];
      frozen: {a: number};
    }) => boolean,
  ][] = [
    ['a missing key', (store) => Reflect.deleteProperty(store.dict, 'missing')],
    [
      'an index past the end of a list',
      (store) => Reflect.deleteProperty(store.list, '5'),
    ],
    [
      'a key of a frozen container',
      (store) => Reflect.deleteProperty(store.frozen, 'a'),
    ],
  ];

  for (const [name, remove] of cases) {
    it(`notifies no one and changes no snapshot: ${name}`, async () => {
      const store = createClassyStore({
        dict: {present: 1} as Record<string, number>,
        list: [1, 2],
        frozen: Object.freeze({a: 1}),
      });
      const before = snapshot(store);
      const sync = mock(() => {});
      const batched = mock(() => {});
      subscribe(store, sync, {sync: true});
      subscribe(store, batched);

      const answer = remove(store);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(answer).toBe(name !== 'a key of a frozen container');
      expect(sync).not.toHaveBeenCalled();
      expect(batched).not.toHaveBeenCalled();
      expect(snapshot(store)).toBe(before);
    });
  }
});
