import {describe, expect, it} from 'bun:test';
import {
  canProxy,
  findGetterDescriptor,
  isPlainObject,
  PROXYABLE,
  shallowEqual,
} from './utils';

// ── isPlainObject ─────────────────────────────────────────────────────────────

describe('isPlainObject', () => {
  it('returns true for plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({a: 1})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it('returns false for arrays', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2])).toBe(false);
  });

  it('returns false for class instances', () => {
    class Foo {}
    expect(isPlainObject(new Foo())).toBe(false);
  });

  it('returns false for built-in objects', () => {
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(new Set())).toBe(false);
    expect(isPlainObject(/regex/)).toBe(false);
  });

  it('returns false for primitives and null', () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject('string')).toBe(false);
    expect(isPlainObject(true)).toBe(false);
  });
});

// ── canProxy ──────────────────────────────────────────────────────────────────

describe('canProxy', () => {
  it('returns true for plain objects', () => {
    expect(canProxy({})).toBe(true);
    expect(canProxy({a: 1})).toBe(true);
  });

  it('returns true for arrays', () => {
    expect(canProxy([])).toBe(true);
    expect(canProxy([1, 2, 3])).toBe(true);
  });

  it('returns true for PROXYABLE class instances', () => {
    class Reactive {
      static [PROXYABLE] = true;
      value = 0;
    }
    expect(canProxy(new Reactive())).toBe(true);
  });

  it('returns false for regular class instances', () => {
    class Plain {
      value = 0;
    }
    expect(canProxy(new Plain())).toBe(false);
  });

  it('returns false for built-in objects', () => {
    expect(canProxy(new Date())).toBe(false);
    expect(canProxy(new Map())).toBe(false);
    expect(canProxy(new Set())).toBe(false);
    expect(canProxy(/regex/)).toBe(false);
    expect(canProxy(new Error('test'))).toBe(false);
  });

  it('returns false for primitives and null', () => {
    expect(canProxy(null)).toBe(false);
    expect(canProxy(undefined)).toBe(false);
    expect(canProxy(42)).toBe(false);
    expect(canProxy('string')).toBe(false);
    expect(canProxy(true)).toBe(false);
    expect(canProxy(Symbol('test'))).toBe(false);
  });
});

// ── findGetterDescriptor ──────────────────────────────────────────────────────

describe('findGetterDescriptor', () => {
  it('finds a getter on the direct prototype', () => {
    class Foo {
      get bar() {
        return 42;
      }
    }
    const instance = new Foo();
    const desc = findGetterDescriptor(instance, 'bar');
    expect(desc).toBeDefined();
    expect(desc?.get).toBeFunction();
  });

  it('finds an inherited getter', () => {
    class Base {
      get value() {
        return 1;
      }
    }
    class Derived extends Base {}
    const instance = new Derived();
    const desc = findGetterDescriptor(instance, 'value');
    expect(desc).toBeDefined();
    expect(desc?.get).toBeFunction();
  });

  it('returns the most-derived getter when overridden', () => {
    class Base {
      get label(): string {
        return 'base';
      }
    }
    class Derived extends Base {
      override get label(): string {
        return 'derived';
      }
    }
    const instance = new Derived();
    const desc = findGetterDescriptor(instance, 'label');
    expect(desc).toBeDefined();
    // The getter should be the Derived version
    expect(desc?.get?.call(instance)).toBe('derived');
  });

  it('returns undefined for non-getter properties', () => {
    class Foo {
      value = 42;
    }
    const instance = new Foo();
    expect(findGetterDescriptor(instance, 'value')).toBeUndefined();
  });

  it('returns undefined for non-existent properties', () => {
    const obj = {a: 1};
    expect(findGetterDescriptor(obj, 'missing')).toBeUndefined();
  });

  it('returns undefined for plain objects (no getters)', () => {
    const obj = {x: 10, y: 20};
    expect(findGetterDescriptor(obj, 'x')).toBeUndefined();
  });
});

// ── shallowEqual ──────────────────────────────────────────────────────────────

describe('shallowEqual', () => {
  // ── Identity / reference ────────────────────────────────────────────────

  it('returns true for identical references', () => {
    const obj = {a: 1, b: 2};
    expect(shallowEqual(obj, obj)).toBe(true);
  });

  // ── Primitive equality (Object.is) ──────────────────────────────────────

  it('returns true for equal primitives', () => {
    expect(shallowEqual(1, 1)).toBe(true);
    expect(shallowEqual('hello', 'hello')).toBe(true);
    expect(shallowEqual(true, true)).toBe(true);
    expect(shallowEqual(null, null)).toBe(true);
    expect(shallowEqual(undefined, undefined)).toBe(true);
  });

  it('returns false for different primitives', () => {
    expect(shallowEqual(1, 2)).toBe(false);
    expect(shallowEqual('a', 'b')).toBe(false);
    expect(shallowEqual(true, false)).toBe(false);
  });

  it('returns false for null vs object', () => {
    expect(shallowEqual(null, {a: 1})).toBe(false);
    expect(shallowEqual({a: 1}, null)).toBe(false);
  });

  // ── Shallow object equality ─────────────────────────────────────────────

  it('returns true for shallow-equal plain objects', () => {
    expect(shallowEqual({a: 1, b: 'x'}, {a: 1, b: 'x'})).toBe(true);
  });

  it('returns false for objects with different values', () => {
    expect(shallowEqual({a: 1}, {a: 2})).toBe(false);
  });

  it('returns false for objects with different key counts', () => {
    expect(shallowEqual({a: 1}, {a: 1, b: 2})).toBe(false);
  });

  it('returns false for objects with different keys', () => {
    expect(shallowEqual({a: 1}, {b: 1})).toBe(false);
  });

  it('compares nested objects by reference only (not deep)', () => {
    const inner1 = {x: 1};
    const inner2 = {x: 1}; // same shape but different reference
    expect(shallowEqual({a: inner1}, {a: inner2})).toBe(false);
  });

  // ── Array equality ──────────────────────────────────────────────────────

  it('returns true for shallow-equal arrays', () => {
    expect(shallowEqual([1, 'a', true], [1, 'a', true])).toBe(true);
  });

  it('returns false for arrays with different lengths', () => {
    expect(shallowEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('returns false for arrays with different elements', () => {
    expect(shallowEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  // ── Object.is edge cases ───────────────────────────────────────────────

  it('treats NaN as equal to NaN (Object.is semantics)', () => {
    expect(shallowEqual(Number.NaN, Number.NaN)).toBe(true);
  });

  it('treats +0 and -0 as not equal (Object.is semantics)', () => {
    expect(shallowEqual(+0, -0)).toBe(false);
  });
});
