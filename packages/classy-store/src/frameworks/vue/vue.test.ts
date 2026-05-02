import {describe, expect, it} from 'bun:test';
import {effectScope} from 'vue';
import {createClassyStore} from '../../core/core';
import {useClassyStore} from './vue';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('vue useClassyStore', () => {
  it('throws when given a non-store object', () => {
    const scope = effectScope();
    try {
      scope.run(() => {
        expect(() => useClassyStore({count: 0})).toThrow(/not a store proxy/);
      });
    } finally {
      scope.stop();
    }
  });

  it('returns a ShallowRef holding the current snapshot', () => {
    const s = createClassyStore({count: 5});
    const scope = effectScope();
    try {
      scope.run(() => {
        const state = useClassyStore(s);
        expect(state.value).toEqual({count: 5});
      });
    } finally {
      scope.stop();
    }
  });

  it('updates the ref when the store mutates', async () => {
    const s = createClassyStore({count: 0});
    const scope = effectScope();
    let stateRef!: ReturnType<typeof useClassyStore<typeof s>>;
    scope.run(() => {
      stateRef = useClassyStore(s);
    });

    s.count = 42;
    await flush();
    expect(stateRef.value).toEqual({count: 42});
    scope.stop();
  });

  it('unsubscribes when the effect scope is stopped', async () => {
    const s = createClassyStore({count: 0});
    const scope = effectScope();
    let stateRef!: ReturnType<typeof useClassyStore<typeof s>>;
    scope.run(() => {
      stateRef = useClassyStore(s);
    });

    scope.stop();

    const before = stateRef.value;
    s.count = 999;
    await flush();
    // After unmount, ref should not update further.
    expect(stateRef.value).toBe(before);
  });
});
