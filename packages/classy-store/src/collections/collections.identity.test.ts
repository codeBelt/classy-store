import {describe, expect, mock, spyOn, test} from 'bun:test';
import {createProxy, isChanged} from 'proxy-compare';
import {createClassyStore, subscribe} from '../core/core';
import {TrackedProxyCache} from '../frameworks/react/utils/trackedProxyCache/trackedProxyCache';
import {snapshot} from '../snapshot/snapshot';
import {reactiveMap, reactiveSet} from './collections';

type User = {id: number; name: string};

describe('reactive collections inside a store — object members', () => {
  test('a map finds, replaces and deletes an entry by the same raw object key', () => {
    const key = {id: 1};
    const store = createClassyStore({users: reactiveMap<object, string>()});

    store.users.set(key, 'Ada');
    store.users.set(key, 'Grace');

    expect(store.users.size).toBe(1);
    expect(store.users.has(key)).toBe(true);
    expect(store.users.get(key)).toBe('Grace');
    expect(store.users.delete(key)).toBe(true);
    expect(store.users.size).toBe(0);
  });

  test('a set holds each raw object once and can remove it again', () => {
    const tag = {label: 'urgent'};
    const store = createClassyStore({tags: reactiveSet<object>()});

    store.tags.add(tag);
    store.tags.add(tag);

    expect(store.tags.size).toBe(1);
    expect(store.tags.has(tag)).toBe(true);
    expect(store.tags.delete(tag)).toBe(true);
    expect(store.tags.has(tag)).toBe(false);
  });

  test('the raw object, its store proxy and its snapshots are one key', () => {
    const ada: User = {id: 1, name: 'Ada'};
    const store = createClassyStore({
      users: [ada],
      selected: reactiveSet<User>(),
      notes: reactiveMap<User, string>(),
    });
    store.selected.add(store.users[0]); // Added through its proxy…
    store.notes.set(ada, 'first'); // …and through the raw object.

    const snap = snapshot(store);
    for (const view of [ada, store.users[0], snap.users[0] as User]) {
      expect(store.selected.has(view)).toBe(true);
      expect(store.notes.get(view)).toBe('first');
      // The same lookups work on the frozen snapshot.
      expect(snap.selected.has(view)).toBe(true);
      expect(snap.notes.get(view)).toBe('first');
    }
    expect(store.selected.has({id: 1, name: 'Ada'})).toBe(false);

    store.notes.set(snap.users[0] as User, 'second');
    expect(store.notes.size).toBe(1);
    // Updating keeps the key that was first stored.
    expect(snapshot(store).notes.keys().next().value).toBe(
      snapshot(store).users[0] as User,
    );
  });

  test('an older snapshot of a member still identifies it after it changes', () => {
    const store = createClassyStore({
      users: [{id: 1, name: 'Ada'}] as User[],
      selected: reactiveSet<User>(),
    });
    store.selected.add(store.users[0]);
    const before = snapshot(store).users[0] as User;

    store.users[0].name = 'Grace';

    expect(snapshot(store).users[0]).not.toBe(before);
    expect(store.selected.has(before)).toBe(true);
    expect(snapshot(store).selected.has(before)).toBe(true);
  });

  test('a value read from a map is live state', () => {
    const store = createClassyStore({
      users: reactiveMap<string, User>([['a', {id: 1, name: 'Ada'}]]),
    });
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    const user = store.users.get('a') as User;
    user.name = 'Grace';

    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store).users.get('a')?.name).toBe('Grace');
  });

  test('setting the value a key already has changes nothing', () => {
    const store = createClassyStore({
      settings: reactiveMap<string, number>([['size', 12]]),
    });
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});
    const before = snapshot(store);

    store.settings.set('size', 12);

    expect(listener).not.toHaveBeenCalled();
    expect(snapshot(store)).toBe(before);
  });

  test('NaN is a usable key and value', () => {
    const store = createClassyStore({
      map: reactiveMap<number, string>(),
      set: reactiveSet<number>(),
    });
    store.map.set(Number.NaN, 'nan');
    store.set.add(Number.NaN);
    store.set.add(Number.NaN);
    expect(store.map.get(Number.NaN)).toBe('nan');
    expect(store.set.size).toBe(1);
  });
});

describe('reactive collections — lookup cost', () => {
  const entries = (count: number): [string, number][] =>
    Array.from({length: count}, (_, index) => [`key${index}`, index]);

  /** Property reads that go through a store proxy during `run`. */
  function proxiedReads(run: () => void): number {
    const reflectGet = Reflect.get;
    let reads = 0;
    const spy = spyOn(Reflect, 'get').mockImplementation(((
      ...args: Parameters<typeof Reflect.get>
    ) => {
      reads++;
      return reflectGet(...args);
    }) as typeof Reflect.get);
    try {
      run();
    } finally {
      spy.mockRestore();
    }
    return reads;
  }

  test('a live lookup does not walk the entries through the proxy', () => {
    const small = createClassyStore({map: reactiveMap(entries(10))});
    const large = createClassyStore({map: reactiveMap(entries(2000))});

    const smallReads = proxiedReads(() => {
      expect(small.map.get('key9')).toBe(9);
      expect(small.map.has('missing')).toBe(false);
    });
    const largeReads = proxiedReads(() => {
      expect(large.map.get('key1999')).toBe(1999);
      expect(large.map.has('missing')).toBe(false);
    });

    // The proxy work is the same handful of reads whatever the size.
    expect(largeReads).toBe(smallReads);
    expect(largeReads).toBeLessThan(20);
  });

  test('a set lookup does not walk the items through the proxy', () => {
    const items = Array.from({length: 2000}, (_, index) => index);
    const store = createClassyStore({set: reactiveSet(items)});

    const reads = proxiedReads(() => {
      expect(store.set.has(1999)).toBe(true);
      expect(store.set.has(-1)).toBe(false);
    });

    expect(reads).toBeLessThan(20);
  });
});

describe('reactive collections — tracked reads in a component', () => {
  test('a lookup records the entries it compared, so a replaced key is noticed', () => {
    const a = {id: 'a'};
    const b = {id: 'b'};
    const shared = {label: 'same value'};
    const store = createClassyStore({map: reactiveMap<object, object>()});
    store.map.set(a, shared);
    const before = snapshot(store);
    const affected = new WeakMap<object, unknown>();
    const tracked = createProxy(before, affected, new TrackedProxyCache());

    expect(tracked.map.get(a)).toEqual(shared);
    expect(tracked.map.has(b)).toBe(false);

    // Same length, same value object, different key.
    store.map.delete(a);
    store.map.set(b, shared);
    const after = snapshot(store);
    const afterTracked = createProxy(
      after,
      new WeakMap<object, unknown>(),
      new TrackedProxyCache(),
    );
    expect(afterTracked.map.get(a)).toBeUndefined();
    expect(afterTracked.map.has(b)).toBe(true);

    expect(isChanged(before, after, affected)).toBe(true);
  });
});
