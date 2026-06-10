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

  it('works with boolean values', async () => {
    class Store {
      active = false;
    }

    const store = createClassyStore(new Store());
    const cb = mock((_value: boolean, _prev: boolean) => {});

    subscribeKey(store, 'active', cb);

    store.active = true;
    await tick();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(true, false);

    store.active = false;
    await tick();

    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenCalledWith(false, true);
  });

  it('works with string values', async () => {
    class Store {
      status = 'idle';
    }

    const store = createClassyStore(new Store());
    const values: string[] = [];

    subscribeKey(store, 'status', (v) => values.push(v));

    store.status = 'loading';
    await tick();
    store.status = 'done';
    await tick();

    expect(values).toEqual(['loading', 'done']);
  });

  it('works with null and undefined transitions', async () => {
    class Store {
      data: string | null = null;
    }

    const store = createClassyStore(new Store());
    const cb = mock((_value: string | null, _prev: string | null) => {});

    subscribeKey(store, 'data', cb);

    store.data = 'hello';
    await tick();
    expect(cb).toHaveBeenCalledWith('hello', null);

    store.data = null;
    await tick();
    expect(cb).toHaveBeenCalledWith(null, 'hello');
  });

  it('can subscribe to multiple keys independently', async () => {
    class Store {
      count = 0;
      name = 'hello';
    }

    const store = createClassyStore(new Store());
    const countCb = mock(() => {});
    const nameCb = mock(() => {});

    subscribeKey(store, 'count', countCb);
    subscribeKey(store, 'name', nameCb);

    store.count = 1;
    await tick();

    expect(countCb).toHaveBeenCalledTimes(1);
    expect(nameCb).toHaveBeenCalledTimes(0);

    store.name = 'world';
    await tick();

    expect(countCb).toHaveBeenCalledTimes(1);
    expect(nameCb).toHaveBeenCalledTimes(1);
  });

  it('multiple subscribers on the same key all fire', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const cb1 = mock(() => {});
    const cb2 = mock(() => {});

    subscribeKey(store, 'count', cb1);
    subscribeKey(store, 'count', cb2);

    store.count = 5;
    await tick();

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('supports sync notifications', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const cb = mock((_value: number, _prev: number) => {});

    subscribeKey(store, 'count', cb, {sync: true});

    store.count = 1;

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1, 0);

    await tick();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing one subscriber does not affect others', async () => {
    class Store {
      count = 0;
    }

    const store = createClassyStore(new Store());
    const cb1 = mock(() => {});
    const cb2 = mock(() => {});

    const unsub1 = subscribeKey(store, 'count', cb1);
    subscribeKey(store, 'count', cb2);

    store.count = 1;
    await tick();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);

    unsub1();

    store.count = 2;
    await tick();
    expect(cb1).toHaveBeenCalledTimes(1); // no more calls
    expect(cb2).toHaveBeenCalledTimes(2); // still fires
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
