import {describe, expect, it} from 'bun:test';
import {createClassyStore, snapshot} from '../index';
import {prototypeTableSize} from './core';

// A read asks a table per prototype whether an inherited key is a getter, in
// place of a descriptor lookup on every access (decision 12). The table
// records which prototype holds an accessor, never the function, so a
// recompute runs the getter the class has now. What a prototype changed
// after its first read through a store does is unspecified; the tests marked
// "unspecified" pin today's answers as change detectors.

describe('a getter on the prototype, changed after the first read', () => {
  it('runs a getter redefined on the class at its next recompute, on the store and on a snapshot', () => {
    class Price {
      base = 10;
      get total() {
        return this.base * 2;
      }
    }
    const store = createClassyStore(new Price());
    expect(store.total).toBe(20);

    Object.defineProperty(Price.prototype, 'total', {
      get(this: Price) {
        return this.base * 30;
      },
      configurable: true,
    });
    // The memo is still valid, so the store answers from it, as before 1.0.
    expect(store.total).toBe(20);

    store.base = 11;
    expect(store.total).toBe(330);
    expect(snapshot(store).total).toBe(330);
  });

  it('reads a getter replaced by a value as that value from its next recompute (unspecified)', () => {
    class Flag {
      count = 1;
      get ready(): unknown {
        return this.count > 0;
      }
    }
    const store = createClassyStore(new Flag());
    expect(store.ready).toBe(true);

    Object.defineProperty(Flag.prototype, 'ready', {
      value: 'data',
      configurable: true,
      writable: true,
    });
    expect(store.ready).toBe(true);
    store.count = 2;
    expect(store.ready).toBe('data');
  });

  it('reads a deleted getter as missing from its next recompute (unspecified)', () => {
    class Box {
      count = 1;
      get size(): unknown {
        return this.count;
      }
    }
    const store = createClassyStore(new Box());
    expect(store.size).toBe(1);

    Reflect.deleteProperty(Box.prototype, 'size');
    expect(store.size).toBe(1);
    store.count = 2;
    expect(store.size).toBeUndefined();
  });

  it('does not see an override added nearer the instance after the first read, where a snapshot does (unspecified)', () => {
    class Base {
      count = 1;
      get value(): number {
        return this.count;
      }
    }
    class Derived extends Base {}
    const store = createClassyStore(new Derived());
    expect(store.value).toBe(1);

    Object.defineProperty(Derived.prototype, 'value', {
      get(this: Derived) {
        return this.count * 100;
      },
      configurable: true,
    });
    store.count = 2;

    expect(store.value).toBe(2);
    expect(snapshot(store).value).toBe(200);
  });

  it('sees a getter added for a key that was read as missing, and runs it at every read (unspecified)', () => {
    class Late {
      count = 1;
    }
    const store = createClassyStore(new Late()) as Late & {later?: number};
    expect(store.later).toBeUndefined();

    let runs = 0;
    Object.defineProperty(Late.prototype, 'later', {
      get(this: Late) {
        runs++;
        return this.count * 7;
      },
      configurable: true,
    });

    expect(store.later).toBe(7);
    expect(store.later).toBe(7);
    expect(runs).toBe(2);
  });
});

describe('the table per prototype', () => {
  it('stays under its bound when a dictionary is read by a million keys it does not have', () => {
    const store = createClassyStore({dictionary: {} as Record<string, number>});
    const {dictionary} = store;
    for (let index = 0; index < 1_000_000; index++) {
      if (dictionary[`missing-${index}`] !== undefined) throw new Error();
    }
    expect(prototypeTableSize(Object.prototype)).toBeLessThanOrEqual(256);
    expect(dictionary.missing).toBeUndefined();
  });

  it('has no table for a prototype no store has read through', () => {
    expect(prototypeTableSize(Object.create(null))).toBe(0);
  });

  it('reads a missing key of an object with no prototype as missing', () => {
    const dictionary = Object.create(null) as Record<string, number>;
    dictionary.present = 1;
    const store = createClassyStore({dictionary});
    expect(store.dictionary.missing).toBeUndefined();
    expect(store.dictionary.present).toBe(1);
  });

  it('stays under its bound when a class instance is read by keys it does not have, and keeps the keys it has', () => {
    class Entry {
      count = 1;
      get double() {
        return this.count * 2;
      }
    }
    const store = createClassyStore(new Entry()) as Entry &
      Record<string, unknown>;
    for (let index = 0; index < 200_000; index++) {
      if (store[`missing-${index}`] !== undefined) throw new Error();
    }
    expect(prototypeTableSize(Entry.prototype)).toBe(256);
    // A key the prototype chain has is recorded past the bound.
    expect(store.double).toBe(2);
    expect(prototypeTableSize(Entry.prototype)).toBe(257);
    store.count = 3;
    expect(store.double).toBe(6);
  });

  it('reads an own getter of an object literal as a getter, and one defined through the store', () => {
    const store = createClassyStore({
      count: 2,
      get double() {
        return this.count * 2;
      },
    }) as {count: number; double: number; triple?: number};
    expect(store.double).toBe(4);

    Object.defineProperty(store, 'triple', {
      get(this: {count: number}) {
        return this.count * 3;
      },
      configurable: true,
      enumerable: true,
    });
    store.count = 3;
    expect(store.double).toBe(6);
    expect(store.triple).toBe(9);
  });

  it('runs an inherited setter through the store, and refuses a write to a getter without one', () => {
    class Temperature {
      celsius = 0;
      get fahrenheit() {
        return this.celsius * 1.8 + 32;
      }
      set fahrenheit(value: number) {
        this.celsius = (value - 32) / 1.8;
      }
      get kelvin() {
        return this.celsius + 273.15;
      }
    }
    const store = createClassyStore(new Temperature());
    store.fahrenheit = 212;
    expect(store.celsius).toBe(100);
    expect(Reflect.set(store, 'kelvin', 0)).toBe(false);
    expect(store.kelvin).toBe(373.15);
  });
});
