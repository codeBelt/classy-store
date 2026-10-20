import {describe, expect, it} from 'bun:test';
import {createClassyStore} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import {PROXYABLE} from '../internal/internal';
import {cloneSnapshotValue} from './cloneSnapshot';

describe('cloneSnapshotValue', () => {
  it('copies frozen graphs without losing aliases, symbols, or opaque leaves', () => {
    const symbol = Symbol('metadata');
    const date = new Date('2026-01-01');
    const map = new Map([['key', 'value']]);
    const method = () => 'value';
    const shared = Object.freeze({count: 1});
    const source = Object.create(null);
    Object.defineProperties(source, {
      first: {value: shared, enumerable: true},
      second: {value: shared, enumerable: false},
      date: {value: date, enumerable: true},
      map: {value: map, enumerable: true},
      method: {value: method, enumerable: true},
      [symbol]: {value: shared, enumerable: true},
    });
    Object.freeze(source);

    const clone = cloneSnapshotValue(source, new WeakMap()) as typeof source;

    expect(Object.getPrototypeOf(clone)).toBeNull();
    expect(clone.first).not.toBe(shared);
    expect(clone.first).toBe(clone.second);
    expect(clone[symbol]).toBe(clone.first);
    expect(clone.date).toBe(date);
    expect(clone.map).toBe(map);
    expect(clone.method).toBe(method);
    expect(Object.getOwnPropertyDescriptor(clone, 'second')).toMatchObject({
      enumerable: false,
      configurable: true,
      writable: true,
    });
    clone.first.count = 2;
    expect(shared.count).toBe(1);
  });

  it('retains cycles without linking the copy back to the source', () => {
    const source: {count: number; self?: unknown} = {count: 1};
    source.self = source;
    Object.freeze(source);

    const clone = cloneSnapshotValue(source, new WeakMap()) as typeof source;

    expect(clone).not.toBe(source);
    expect(clone.self).toBe(clone);
    clone.count = 2;
    expect(source.count).toBe(1);
  });

  it('preserves sparse array holes, trailing length, and custom properties', () => {
    const symbol = Symbol('metadata');
    const source = new Array<{count: number}>(5);
    source[2] = Object.freeze({count: 1});
    Object.defineProperty(source, symbol, {value: source[2]});
    Object.freeze(source);

    const clone = cloneSnapshotValue(source, new WeakMap()) as typeof source;

    expect(clone).toHaveLength(5);
    expect(0 in clone).toBe(false);
    expect(1 in clone).toBe(false);
    expect(2 in clone).toBe(true);
    expect(4 in clone).toBe(false);
    expect(Reflect.get(clone, symbol)).toBe(clone[2]);
    clone[2].count = 2;
    clone.push({count: 3});
    expect(source[2].count).toBe(1);
    expect(source).toHaveLength(5);
  });

  it('restores live prototype getters from memoized snapshots', () => {
    class Profile {
      static [PROXYABLE] = true;
      name = 'Alice';

      get greeting() {
        return `Hello, ${this.name}`;
      }
    }
    const store = createClassyStore(new Profile());
    const previous = snapshot(store);
    expect(previous.greeting).toBe('Hello, Alice');

    const clone = cloneSnapshotValue(previous, new WeakMap()) as Profile;
    clone.name = 'Alicia';

    expect(clone).toBeInstanceOf(Profile);
    expect(clone.greeting).toBe('Hello, Alicia');
    expect(previous.greeting).toBe('Hello, Alice');
  });

  it('preserves frozen custom accessors that override prototype getters', () => {
    class Profile {
      static [PROXYABLE] = true;
      name = 'Alice';

      get greeting() {
        return `Hello, ${this.name}`;
      }
    }
    const source = new Profile();
    Object.defineProperty(source, 'greeting', {
      get(this: Profile) {
        return `Welcome, ${this.name}`;
      },
      enumerable: true,
      configurable: true,
    });
    Object.freeze(source);

    const clone = cloneSnapshotValue(source, new WeakMap()) as Profile;
    clone.name = 'Alicia';

    expect(clone.greeting).toBe('Welcome, Alicia');
    expect(source.greeting).toBe('Welcome, Alice');
  });

  it('preserves the prototype of custom array values', () => {
    class Names extends Array<string> {
      get firstName() {
        return this[0];
      }
    }
    const source = new Names('Alice');
    Object.freeze(source);

    const clone = cloneSnapshotValue(source, new WeakMap()) as Names;

    expect(clone).toBeInstanceOf(Names);
    clone[0] = 'Alicia';
    expect(clone.firstName).toBe('Alicia');
    expect(source.firstName).toBe('Alice');
  });
});
