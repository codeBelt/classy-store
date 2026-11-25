import {describe, expect, it} from 'bun:test';
import {createClassyStore, snapshot} from '../index';

// Which own keys a snapshot has, and in what order, for state that is not a
// plain list of data fields: a getter declared among the fields, and a state
// object that is itself a Proxy. A comment starting with FINDING marks
// behaviour that looks like a surprise; it is pinned all the same.

describe('the own keys of a snapshot', () => {
  // FINDING: a snapshot lists every data field before any getter, so its key order differs from the store's when a getter is declared first.
  it('list a getter declared before a data field after that field', () => {
    const store = createClassyStore({
      get double(): number {
        return this.count * 2;
      },
      count: 1,
    });

    expect(Object.keys(store)).toEqual(['double', 'count']);
    expect(Object.keys(snapshot(store))).toEqual(['count', 'double']);
    expect(JSON.stringify(snapshot(store))).toBe('{"count":1,"double":2}');
  });
});

describe('a state object that is a Proxy listing a key it does not describe', () => {
  /** A Proxy whose `ownKeys` names `ghost`, a key the object behind it lacks. */
  function createHaunted<T extends object>(target: T): T {
    return new Proxy(target, {
      ownKeys: (inner) => [...Reflect.ownKeys(inner), 'ghost'],
    });
  }

  it('is snapshotted without that key', () => {
    const store = createClassyStore(
      createHaunted({
        count: 1,
        get double(): number {
          return this.count * 2;
        },
      }),
    );

    const snap = snapshot(store);

    expect(Object.keys(snap)).toEqual(['count', 'double']);
    expect('ghost' in snap).toBe(false);
    expect(snap.double).toBe(2);
  });

  it('is snapshotted without that key when it is nested in a store', () => {
    const store = createClassyStore({nested: createHaunted({count: 1})});

    store.nested.count = 2;

    expect(Object.keys(snapshot(store).nested)).toEqual(['count']);
    expect(snapshot(store)).toEqual({nested: {count: 2}});
  });
});
