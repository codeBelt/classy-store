import {describe, expect, it, mock} from 'bun:test';
import {createClassyStore, getInternal, subscribe} from '../../core/core';
import {toSvelteStore} from './svelte';

describe('toSvelteStore', () => {
  it('throws when given a non-store object', () => {
    expect(() => toSvelteStore({count: 0})).toThrow(/not a store proxy/);
  });

  it('immediately delivers the current immutable snapshot to each subscriber', () => {
    const store = createClassyStore({count: 7});
    const readable = toSvelteStore(store);
    const run = mock((value: {readonly count: number}) => {
      expect(Object.isFrozen(value)).toBe(true);
    });
    const unsubscribe = readable.subscribe(run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenLastCalledWith({count: 7});
    unsubscribe();

    store.count = 8;
    const unsubscribeAgain = readable.subscribe(run);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith({count: 8});
    unsubscribeAgain();
  });

  it('delivers each mutation synchronously while ordinary subscriptions stay batched', async () => {
    const store = createClassyStore({count: 0});
    const values: number[] = [];
    const batched = mock(() => {});
    const unsubscribeCore = subscribe(store, batched);
    const unsubscribe = toSvelteStore(store).subscribe((value) => {
      values.push(value.count);
    });

    try {
      store.count = 1;
      expect(values).toEqual([0, 1]);
      store.count = 2;
      expect(values).toEqual([0, 1, 2]);
      expect(batched).not.toHaveBeenCalled();
      await Promise.resolve();
      expect(batched).toHaveBeenCalledTimes(1);
      expect(values).toEqual([0, 1, 2]);
    } finally {
      unsubscribe();
      unsubscribeCore();
    }
  });

  it('observes a mutation made by the initial subscription callback', () => {
    const store = createClassyStore({count: 0});
    const values: number[] = [];
    const unsubscribe = toSvelteStore(store).subscribe((value) => {
      values.push(value.count);
      if (value.count === 0) store.count = 1;
    });

    try {
      expect(values).toEqual([0, 1]);
    } finally {
      unsubscribe();
    }
  });

  it('removes the listener if the initial callback throws', () => {
    const store = createClassyStore({count: 0});
    const internal = getInternal(store);
    const run = mock(() => {
      throw new Error('Initial subscriber failed');
    });

    expect(() => toSvelteStore(store).subscribe(run)).toThrow(
      'Initial subscriber failed',
    );
    expect(internal.syncListeners.size).toBe(0);
    expect(internal.batchedListeners.size).toBe(0);
    store.count = 1;
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('cleans up independently and tolerates repeated unsubscription', async () => {
    const store = createClassyStore({count: 0});
    const readable = toSvelteStore(store);
    const firstValues: number[] = [];
    const secondValues: number[] = [];
    const unsubscribeFirst = readable.subscribe((value) => {
      firstValues.push(value.count);
    });
    const unsubscribeSecond = readable.subscribe((value) => {
      secondValues.push(value.count);
    });

    store.count = 1;
    unsubscribeFirst();
    unsubscribeFirst();
    store.count = 2;
    unsubscribeSecond();
    store.count = 3;
    await Promise.resolve();

    expect(firstValues).toEqual([0, 1]);
    expect(secondValues).toEqual([0, 1, 2]);
    expect(getInternal(store).syncListeners.size).toBe(0);
    expect(getInternal(store).batchedListeners.size).toBe(0);
  });

  it('does not call a subscriber removed during the same notification', async () => {
    const store = createClassyStore({count: 0});
    const readable = toSvelteStore(store);
    let unsubscribeSecond = () => {};
    const unsubscribeFirst = readable.subscribe((value) => {
      if (value.count > 0) unsubscribeSecond();
    });
    const second = mock(() => {});
    unsubscribeSecond = readable.subscribe(second);

    try {
      store.count = 1;
      await Promise.resolve();
      expect(second).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribeFirst();
      unsubscribeSecond();
    }
  });
});
