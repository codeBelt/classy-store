import {describe, expect, it, mock} from 'bun:test';
import {createClassyStore, subscribe} from '../index';

// A store is built from its initial state without recursion, so the depth of
// that state is bounded by memory and not by the call stack.

type Link = {value: number; next?: Link};

/** A chain of `length` objects, each holding the next one. */
function createChain(length: number): Link {
  const head: Link = {value: 0};
  let tail = head;
  for (let index = 1; index < length; index++) {
    tail.next = {value: index};
    tail = tail.next;
  }
  return head;
}

describe('a store created from very deeply nested state', () => {
  it('is created without overflowing the stack, and a write at the bottom notifies the store', () => {
    const store = createClassyStore(createChain(100_000));
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});
    let last = store;
    while (last.next) last = last.next;

    last.value = -1;

    expect(last.value).toBe(-1);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
