import {describe, expect, it, mock} from 'bun:test';
import {createClassyStore, subscribe} from '../index';

// A typed array is fixed in size: the language accepts a write past its end
// and stores nothing. These tests pin what a store made from one does with
// such a write. A `FINDING` comment marks behaviour that looks like a
// surprise: it is pinned as it is, not endorsed.

/** A synchronous subscriber, so that notifications can be counted at once. */
function watch(store: object) {
  const listener = mock(() => {});
  subscribe(store, listener, {sync: true});
  return listener;
}

describe('a store made from a typed array', () => {
  it('stores a write to an index it has, and notifies once', () => {
    const raw = new Uint8Array(2);
    const bytes = createClassyStore(raw);
    const listener = watch(bytes);

    bytes[0] = 7;

    expect(bytes[0]).toBe(7);
    expect(Array.from(raw)).toEqual([7, 0]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // FINDING: the write stores nothing, as on the raw typed array, yet subscribers are notified of it.
  it('accepts a write past its end without storing it, and still notifies', () => {
    const raw = new Uint8Array(2);
    const bytes = createClassyStore(raw);
    const listener = watch(bytes);

    bytes[5] = 1;

    expect(bytes[5]).toBeUndefined();
    expect(Array.from(raw)).toEqual([0, 0]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
