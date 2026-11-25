import {describe, expect, it, mock} from 'bun:test';
import {createClassyStore, snapshot, subscribe} from '../index';

// `Object.defineProperty` through a store is a write (decision 2): the value
// becomes the property's child, subscribers are told when the value, the
// getter, the kind of property or its enumerability changed, and a definition
// that touches an accessor clears the node's getter cache. Freezing stays
// silent.

function watch(store: object) {
  const listener = mock(() => {});
  subscribe(store, listener, {sync: true});
  return listener;
}

describe('a definition through the store', () => {
  it('of a new data value notifies once and reaches the next snapshot', () => {
    const store = createClassyStore<{a: number; b?: number}>({a: 1});
    const listener = watch(store);

    Object.defineProperty(store, 'b', {
      value: 2,
      writable: true,
      enumerable: true,
      configurable: true,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({a: 1, b: 2});
  });

  it('that changes nothing notifies no one and keeps the snapshot', () => {
    const store = createClassyStore({a: 1});
    const before = snapshot(store);
    const listener = watch(store);

    Object.defineProperty(store, 'a', {
      value: 1,
      writable: true,
      enumerable: true,
      configurable: true,
    });

    expect(listener).not.toHaveBeenCalled();
    expect(snapshot(store)).toBe(before);
  });

  it('of an object value makes it a child whose writes are heard', () => {
    const store = createClassyStore<{nested?: {n: number}}>({});
    Object.defineProperty(store, 'nested', {
      value: {n: 1},
      writable: true,
      enumerable: true,
      configurable: true,
    });
    const listener = watch(store);

    const nested = store.nested as {n: number};
    nested.n = 2;

    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store)).toEqual({nested: {n: 2}});
  });

  it('that changes only whether a key is enumerable notifies and changes the snapshot', () => {
    const store = createClassyStore({a: 1, b: 2});
    const listener = watch(store);

    Object.defineProperty(store, 'b', {enumerable: false});

    expect(listener).toHaveBeenCalledTimes(1);
    expect(Object.keys(snapshot(store))).toEqual(['a']);
  });

  it('of an accessor works on the store and on a snapshot', () => {
    const store = createClassyStore<{count: number; double?: number}>({
      count: 2,
    });
    const listener = watch(store);

    Object.defineProperty(store, 'double', {
      get(this: {count: number}) {
        return this.count * 2;
      },
      enumerable: true,
      configurable: true,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.double).toBe(4);
    store.count = 3;
    expect(store.double).toBe(6);
    expect(snapshot(store).double).toBe(6);
  });

  it('that makes a property read-only keeps its value and refuses a write', () => {
    const store = createClassyStore({a: 1, b: 2});
    const listener = watch(store);

    Object.defineProperty(store, 'a', {writable: false});

    expect(listener).not.toHaveBeenCalled();
    expect(Reflect.set(store, 'a', 5)).toBe(false);
    expect(store.a).toBe(1);
    expect(snapshot(store).a).toBe(1);
  });

  it('by Object.freeze(store) notifies no one, and the store stays readable', () => {
    const store = createClassyStore({a: 1, nested: {n: 1}});
    const before = snapshot(store);
    const listener = watch(store);

    Object.freeze(store);

    expect(listener).not.toHaveBeenCalled();
    expect(store.a).toBe(1);
    expect(snapshot(store)).toEqual(before);
  });
});

describe('a getter that read a property later defined anew', () => {
  it('is not stale after an accessor it read is redefined as data', () => {
    const store = createClassyStore({
      get base(): number {
        return 1;
      },
      get double(): number {
        return this.base * 2;
      },
    });
    expect(store.double).toBe(2);

    Object.defineProperty(store, 'base', {
      value: 5,
      writable: true,
      enumerable: true,
      configurable: true,
    });

    expect(store.double).toBe(10);
    expect(snapshot(store).double).toBe(10);
  });

  it('is not stale after an accessor it read is deleted', () => {
    const store = createClassyStore<{base?: number; readonly total: number}>({
      get base(): number {
        return 3;
      },
      get total(): number {
        return this.base ?? 0;
      },
    });
    expect(store.total).toBe(3);

    Reflect.deleteProperty(store, 'base');

    expect(store.total).toBe(0);
    expect(snapshot(store).total).toBe(0);
  });
});

describe('what a definition tells, and what it leaves alone', () => {
  it('notifies when only the getter of an accessor changes', () => {
    const store = createClassyStore({
      count: 1,
      get label(): string {
        return `old ${this.count}`;
      },
    });
    const listener = watch(store);

    Object.defineProperty(store, 'label', {
      get(this: {count: number}) {
        return `new ${this.count}`;
      },
      enumerable: true,
      configurable: true,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.label).toBe('new 1');
  });

  it('notifies when only the kind of property changes', () => {
    const store = createClassyStore<{x?: unknown}>({
      set x(_value: unknown) {},
    });
    const listener = watch(store);

    Object.defineProperty(store, 'x', {
      value: undefined,
      writable: true,
      enumerable: true,
      configurable: true,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(Object.getOwnPropertyDescriptor(store, 'x')?.writable).toBe(true);
  });

  it('keeps the memo of a getter when a data property it did not read is defined anew', () => {
    let runs = 0;
    const store = createClassyStore({
      a: 1,
      b: 1,
      get double(): number {
        runs++;
        return this.a * 2;
      },
    });
    expect(store.double).toBe(2);

    Object.defineProperty(store, 'b', {value: 2});

    expect(store.double).toBe(2);
    expect(runs).toBe(1);
  });

  it('on an object that left the store connects the new child once, so a later delete removes it', () => {
    const store = createClassyStore<{box?: {item?: {n: number}}}>({box: {}});
    const box = store.box as {item?: {n: number}};
    delete store.box;

    Object.defineProperty(box, 'item', {
      value: {n: 1},
      writable: true,
      enumerable: true,
      configurable: true,
    });
    const item = box.item as {n: number};
    const calls: string[] = [];
    subscribe(box, () => calls.push('box'), {sync: true});

    delete box.item;
    item.n = 2;

    expect(calls).toEqual(['box']);
    expect(snapshot(box)).toEqual({});
  });

  it('hands out the new function after a method held in a field is defined anew', () => {
    const store = createClassyStore({
      greet(): string {
        return 'old';
      },
    });
    expect(store.greet()).toBe('old');

    Object.defineProperty(store, 'greet', {
      value: () => 'new',
      writable: true,
      enumerable: true,
      configurable: true,
    });

    expect(store.greet()).toBe('new');
  });
});
