import {describe, expect, it, mock} from 'bun:test';
import {reactiveSet} from '../collections/index';
import {createClassyStore, snapshot, subscribe} from '../index';

// `createClassyStore()` takes any object, and a function is one. These tests
// pin what a store made from a function does where other code meets it: as a
// member of a reactive collection, and as a value held by another store. A
// `FINDING` comment marks behaviour that looks like a surprise: it is pinned
// as it is, not endorsed.

type Handler = (() => string) & {uses: number};

/** A function with a field of its own, so that there is state to write. */
const createHandler = (): Handler => Object.assign(() => 'called', {uses: 0});

/** A synchronous subscriber, so that notifications can be counted at once. */
function watch(store: object) {
  const listener = mock(() => {});
  subscribe(store, listener, {sync: true});
  return listener;
}

describe('a store made from a function, as a member of a reactive set', () => {
  it('is held once, found again and removed, when it is given as its proxy each time', () => {
    const handler = createClassyStore(createHandler());
    const store = createClassyStore({handlers: reactiveSet<Handler>()});

    store.handlers.add(handler);
    store.handlers.add(handler);

    expect(store.handlers.size).toBe(1);
    expect(store.handlers.has(handler)).toBe(true);
    expect(store.handlers.delete(handler)).toBe(true);
    expect(store.handlers.size).toBe(0);
  });

  // FINDING: a raw object and its store proxy are one member of a reactive collection, but a raw function and its store proxy are two.
  it('is not found by the raw function it was made from', () => {
    const raw = createHandler();
    const handler = createClassyStore(raw);
    const store = createClassyStore({handlers: reactiveSet<Handler>()});

    store.handlers.add(handler);

    expect(store.handlers.has(raw)).toBe(false);
  });
});

// FINDING: a store made from an object and held by another store reports its changes to the holder. One made from a function does not: the holder treats it as a method, never as a nested store.
describe('a store made from a function, held by another store', () => {
  it('present in the initial state, it does not tell the holder of its own writes, and the holder snapshot keeps it as it is', () => {
    const handler = createClassyStore(createHandler());
    const holder = createClassyStore({handler});
    const listener = watch(holder);

    handler.uses = 1;

    expect(listener).toHaveBeenCalledTimes(0);
    expect(snapshot(holder).handler).toBe(handler);
  });

  it('assigned later, it does not tell the holder of its own writes, and the holder snapshot keeps it as it is', () => {
    const handler = createClassyStore(createHandler());
    const holder = createClassyStore<{handler?: Handler}>({});
    holder.handler = handler;
    const listener = watch(holder);

    handler.uses = 1;

    expect(listener).toHaveBeenCalledTimes(0);
    expect(snapshot(holder).handler).toBe(handler);
  });
});
