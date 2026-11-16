import {describe, expect, it, mock} from 'bun:test';
import {computed, effectScope, isShallow, nextTick, watch} from 'vue';
import {createClassyStore, getInternal, subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import {useClassyStore} from './vue';

describe('vue useClassyStore', () => {
  it('throws when given a non-store object', () => {
    const scope = effectScope();
    try {
      scope.run(() =>
        expect(() => useClassyStore({count: 0})).toThrow(/not a store proxy/),
      );
    } finally {
      scope.stop();
    }
  });

  it('rejects calls without an active scope before subscribing', () => {
    const store = createClassyStore({count: 0});
    expect(() => useClassyStore(store)).toThrow(/active.*scope/i);
    expect(getInternal(store).syncListeners.size).toBe(0);
    expect(getInternal(store).batchedListeners.size).toBe(0);
  });

  it('rejects calls after the current scope has stopped', () => {
    const store = createClassyStore({count: 0});
    const scope = effectScope();
    scope.run(() => {
      scope.stop();
      expect(() => useClassyStore(store)).toThrow(/active.*scope/i);
    });
    expect(getInternal(store).syncListeners.size).toBe(0);
    expect(getInternal(store).batchedListeners.size).toBe(0);
  });

  it('returns a shallow ref containing the current immutable snapshot', () => {
    const store = createClassyStore({count: 5, nested: {label: 'Initial'}});
    const scope = effectScope();
    try {
      const state = scope.run(() => useClassyStore(store));
      expect(isShallow(state)).toBe(true);
      expect(state?.value).toBe(snapshot(store));
      expect(Object.isFrozen(state?.value)).toBe(true);
      expect(Object.isFrozen(state?.value.nested)).toBe(true);
    } finally {
      scope.stop();
    }
  });

  it('updates refs and computed values synchronously while Vue watchers and core subscriptions batch', async () => {
    const store = createClassyStore({count: 0});
    const scope = effectScope();
    const coreCallback = mock(() => {});
    const stopCore = subscribe(store, coreCallback);
    const watcher = mock(() => {});
    const result = scope.run(() => {
      const state = useClassyStore(store);
      watch(state, watcher);
      return {state, doubled: computed(() => state.value.count * 2)};
    });
    if (!result) throw new Error('Missing scope result');
    try {
      store.count = 1;
      expect(result.state.value.count).toBe(1);
      expect(result.doubled.value).toBe(2);
      store.count = 2;
      expect(result.state.value.count).toBe(2);
      expect(result.doubled.value).toBe(4);
      expect(coreCallback).not.toHaveBeenCalled();
      expect(watcher).not.toHaveBeenCalled();
      await nextTick();
      expect(coreCallback).toHaveBeenCalledTimes(1);
      expect(watcher).toHaveBeenCalledTimes(1);
    } finally {
      scope.stop();
      stopCore();
    }
  });

  it('flushes Vue post effects after a single nextTick following a store mutation', async () => {
    const store = createClassyStore({count: 0});
    const scope = effectScope();
    const rendered: number[] = [];
    scope.run(() => {
      const state = useClassyStore(store);
      watch(state, (value) => rendered.push(value.count), {flush: 'post'});
    });
    try {
      store.count = 1;
      await nextTick();
      expect(rendered).toEqual([1]);
    } finally {
      scope.stop();
    }
  });

  it('cleans up each scope independently and reads fresh state on remount', async () => {
    const store = createClassyStore({count: 0});
    const firstScope = effectScope();
    const secondScope = effectScope();
    const first = firstScope.run(() => useClassyStore(store));
    const second = secondScope.run(() => useClassyStore(store));
    if (!first || !second) throw new Error('Missing scope result');
    try {
      store.count = 1;
      firstScope.stop();
      firstScope.stop();
      store.count = 2;
      await nextTick();
      expect(first.value.count).toBe(1);
      expect(second.value.count).toBe(2);
    } finally {
      firstScope.stop();
      secondScope.stop();
    }
    expect(getInternal(store).syncListeners.size).toBe(0);
    expect(getInternal(store).batchedListeners.size).toBe(0);
    const remountedScope = effectScope();
    try {
      const remounted = remountedScope.run(() => useClassyStore(store));
      expect(remounted?.value.count).toBe(2);
    } finally {
      remountedScope.stop();
    }
  });

  it('does not update a ref whose scope is stopped during the same notification', async () => {
    const store = createClassyStore({count: 0});
    const scope = effectScope();
    const stop = subscribe(store, () => scope.stop(), {sync: true});
    const state = scope.run(() => useClassyStore(store));
    try {
      store.count = 1;
      await nextTick();
      expect(state?.value.count).toBe(0);
    } finally {
      scope.stop();
      stop();
    }
    expect(getInternal(store).syncListeners.size).toBe(0);
    expect(getInternal(store).batchedListeners.size).toBe(0);
  });
});
