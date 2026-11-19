import {afterEach, describe, expect, it, mock} from 'bun:test';
import {createClassyStore, snapshot, subscribe} from '../index';

// The store links a child to its owners through WeakRef, with a fallback for
// a runtime that has none. Every supported runtime has WeakRef, so only a test
// that takes it away reaches the fallback.
describe('a runtime without WeakRef', () => {
  const original = globalThis.WeakRef;

  afterEach(() => {
    Reflect.set(globalThis, 'WeakRef', original);
  });

  it('still tells a store about a write to a nested object', () => {
    Reflect.set(globalThis, 'WeakRef', undefined);
    const store = createClassyStore({user: {name: 'a'}, rows: [{done: false}]});
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    store.user.name = 'b';
    store.rows[0].done = true;

    expect(listener).toHaveBeenCalledTimes(2);
    expect(snapshot(store)).toEqual({user: {name: 'b'}, rows: [{done: true}]});
  });

  it('still shares one child between two stores', () => {
    Reflect.set(globalThis, 'WeakRef', undefined);
    const shared = {count: 1};
    const first = createClassyStore({shared});
    const second = createClassyStore({shared});
    const firstListener = mock(() => {});
    const secondListener = mock(() => {});
    subscribe(first, firstListener, {sync: true});
    subscribe(second, secondListener, {sync: true});

    first.shared.count = 2;

    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);
    expect(snapshot(second).shared.count).toBe(2);
  });
});
