import {describe, expect, it} from 'bun:test';
import {createClassyStore, snapshot} from '../index';

// `Object.defineProperty` on a store changes the raw state without the store
// noticing. `core.characterisation.invariants.test.ts` pins what that does to
// a field of an object: the store and its snapshots both stay on the object
// the field held before. An array element is different, and these tests pin
// how.

describe('an array element redefined from an object to a value that is not an object', () => {
  // FINDING: the store keeps handing out the old object while a snapshot shows the new value; for a field of an object both stay on the old object.
  it.each([
    {what: 'a number', value: 7},
    {what: 'null', value: null},
  ])(
    'shows $what in a snapshot while the store still returns the old object',
    ({value}) => {
      const store = createClassyStore<{rows: ({n: number} | number | null)[]}>({
        rows: [{n: 1}, {n: 2}],
      });
      const old = store.rows[0];

      Object.defineProperty(store.rows, 0, {value});

      expect(store.rows[0]).toBe(old);
      expect(snapshot(store)).toEqual({rows: [value, {n: 2}]});
    },
  );
});
