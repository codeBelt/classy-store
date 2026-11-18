import {describe, expect, it, mock} from 'bun:test';
import {
  computed,
  DestroyRef,
  Injector,
  inject,
  isSignal,
  runInInjectionContext,
} from '@angular/core';
import {createClassyStore, getInternal, subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import {injectClassyStore} from './angular';

function withInjector<T>(fn: () => T) {
  const injector = Injector.create({providers: []});
  try {
    return {
      result: runInInjectionContext(injector, fn),
      destroy: () => injector.destroy(),
    };
  } catch (error) {
    injector.destroy();
    throw error;
  }
}

function expectNoListeners(store: object) {
  expect(getInternal(store).syncListeners.size).toBe(0);
  expect(getInternal(store).batchedListeners.size).toBe(0);
}

describe('angular injectClassyStore', () => {
  it('rejects non-store objects', () => {
    expect(() => withInjector(() => injectClassyStore({count: 0}))).toThrow(
      /not a store proxy/,
    );
  });

  it('requires an injection context without leaking a listener', () => {
    const store = createClassyStore({count: 0});
    expect(() => injectClassyStore(store)).toThrow(/injection context/i);
    expectNoListeners(store);
  });

  it('rejects a destroyed injector without leaking a listener', () => {
    const store = createClassyStore({count: 0});
    const injector = Injector.create({providers: []});
    runInInjectionContext(injector, () => {
      injector.destroy();
      expect(() => injectClassyStore(store)).toThrow(/destroyed/i);
    });
    expectNoListeners(store);
  });

  it('rejects an already-destroyed DestroyRef without leaking a listener', () => {
    const store = createClassyStore({count: 0});
    // A component's injector still hands out its DestroyRef after the view is
    // destroyed. Stand in for that injector: the root one refuses first.
    const onDestroy = mock(() => () => {});
    const viewInjector = {
      get: (token: unknown) =>
        token === DestroyRef ? {destroyed: true, onDestroy} : null,
    } as unknown as Injector;

    expect(() =>
      runInInjectionContext(viewInjector, () => injectClassyStore(store)),
    ).toThrow(/live Angular injection context/);
    expect(onDestroy).not.toHaveBeenCalled();
    expectNoListeners(store);
  });

  it('returns a readonly signal with the current immutable snapshot', () => {
    const store = createClassyStore({count: 11, nested: {label: 'Initial'}});
    const {result: state, destroy} = withInjector(() =>
      injectClassyStore(store),
    );
    try {
      expect(isSignal(state)).toBe(true);
      expect('set' in state).toBe(false);
      expect(state()).toBe(snapshot(store));
      expect(Object.isFrozen(state())).toBe(true);
      expect(Object.isFrozen(state().nested)).toBe(true);
    } finally {
      destroy();
    }
  });

  it('updates signals and computed values immediately while ordinary subscribers batch', async () => {
    class Counter {
      count = 0;
      get doubled() {
        return this.count * 2;
      }
    }
    const store = createClassyStore(new Counter());
    const callback = mock(() => {});
    const stop = subscribe(store, callback);
    const {result: state, destroy} = withInjector(() =>
      injectClassyStore(store),
    );
    const total = computed(() => state().doubled + 1);
    try {
      expect(total()).toBe(1);
      store.count = 1;
      expect(state().count).toBe(1);
      expect(total()).toBe(3);
      store.count = 2;
      expect(total()).toBe(5);
      expect(callback).not.toHaveBeenCalled();
      await Promise.resolve();
      expect(callback).toHaveBeenCalledTimes(1);
    } finally {
      destroy();
      stop();
    }
  });

  it('cleans up independent consumers and reads current state on remount', async () => {
    const store = createClassyStore({count: 0});
    const first = withInjector(() => injectClassyStore(store));
    const second = withInjector(() => injectClassyStore(store));
    store.count = 1;
    first.destroy();
    try {
      store.count = 2;
      await Promise.resolve();
      expect(first.result().count).toBe(1);
      expect(second.result().count).toBe(2);
      expect(getInternal(store).syncListeners.size).toBe(1);
    } finally {
      second.destroy();
    }
    expectNoListeners(store);
    const remounted = withInjector(() => injectClassyStore(store));
    expect(remounted.result().count).toBe(2);
    remounted.destroy();
    expectNoListeners(store);
  });

  it('ignores callbacks copied before an earlier listener destroys the injector', async () => {
    const store = createClassyStore({count: 0});
    const injector = Injector.create({providers: []});
    const stop = subscribe(store, () => injector.destroy(), {sync: true});
    const state = runInInjectionContext(injector, () =>
      injectClassyStore(store),
    );
    try {
      store.count = 1;
      await Promise.resolve();
      expect(state().count).toBe(0);
    } finally {
      stop();
    }
    expectNoListeners(store);
  });

  it('ignores writes from an earlier destroy callback', async () => {
    const store = createClassyStore({count: 0});
    const {result: state, destroy} = withInjector(() => {
      inject(DestroyRef).onDestroy(() => {
        store.count = 1;
      });
      return injectClassyStore(store);
    });
    destroy();
    await Promise.resolve();
    expect(state().count).toBe(0);
    expectNoListeners(store);
  });
});
