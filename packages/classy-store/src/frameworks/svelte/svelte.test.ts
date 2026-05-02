import {describe, expect, it, mock} from 'bun:test';
import {createClassyStore} from '../../core/core';
import {toSvelteStore} from './svelte';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('toSvelteStore', () => {
  it('throws when given a non-store object', () => {
    expect(() => toSvelteStore({count: 0})).toThrow(/not a store proxy/);
  });

  it('calls the run callback immediately with the current snapshot', () => {
    const s = createClassyStore({count: 7});
    const store = toSvelteStore(s);
    const run = mock((_v: unknown) => {});
    store.subscribe(run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toEqual({count: 7});
  });

  it('calls run again with a new snapshot when the store mutates', async () => {
    const s = createClassyStore({count: 0});
    const store = toSvelteStore(s);
    const run = mock((_v: unknown) => {});
    store.subscribe(run);
    s.count = 1;
    await flush();
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1][0]).toEqual({count: 1});
  });

  it('returns an unsubscribe function that stops further calls', async () => {
    const s = createClassyStore({count: 0});
    const store = toSvelteStore(s);
    const run = mock((_v: unknown) => {});
    const unsub = store.subscribe(run);
    unsub();
    s.count = 99;
    await flush();
    expect(run).toHaveBeenCalledTimes(1); // only the initial sync call
  });
});
