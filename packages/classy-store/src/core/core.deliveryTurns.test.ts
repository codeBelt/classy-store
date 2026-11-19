import {describe, expect, it} from 'bun:test';
import {createClassyStore, subscribe} from '../index';

// Ordinary subscribers are told once per turn, by one microtask, however many
// writes the turn made. A write that a subscriber makes in response is told by
// a new microtask, which takes its place behind the ones already queued.

/** Let the microtasks that serve ordinary (batched) subscribers run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('several writes in one turn, answered by a write from the subscriber', () => {
  it('are delivered once, and the answering write after a microtask that was queued in between', async () => {
    const store = createClassyStore({count: 0});
    const calls: string[] = [];
    subscribe(store, () => {
      calls.push(`subscriber sees ${store.count}`);
      if (store.count === 2) store.count = 3;
    });

    store.count = 1;
    store.count = 2;
    queueMicrotask(() => calls.push('microtask queued after the writes'));
    await flush();

    expect(calls).toEqual([
      'subscriber sees 2',
      'microtask queued after the writes',
      'subscriber sees 3',
    ]);
  });
});
