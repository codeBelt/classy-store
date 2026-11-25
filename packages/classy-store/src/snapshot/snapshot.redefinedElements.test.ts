import {describe, expect, it} from 'bun:test';
import {createClassyStore, snapshot} from '../index';

// `Object.defineProperty` through a store is a write (decision 2), for a
// field of an object and for an array element alike. These tests pin it for
// an element.

describe('an array element redefined from an object to a value that is not an object', () => {
  // A definition is a write (decision 2): the store and the snapshot both
  // hold the new value.
  it.each([
    {what: 'a number', value: 7},
    {what: 'null', value: null},
  ])('shows $what in a snapshot and through the store', ({value}) => {
    const store = createClassyStore<{rows: ({n: number} | number | null)[]}>({
      rows: [{n: 1}, {n: 2}],
    });
    const old = store.rows[0];

    Object.defineProperty(store.rows, 0, {value});

    expect(store.rows[0]).not.toBe(old);
    expect(snapshot(store)).toEqual({rows: [value, {n: 2}]});
  });
});
