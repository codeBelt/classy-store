import {describe, expect, it} from 'bun:test';
import {
  canProxy,
  findGetterDescriptor,
  isPlainObject,
  PROXYABLE,
} from './internal';

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

  it('finds getter defined via Object.defineProperty', () => {
    const obj = {};
    Object.defineProperty(obj, 'computed', {
      get() {
        return 42;
      },
      configurable: true,
    });
    const desc = findGetterDescriptor(obj, 'computed');
    expect(desc).toBeDefined();
    expect(desc?.get?.call(obj)).toBe(42);
  });

  it('finds getter through multiple levels of inheritance', () => {
    class A {
      get val() {
        return 'A';
      }
    }
    class B extends A {}
    class C extends B {}

    const instance = new C();
    const desc = findGetterDescriptor(instance, 'val');
    expect(desc).toBeDefined();
    expect(desc?.get?.call(instance)).toBe('A');
  });

  it('returns undefined for symbol properties without getters', () => {
    const sym = Symbol('test');
    const obj = {[sym]: 42};
    expect(findGetterDescriptor(obj, sym)).toBeUndefined();
  });
});

// ── isPlainObject — additional ────────────────────────────────────────────────

describe('isPlainObject — additional', () => {
  it('returns false for functions', () => {
    expect(isPlainObject(() => {})).toBe(false);
    expect(isPlainObject(() => {})).toBe(false);
  });

  it('returns true for Object.create(Object.prototype)', () => {
    expect(isPlainObject(Object.create(Object.prototype))).toBe(true);
  });

  it('returns false for Object.create with custom proto', () => {
    const proto = {custom: true};
    expect(isPlainObject(Object.create(proto))).toBe(false);
  });
});

// ── canProxy — additional ────────────────────────────────────────────────────

describe('canProxy — additional', () => {
  it('returns false for Promise', () => {
    expect(canProxy(Promise.resolve())).toBe(false);
  });

  it('returns false for WeakMap and WeakSet', () => {
    expect(canProxy(new WeakMap())).toBe(false);
    expect(canProxy(new WeakSet())).toBe(false);
  });

  it('returns true for nested arrays', () => {
    expect(
      canProxy([
        [1, 2],
        [3, 4],
      ]),
    ).toBe(true);
  });

  it('returns false for functions', () => {
    expect(canProxy(() => {})).toBe(false);
  });

  it('PROXYABLE on parent class allows child instances', () => {
    class Parent {
      static [PROXYABLE] = true;
    }
    class Child extends Parent {
      value = 0;
    }
    expect(canProxy(new Child())).toBe(true);
  });
});
