import {afterEach, describe, expect, it} from 'bun:test';
import {createClassyStore, snapshot, subscribe} from '../index';

// A child with several owners uses a FinalizationRegistry to forget an owner
// that was collected. The store checks for the constructor before using it, so
// a runtime without one keeps working and only gives up that clean-up. Every
// supported runtime has it, so only a test that takes it away reaches the
// check. `core.characterisation.noWeakRef.test.ts` does the same for WeakRef.
describe('a runtime without FinalizationRegistry', () => {
  const original = globalThis.FinalizationRegistry;

  afterEach(() => {
    Reflect.set(globalThis, 'FinalizationRegistry', original);
  });

  it('still tells a store about a write to a nested object', () => {
    Reflect.set(globalThis, 'FinalizationRegistry', undefined);
    const store = createClassyStore({user: {name: 'a'}});
    const seen: unknown[] = [];
    subscribe(store, () => seen.push(snapshot(store)), {sync: true});

    store.user.name = 'b';

    expect(seen).toEqual([{user: {name: 'b'}}]);
  });

  it('still shares one child between two stores', () => {
    Reflect.set(globalThis, 'FinalizationRegistry', undefined);
    const shared = {count: 1};
    const first = createClassyStore({shared});
    const second = createClassyStore({shared});
    const calls: string[] = [];
    subscribe(first, () => calls.push('first'), {sync: true});
    subscribe(second, () => calls.push('second'), {sync: true});

    first.shared.count = 2;

    expect(calls).toEqual(['first', 'second']);
    expect(snapshot(second)).toEqual({shared: {count: 2}});
  });
});
