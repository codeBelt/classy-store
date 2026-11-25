import {describe, expect, it, mock} from 'bun:test';
import {createClassyStore, subscribe} from '../index';

// A hand-written Proxy often answers `ownKeys` and `get` for keys that its
// target does not hold, and leaves `getOwnPropertyDescriptor` alone. The keys
// it lists then have no descriptor. A store can still be made from it.

/** A Proxy over an empty object that serves its keys from `data`. */
function createVirtualObject(data: Record<string, number>) {
  return new Proxy<Record<string, number>>(
    {},
    {
      ownKeys: () => Object.keys(data),
      get: (_target, key) => (typeof key === 'string' ? data[key] : undefined),
      set: (_target, key, value: number) => {
        if (typeof key === 'string') data[key] = value;
        return true;
      },
    },
  );
}

describe('a store made from a Proxy that lists keys it does not describe', () => {
  it('is created, and reads its values through the Proxy', () => {
    const store = createClassyStore(createVirtualObject({count: 1}));

    expect(store.count).toBe(1);
  });

  it('passes a write on to the Proxy and notifies once', () => {
    const data = {count: 1};
    const store = createClassyStore(createVirtualObject(data));
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    store.count = 2;

    expect(data).toEqual({count: 2});
    expect(store.count).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
