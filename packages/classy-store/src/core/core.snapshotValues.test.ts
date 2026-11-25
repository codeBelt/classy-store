import {describe, expect, mock, test} from 'bun:test';
import {createProxy} from 'proxy-compare';
import {TrackedProxyCache} from '../frameworks/react/utils/trackedProxyCache/trackedProxyCache';
import {PROXYABLE} from '../index';
import {snapshot} from '../snapshot/snapshot';
import {createClassyStore, identityOf, subscribe, unwrap} from './core';

type Todo = {id: number; done: boolean};

describe('snapshots kept in a store', () => {
  test('a snapshot assigned into a store is held by reference and stays frozen', () => {
    const store = createClassyStore({
      todos: [{id: 1, done: false}] as Todo[],
      selected: null as Todo | null,
    });
    const row = snapshot(store).todos[0] as Todo;

    store.selected = row;

    expect(store.selected).toBe(row);
    expect(Object.isFrozen(store.selected)).toBe(true);
    // The store reuses it as-is, so structural sharing is kept.
    expect(snapshot(store).selected).toBe(row);
    expect(() => {
      (store.selected as Todo).done = true;
    }).toThrow(TypeError);
    expect(store.todos[0].done).toBe(false);
  });

  test('replacing a stored snapshot notifies and later edits to its source do not leak in', () => {
    const store = createClassyStore({
      draft: {text: 'a'},
      saved: null as {text: string} | null,
    });
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    store.saved = snapshot(store).draft as {text: string};
    expect(listener).toHaveBeenCalledTimes(1);

    store.draft.text = 'b';
    expect(store.saved?.text).toBe('a');
    expect(snapshot(store).saved?.text).toBe('a');
  });

  test('a snapshot present in the initial state is not proxied', () => {
    const source = createClassyStore({config: {theme: 'dark'}});
    const config = snapshot(source).config;
    const store = createClassyStore({config});
    expect(store.config).toBe(config);
  });

  test('a tracked read handed back to a store is stored as its snapshot', () => {
    class Row {
      static [PROXYABLE] = true;
      done = false;
      constructor(readonly id: number) {}
    }
    const store = createClassyStore({
      plain: [{id: 1, done: false}] as Todo[],
      classes: [new Row(1)],
      selected: null as unknown,
    });
    const snap = snapshot(store);
    // What React's auto-tracked hook hands to a component.
    const tracked = createProxy(snap, new WeakMap(), new TrackedProxyCache());

    store.selected = tracked.plain[0];
    expect(store.selected).toBe(snap.plain[0]);

    store.selected = tracked.classes[0];
    expect(store.selected).toBe(snap.classes[0]);
  });
});

describe('identity helpers', () => {
  test('unwrap strips a store proxy and a tracking proxy, nothing else', () => {
    const raw = {row: {id: 1}};
    const store = createClassyStore(raw);
    const snap = snapshot(store);
    const tracked = createProxy(snap, new WeakMap(), new TrackedProxyCache());

    expect(unwrap(store)).toBe(raw);
    expect(unwrap(store.row)).toBe(raw.row);
    expect(unwrap(tracked.row)).toBe(snap.row);
    expect(unwrap(snap.row)).toBe(snap.row);
    expect(unwrap(raw.row)).toBe(raw.row);
    expect(unwrap(7)).toBe(7);
    expect(unwrap(null)).toBeNull();
  });

  test('identityOf is the same for the raw object, its proxy, snapshots and tracked reads', () => {
    const raw = {row: {id: 1}};
    const store = createClassyStore(raw);
    const first = snapshot(store);
    store.row.id = 2;
    const second = snapshot(store);
    const tracked = createProxy(second, new WeakMap(), new TrackedProxyCache());

    expect(first.row).not.toBe(second.row);
    for (const view of [
      raw.row,
      store.row,
      first.row,
      second.row,
      tracked.row,
    ]) {
      expect(identityOf(view)).toBe(raw.row);
    }
    expect(identityOf('key')).toBe('key');
    expect(Number.isNaN(identityOf(Number.NaN))).toBe(true);
  });
});

describe('PROXYABLE', () => {
  test('a class that opts in is reactive when nested, and keeps its prototype in snapshots', () => {
    class Todo {
      static [PROXYABLE] = true;
      done = false;
      constructor(public title: string) {}

      get label() {
        return `${this.done ? '[x]' : '[ ]'} ${this.title}`;
      }

      toggle() {
        this.done = !this.done;
      }
    }
    class Opaque {
      done = false;
    }
    const store = createClassyStore({
      todos: [new Todo('write')],
      opaque: new Opaque(),
    });
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    store.todos[0].toggle();
    expect(listener).toHaveBeenCalledTimes(1);
    const snap = snapshot(store);
    expect(snap.todos[0]).toBeInstanceOf(Todo);
    expect(snap.todos[0].label).toBe('[x] write');

    // A class that does not opt in stays an opaque value.
    store.opaque.done = true;
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('array snapshots', () => {
  test('a sparse array keeps its holes, later elements and length', () => {
    const items: unknown[] = [{id: 0}, 1];
    items[5] = {id: 5};
    items.length = 9;
    const store = createClassyStore({items});

    const snap = snapshot(store).items;

    expect(snap.length).toBe(9);
    expect(Object.keys(snap)).toEqual(['0', '1', '5']);
    expect(snap[5]).toEqual({id: 5});
    expect(Object.isFrozen(snap[0])).toBe(true);
    expect(2 in snap).toBe(false);
  });

  test('a trailing hole spanning billions of slots costs no length-sized scan', () => {
    const items: number[] = [1, 2];
    items.length = 2 ** 32 - 1;
    const store = createClassyStore({items});

    const started = performance.now();
    const snap = snapshot(store).items;

    expect(performance.now() - started).toBeLessThan(250);
    expect(snap.length).toBe(2 ** 32 - 1);
    expect(Object.keys(snap)).toEqual(['0', '1']);
  });
});
