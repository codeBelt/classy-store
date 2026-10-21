import {describe, expect, test} from 'bun:test';
import {createClassyStore} from '../core/core';
import {snapshot} from './snapshot';

const arrayCases: {
  description: string;
  value: {count: number}[];
  mutate: (value: {count: number}[]) => void;
  expected: {count: number}[];
}[] = [
  {
    description: 'an array becomes tracked and is truncated',
    value: [{count: 1}],
    mutate(value: {count: number}[]) {
      value.length = 0;
    },
    expected: [],
  },
  {
    description: 'an array becomes tracked and its child is replaced',
    value: [{count: 1}],
    mutate(value: {count: number}[]) {
      value[0] = {count: 2};
    },
    expected: [{count: 2}],
  },
];

describe('snapshot cache ownership', () => {
  test.each(
    arrayCases,
  )('releases the obsolete untracked clone when $description', ({
    value,
    mutate,
    expected,
  }) => {
    const store = createClassyStore({value, stable: {label: 'unchanged'}});
    const initial = snapshot(store);

    mutate(store.value);
    const current = snapshot(store);

    // A new owner must not receive the obsolete deep-clone cache entry that
    // belonged to this array before it acquired a tracked/versioned snapshot.
    const newOwner = createClassyStore({value});
    expect(snapshot(newOwner).value).toEqual(expected);
    expect(current.value).toEqual(expected);
    expect(current.stable).toBe(initial.stable);
    expect(snapshot(store)).toBe(current);
    expect(initial.value).toEqual([{count: 1}]);
    expect(Object.isFrozen(current.value)).toBe(true);
  });

  test('releases the obsolete untracked clone when a plain object becomes tracked', () => {
    const value = {nested: {count: 1}, unchanged: {label: 'shared'}};
    const store = createClassyStore({value});
    const initial = snapshot(store);

    store.value.nested = {count: 2};
    const current = snapshot(store);
    const newOwner = createClassyStore({value});

    expect(snapshot(newOwner).value.nested.count).toBe(2);
    expect(current.value.unchanged).toBe(initial.value.unchanged);
    expect(initial.value.nested.count).toBe(1);
    expect(snapshot(store)).toBe(current);
  });
});
