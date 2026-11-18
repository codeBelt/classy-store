import {describe, expect, it} from 'bun:test';
import {shallowEqual} from './equality';

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

  it('returns false for an empty object against one with keys', () => {
    expect(shallowEqual<object>({}, {a: 1})).toBe(false);
    expect(shallowEqual<object>({a: 1}, {})).toBe(false);
  });

  it('compares nested objects by reference only (not deep)', () => {
    const inner1 = {x: 1};
    const inner2 = {x: 1}; // same shape but different reference
    expect(shallowEqual({a: inner1}, {a: inner2})).toBe(false);
  });

  // ── Array equality ──────────────────────────────────────────────────────

  it('short-circuits a dense mismatch before enumerating array keys', () => {
    const values = Array.from({length: 100_000}, (_, i) => i);
    const changed = values.slice();
    changed[0] = -1;
    let scans = 0;
    const observed = new Proxy(values, {
      ownKeys(target) {
        scans++;
        return Reflect.ownKeys(target);
      },
    });
    expect(shallowEqual(observed, changed)).toBe(false);
    expect(scans).toBe(0);
  });

  it('compares own index membership as well as values in sparse arrays', () => {
    const hole = new Array<undefined>(1);
    expect(shallowEqual(hole, [undefined])).toBe(false);
    expect(shallowEqual([undefined], hole)).toBe(false);
    expect(shallowEqual(hole, new Array<undefined>(1))).toBe(true);
    const first = new Array<undefined>(2);
    const second = new Array<undefined>(2);
    first[0] = undefined;
    second[1] = undefined;
    expect(shallowEqual(first, second)).toBe(false);
    const left = new Array<number>(4);
    const right = new Array<number>(4);
    Object.defineProperty(left, '2', {value: 7});
    right[2] = 7;
    expect(
      shallowEqual(
        Object.assign(left, {label: 'left'}),
        Object.assign(right, {label: 'right'}),
      ),
    ).toBe(true);
    right[2] = 8;
    expect(shallowEqual(left, right)).toBe(false);
  });

  it('distinguishes arrays from records with the same keys in either order', () => {
    expect(shallowEqual([], {})).toBe(false);
    expect(shallowEqual({}, [])).toBe(false);
    expect(shallowEqual<unknown>(['a'], {0: 'a'})).toBe(false);
    expect(shallowEqual<unknown>({0: 'a'}, ['a'])).toBe(false);
  });

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

  // ── Additional edge cases ───────────────────────────────────────────

  it('returns false for array vs non-array-like object', () => {
    expect(shallowEqual([1, 2] as unknown, {a: 1, b: 2} as unknown)).toBe(
      false,
    );
  });

  it('returns true for empty objects', () => {
    expect(shallowEqual({}, {})).toBe(true);
  });

  it('returns true for empty arrays', () => {
    expect(shallowEqual([], [])).toBe(true);
  });

  it('returns false for undefined vs null', () => {
    expect(shallowEqual(undefined, null as unknown as undefined)).toBe(false);
  });

  it('handles objects with undefined values', () => {
    expect(shallowEqual({a: undefined}, {a: undefined})).toBe(true);
    expect(
      shallowEqual({a: undefined}, {a: null} as unknown as {a: undefined}),
    ).toBe(false);
  });

  it('compares nested arrays by reference only', () => {
    const arr1 = [1, 2];
    const arr2 = [1, 2];
    expect(shallowEqual({a: arr1}, {a: arr1})).toBe(true);
    expect(shallowEqual({a: arr1}, {a: arr2})).toBe(false);
  });

  it('handles arrays with NaN elements', () => {
    expect(shallowEqual([Number.NaN], [Number.NaN])).toBe(true);
    expect(shallowEqual([Number.NaN, 1], [Number.NaN, 2])).toBe(false);
  });

  it('returns false when one is array and the other is not', () => {
    expect(shallowEqual([1] as unknown, 'not-array' as unknown)).toBe(false);
    expect(shallowEqual('not-array' as unknown, [1] as unknown)).toBe(false);
  });

  it('handles objects with symbol-like string keys', () => {
    expect(shallowEqual({'Symbol(foo)': 1}, {'Symbol(foo)': 1})).toBe(true);
  });

  it('compares dates by the instant they hold', () => {
    expect(shallowEqual(new Date(0), new Date(0))).toBe(true);
    expect(shallowEqual(new Date(0), new Date(1e12))).toBe(false);
    expect(shallowEqual(new Date(Number.NaN), new Date(Number.NaN))).toBe(true);
  });

  it('compares maps by size, keys and values one level deep', () => {
    const shared = {id: 1};
    expect(shallowEqual(new Map([[1, shared]]), new Map([[1, shared]]))).toBe(
      true,
    );
    expect(shallowEqual(new Map([[1, 1]]), new Map([[2, 2]]))).toBe(false);
    expect(shallowEqual(new Map([[1, 1]]), new Map([[1, 2]]))).toBe(false);
    expect(shallowEqual(new Map([[1, {id: 1}]]), new Map([[1, {id: 1}]]))).toBe(
      false,
    );
    expect(
      shallowEqual(
        new Map<number, number | undefined>([[1, undefined]]),
        new Map<number, number | undefined>([[2, undefined]]),
      ),
    ).toBe(false);
    expect(shallowEqual(new Map(), new Map())).toBe(true);
  });

  it('does not equate a map with one that only contains it', () => {
    const smaller = new Map([[1, 1]]);
    const larger = new Map([
      [1, 1],
      [2, 2],
    ]);
    expect(shallowEqual(smaller, larger)).toBe(false);
    expect(shallowEqual(larger, smaller)).toBe(false);
  });

  it('compares sets by size and membership', () => {
    expect(shallowEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
    expect(shallowEqual(new Set([1]), new Set([2]))).toBe(false);
    expect(shallowEqual(new Set([1]), new Set([1, 2]))).toBe(false);
  });

  it('never equates values with different prototypes', () => {
    class Point {
      x = 1;
    }
    class Size {
      x = 1;
    }
    expect(shallowEqual(new Point() as unknown, new Size() as unknown)).toBe(
      false,
    );
    expect(shallowEqual(new Point() as unknown, {x: 1} as unknown)).toBe(false);
    expect(shallowEqual(new Map() as unknown, new Set() as unknown)).toBe(
      false,
    );
    expect(shallowEqual(Object.create(null) as unknown, {} as unknown)).toBe(
      false,
    );
  });

  it('compares class instances of one class by their own fields', () => {
    class Point {
      constructor(
        public x: number,
        public y: number,
      ) {}
    }
    expect(shallowEqual(new Point(1, 2), new Point(1, 2))).toBe(true);
    expect(shallowEqual(new Point(1, 2), new Point(1, 3))).toBe(false);
  });

  it('does not equate opaque objects whose state it cannot see', () => {
    class Empty {}
    expect(shallowEqual(/a/, /b/)).toBe(false);
    expect(shallowEqual(/a/, /a/)).toBe(false);
    expect(shallowEqual(new Error('a'), new Error('b'))).toBe(false);
    expect(shallowEqual(Promise.resolve(1), Promise.resolve(2))).toBe(false);
    expect(shallowEqual(new Empty(), new Empty())).toBe(false);
    // Records and arrays with nothing in them hide nothing.
    expect(shallowEqual(Object.create(null), Object.create(null))).toBe(true);
  });
});
