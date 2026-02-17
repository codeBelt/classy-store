import {describe, expect, it, mock} from 'bun:test';
import {createClassyStore} from '../../core/core';
import {subscribeKey} from './subscribe-key';

/** Flush the queueMicrotask-based batching. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('subscribeKey', () => {
  it('fires callback when the watched key changes', async () => {
    class Store {
      count = 0;
      name = 'hello';
    }

    const store = createClassyStore(new Store());
    const cb = mock((_value: number, _prev: number) => {});

    subscribeKey(store, 'count', cb);

    store.count = 1;
    await tick();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1, 0);
  });

  it('does NOT fire callback when a different key changes', async () => {
    class Store {
      count = 0;
      name = 'hello';
    }

    const store = createClassyStore(new Store());
    const cb = mock((_value: number, _prev: number) => {});

    subscribeKey(store, 'count', cb);

    store.name = 'world';
    await tick();

    expect(cb).toHaveBeenCalledTimes(0);
  });

  it('tracks multiple changes with correct previous values', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const values: Array<[number, number]> = [];

    subscribeKey(store, 'count', (value, prev) => {
      values.push([value, prev]);
    });

    store.count = 1;
    await tick();
    store.count = 5;
    await tick();
    store.count = 10;
    await tick();

    expect(values).toEqual([
      [1, 0],
      [5, 1],
      [10, 5],
    ]);
  });

  it('returns an unsubscribe function that stops notifications', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const cb = mock((_value: number, _prev: number) => {});

    const unsub = subscribeKey(store, 'count', cb);

    store.count = 1;
    await tick();
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();

    store.count = 2;
    await tick();
    expect(cb).toHaveBeenCalledTimes(1); // no additional call
  });

  it('works with object/array values using reference comparison', async () => {
    class Store {
      items = [1, 2, 3];
      label = 'test';
    }

    const store = createClassyStore(new Store());
    const cb = mock(() => {});

    subscribeKey(store, 'items', cb);

    // Changing a different key should not fire
    store.label = 'changed';
    await tick();
    expect(cb).toHaveBeenCalledTimes(0);

    // Replacing the array should fire
    store.items = [4, 5, 6];
    await tick();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not fire when the same value is assigned', async () => {
    class Store {
      count = 42;
    }

    const store = createClassyStore(new Store());
    const cb = mock(() => {});

    subscribeKey(store, 'count', cb);

    // Proxy SET trap prevents notification when value is same via Object.is
    store.count = 42;
    await tick();

    expect(cb).toHaveBeenCalledTimes(0);
  });
});
