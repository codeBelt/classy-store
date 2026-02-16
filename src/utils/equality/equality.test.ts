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
