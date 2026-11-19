import {describe, expect, it} from 'bun:test';
import {shallowEqual} from '../../index';

describe('shallowEqual() — values that only look alike', () => {
  it('does not equate a string with a String object holding the same text', () => {
    const text: unknown = 'ab';
    const wrapper: unknown = Object('ab');

    expect(shallowEqual(text, wrapper)).toBe(false);
    expect(shallowEqual(wrapper, text)).toBe(false);
  });

  it('does not equate an array with an array-like object that shares its prototype', () => {
    const list: unknown = ['a'];
    const arrayLike: unknown = Object.create(Array.prototype, {
      0: {value: 'a', enumerable: true},
      length: {value: 1},
    });

    expect(shallowEqual(list, arrayLike)).toBe(false);
    expect(shallowEqual(arrayLike, list)).toBe(false);
  });

  it('does not equate a key that holds undefined with a key that is missing', () => {
    expect(shallowEqual<object>({a: undefined}, {b: undefined})).toBe(false);

    // Both arrays start with a hole, so they are compared by their own indices.
    const first = new Array<undefined>(3);
    const second = new Array<undefined>(3);
    first[1] = undefined;
    second[2] = undefined;
    expect(shallowEqual(first, second)).toBe(false);
  });

  it('compares arrays by their indices and ignores every other own property', () => {
    const first = Object.assign([1, 2], {'-1': 'before', note: 'first'});
    const second = Object.assign([1, 2], {'-1': 'start', note: 'second'});

    expect(shallowEqual<unknown>(first, second)).toBe(true);
  });
});
