import {describe, expect, it} from 'bun:test';
import {createRoot, getOwner, runWithOwner} from 'solid-js';
import {createClassyStore, getInternal, subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import {useClassyStore} from './solid';

// Bun resolves Solid's server runtime. Client scheduling is tested in Playwright.
describe('solid useClassyStore', () => {
  it('validates the store before checking ownership', () => {
    expect(() => useClassyStore({count: 0})).toThrow(/not a store proxy/);
  });

  it('rejects calls without an owner before subscribing', () => {
    const store = createClassyStore({count: 0});
    expect(() => useClassyStore(store)).toThrow(/active Solid owner/);
    expect(getInternal(store).syncListeners.size).toBe(0);
    expect(getInternal(store).batchedListeners.size).toBe(0);
  });

  it('rejects a disposed owner before subscribing', () => {
    const store = createClassyStore({count: 0});
    const owner = createRoot((dispose) => {
      const current = getOwner();
      dispose();
      return current;
    });
    runWithOwner(owner, () => {
      expect(() => useClassyStore(store)).toThrow(/active Solid owner/);
    });
    expect(getInternal(store).syncListeners.size).toBe(0);
    expect(getInternal(store).batchedListeners.size).toBe(0);
  });

  it('returns the current immutable snapshot without copying it', () => {
    const store = createClassyStore({count: 5, nested: {label: 'Initial'}});
    createRoot((dispose) => {
      try {
        const state = useClassyStore(store);
        expect(state()).toBe(snapshot(store));
        expect(Object.isFrozen(state())).toBe(true);
        expect(Object.isFrozen(state().nested)).toBe(true);
      } finally {
        dispose();
      }
    });
  });

  it('cleans up independent roots and reads fresh state on remount', async () => {
    const store = createClassyStore({count: 0});
    const first = createRoot((dispose) => ({
      state: useClassyStore(store),
      dispose,
    }));
    const second = createRoot((dispose) => ({
      state: useClassyStore(store),
      dispose,
    }));
    try {
      store.count = 1;
      await Promise.resolve();
      first.dispose();
      first.dispose();
      store.count = 2;
      await Promise.resolve();
      expect(first.state().count).toBe(1);
      expect(second.state().count).toBe(2);
    } finally {
      first.dispose();
      second.dispose();
    }
    expect(getInternal(store).syncListeners.size).toBe(0);
    expect(getInternal(store).batchedListeners.size).toBe(0);
    createRoot((dispose) => {
      try {
        expect(useClassyStore(store)().count).toBe(2);
      } finally {
        dispose();
      }
    });
  });

  it('disposes subscriptions in nested roots with their parent', () => {
    const store = createClassyStore({count: 0});
    const dispose = createRoot((stopParent) => {
      useClassyStore(store);
      createRoot(() => useClassyStore(store));
      return stopParent;
    });
    try {
      expect(getInternal(store).syncListeners.size).toBe(2);
    } finally {
      dispose();
    }
    expect(getInternal(store).syncListeners.size).toBe(0);
    expect(getInternal(store).batchedListeners.size).toBe(0);
  });

  it('ignores delivery after disposal during an in-progress notification', async () => {
    const store = createClassyStore({count: 0});
    let dispose = () => {};
    const stop = subscribe(store, () => dispose(), {sync: true});
    const state = createRoot((stopRoot) => {
      dispose = stopRoot;
      return useClassyStore(store);
    });
    try {
      store.count = 1;
      await Promise.resolve();
      expect(state().count).toBe(0);
    } finally {
      dispose();
      stop();
    }
    expect(getInternal(store).syncListeners.size).toBe(0);
    expect(getInternal(store).batchedListeners.size).toBe(0);
  });
});
