import {describe, expect, it} from 'bun:test';
import {Injector, runInInjectionContext} from '@angular/core';
import {createClassyStore} from '../../core/core';
import {injectStore} from './angular';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Run `fn` inside an Angular injection context with a fresh injector that
 * exposes a `DestroyRef`. Returns whatever `fn` returns plus a `destroy`
 * function to trigger lifecycle teardown.
 */
function withInjector<T>(fn: () => T): {result: T; destroy: () => void} {
  const injector = Injector.create({providers: []});
  const result = runInInjectionContext(injector, fn);
  return {result, destroy: () => injector.destroy()};
}

describe('angular injectStore', () => {
  it('throws when given a non-store object', () => {
    const {destroy} = withInjector(() => {
      expect(() => injectStore({count: 0})).toThrow(/not a store proxy/);
    });
    destroy();
  });

  it('returns a Signal with the current snapshot', () => {
    const s = createClassyStore({count: 11});
    const {result: state, destroy} = withInjector(() => injectStore(s));
    expect(state()).toEqual({count: 11});
    destroy();
  });

  it('signal updates when the store mutates', async () => {
    const s = createClassyStore({count: 0});
    const {result: state, destroy} = withInjector(() => injectStore(s));

    s.count = 33;
    await flush();
    expect(state()).toEqual({count: 33});
    destroy();
  });

  it('unsubscribes on injector destroy', async () => {
    const s = createClassyStore({count: 0});
    const {result: state, destroy} = withInjector(() => injectStore(s));

    const before = state();
    destroy();

    s.count = 999;
    await flush();
    expect(state()).toBe(before);
  });
});
