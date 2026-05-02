import {describe, expect, it} from 'bun:test';
import {createRoot} from 'solid-js';
import {createClassyStore} from '../../core/core';
import {useClassyStore} from './solid';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('solid useClassyStore', () => {
  it('throws when given a non-store object', () => {
    createRoot((dispose) => {
      expect(() => useClassyStore({count: 0})).toThrow(/not a store proxy/);
      dispose();
    });
  });

  it('returns a signal accessor with the current snapshot', () => {
    const s = createClassyStore({count: 5});
    createRoot((dispose) => {
      const get = useClassyStore(s);
      expect(get()).toEqual({count: 5});
      dispose();
    });
  });

  it('signal updates when the store mutates', async () => {
    const s = createClassyStore({count: 0});
    let getter!: () => unknown;
    let dispose!: () => void;
    createRoot((d) => {
      getter = useClassyStore(s);
      dispose = d;
    });

    s.count = 7;
    await flush();
    expect(getter()).toEqual({count: 7});
    dispose();
  });

  it('cleans up subscription on root dispose', async () => {
    const s = createClassyStore({count: 0});
    let getter!: () => unknown;
    let dispose!: () => void;
    createRoot((d) => {
      getter = useClassyStore(s);
      dispose = d;
    });

    const before = getter();
    dispose();

    s.count = 999;
    await flush();
    expect(getter()).toBe(before);
  });
});
