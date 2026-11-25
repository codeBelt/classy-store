import {describe, expect, mock, test} from 'bun:test';
import {reactiveMap, reactiveSet} from '../collections/collections';
import {snapshot} from '../snapshot/snapshot';
import {createClassyStore, getVersion, subscribe} from './core';

type Config = {readonly rate: number; readonly nested: {limit: number}};

const frozenConfig = (rate = 1): Config =>
  Object.freeze({rate, nested: {limit: 10}});

describe('a frozen object held in a store', () => {
  test('is returned as itself, and its contents read normally', () => {
    const config = frozenConfig();
    const store = createClassyStore({config});

    expect(store.config).toBe(config);
    expect(store.config.rate).toBe(1);
    expect(store.config.nested).toBe(config.nested);
    expect(store.config.nested.limit).toBe(10);
  });

  test('a frozen array is returned as itself, with its own elements', () => {
    const rows = Object.freeze([{id: 1}, {id: 2}]);
    const store = createClassyStore({rows});

    expect(store.rows).toBe(rows);
    expect(store.rows[1]).toBe(rows[1]);
    expect(store.rows.map((row) => row.id)).toEqual([1, 2]);
  });

  test('a snapshot keeps it by reference', () => {
    const config = frozenConfig();
    const store = createClassyStore({config, count: 0});

    const first = snapshot(store);
    store.count++;
    const second = snapshot(store);

    expect(first.config).toBe(config);
    expect(second.config).toBe(config);
  });

  test('deeply frozen data assigned later is stored and read as it is', () => {
    const data = Object.freeze({
      user: Object.freeze({name: 'Ada', tags: Object.freeze(['admin'])}),
    });
    const store = createClassyStore<{data: typeof data | null}>({data: null});
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    store.data = data;

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.data).toBe(data);
    expect(store.data?.user.tags[0]).toBe('admin');
    expect(snapshot(store).data).toBe(data);
  });

  test('replacing it notifies once; assigning the same object again does not', () => {
    const first = frozenConfig(1);
    const second = frozenConfig(2);
    const store = createClassyStore({config: first});
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    store.config = second;
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store).config).toBe(second);

    const version = getVersion(store);
    store.config = second;
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getVersion(store)).toBe(version);
  });

  test('writing to it throws and notifies no one', () => {
    const store = createClassyStore({config: frozenConfig()});
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    expect(() => {
      (store.config as {rate: number}).rate = 2;
    }).toThrow(TypeError);

    expect(store.config.rate).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });

  test('an object inside it is not tracked: replace the frozen object to update', () => {
    const store = createClassyStore({config: frozenConfig()});
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});
    const before = snapshot(store);

    // Object.freeze is shallow, so this write succeeds, but the store never
    // sees it: the nested object was handed out as itself, not as a proxy.
    store.config.nested.limit = 99;

    expect(listener).not.toHaveBeenCalled();
    expect(snapshot(store)).toBe(before);

    store.config = Object.freeze({rate: 1, nested: {limit: 99}});
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store).config.nested.limit).toBe(99);
  });

  test('a getter that reads it recomputes when it is replaced', () => {
    const store = createClassyStore({
      base: 10,
      config: frozenConfig(2),
      get total() {
        return this.base * this.config.rate;
      },
    });
    expect(store.total).toBe(20);

    store.config = frozenConfig(3);

    expect(store.total).toBe(30);
    expect(snapshot(store).total).toBe(30);
  });

  test('it can replace a reactive object, and be replaced by one', () => {
    const store = createClassyStore<{slot: {label: string}}>({
      slot: {label: 'reactive'},
    });
    const reactive = store.slot;
    const frozen = Object.freeze({label: 'frozen'});
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    store.slot = frozen;
    expect(store.slot).toBe(frozen);
    expect(listener).toHaveBeenCalledTimes(1);

    // The object it replaced no longer belongs to the store.
    reactive.label = 'edited';
    expect(listener).toHaveBeenCalledTimes(1);

    store.slot = {label: 'reactive again'};
    store.slot.label = 'tracked';
    expect(listener).toHaveBeenCalledTimes(3);
    expect(snapshot(store).slot.label).toBe('tracked');
  });

  test('reactive collections keep it by reference as a value and as a member', () => {
    const member = Object.freeze({id: 1, nested: {note: 'x'}});
    const store = createClassyStore({
      byKey: reactiveMap<string, typeof member>(),
      members: reactiveSet<typeof member>(),
    });

    store.byKey.set('first', member);
    store.members.add(member);

    expect(store.byKey.get('first')).toBe(member);
    expect(store.byKey.get('first')?.nested.note).toBe('x');
    expect(store.members.has(member)).toBe(true);
    expect([...store.members][0]).toBe(member);
    expect(snapshot(store).byKey.get('first')).toBe(member);
  });

  test('whether it is frozen is worked out once, not on every read', () => {
    // Object.isFrozen asks a Proxy whether it is extensible, so count that.
    let checks = 0;
    const rows = new Proxy(Object.freeze([{id: 1}]), {
      isExtensible(target) {
        checks++;
        return Reflect.isExtensible(target);
      },
    });
    const store = createClassyStore({rows});
    const afterCreation = checks;

    expect(store.rows).toBe(rows);
    expect(store.rows[0].id).toBe(1);
    expect(store.rows.length).toBe(1);

    expect(afterCreation).toBeGreaterThan(0);
    expect(checks).toBe(afterCreation);
  });
});

describe('a frozen store root', () => {
  test('reads return its own values, and writes throw', () => {
    const nested = {limit: 10};
    const store = createClassyStore(Object.freeze({count: 1, nested}));

    expect(store.count).toBe(1);
    expect(store.nested).toBe(nested);
    expect(snapshot(store)).toEqual({count: 1, nested: {limit: 10}});
    expect(() => {
      (store as {count: number}).count = 2;
    }).toThrow(TypeError);
  });
});

describe('a frozen object that holds another store', () => {
  test('a frozen root passes on the changes of a store embedded in it', () => {
    const editor = createClassyStore({text: 'a'});
    const app = createClassyStore(Object.freeze({editor, title: 'app'}));
    const listener = mock(() => {});
    subscribe(app, listener, {sync: true});

    editor.text = 'b';

    // The property already holds the store's proxy, so it stays connected.
    expect(app.editor).toBe(editor);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(app).editor).toEqual({text: 'b'});
    expect(Object.isFrozen(snapshot(app).editor)).toBe(true);
  });

  test('a frozen value assigned into a store is not searched for stores', () => {
    const editor = createClassyStore({text: 'a'});
    const outer = createClassyStore<{registry: {editor: typeof editor} | null}>(
      {registry: null},
    );
    outer.registry = Object.freeze({editor});
    const onOuter = mock(() => {});
    const onEditor = mock(() => {});
    subscribe(outer, onOuter, {sync: true});
    subscribe(editor, onEditor, {sync: true});

    editor.text = 'b';

    // The embedded store still works; the outer store does not follow it.
    expect(outer.registry?.editor).toBe(editor);
    expect(onEditor).toHaveBeenCalledTimes(1);
    expect(onOuter).not.toHaveBeenCalled();
  });

  test('a root frozen afterwards keeps passing them on', () => {
    const editor = createClassyStore({text: 'a'});
    const app = createClassyStore({editor, title: 'app'});
    const listener = mock(() => {});
    subscribe(app, listener, {sync: true});

    Object.freeze(app);
    editor.text = 'b';

    expect(app.editor).toBe(editor);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(app).editor).toEqual({text: 'b'});
  });
});

describe('a read-only property that holds an object', () => {
  test('returns the object itself while the other fields stay reactive', () => {
    const meta = {tag: 'fixed'};
    const source = {count: 0, items: [{id: 1}]};
    Object.defineProperty(source, 'meta', {value: meta, enumerable: true});
    const store = createClassyStore(
      source as typeof source & {readonly meta: {tag: string}},
    );
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    expect(store.meta).toBe(meta);
    expect(store.meta.tag).toBe('fixed');
    expect(snapshot(store).meta).toBe(meta);

    store.count++;
    store.items[0].id = 2;
    expect(listener).toHaveBeenCalledTimes(2);
    expect(snapshot(store).items[0].id).toBe(2);
  });
});

describe('freezing an object that is already in a store', () => {
  test('Object.freeze through the proxy leaves it readable', () => {
    const store = createClassyStore({config: {rate: 1, nested: {limit: 10}}});
    // The nested object is already a tracked child before the freeze.
    expect(store.config.nested.limit).toBe(10);
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    Object.freeze(store.config);

    expect(Object.isFrozen(store.config)).toBe(true);
    expect(store.config.rate).toBe(1);
    expect(store.config.nested.limit).toBe(10);
    expect(snapshot(store).config.nested.limit).toBe(10);
    expect(() => {
      store.config.rate = 2;
    }).toThrow(TypeError);
    expect(listener).not.toHaveBeenCalled();
  });

  test('Object.seal through the proxy keeps the object reactive', () => {
    const store = createClassyStore({config: {rate: 1, nested: {limit: 10}}});
    const nested = store.config.nested;
    const listener = mock(() => {});
    subscribe(store, listener, {sync: true});

    Object.seal(store.config);
    store.config.rate = 2;
    // A sealed property can still be reassigned, so its child stays connected:
    // a write through the proxy held from before the seal reaches the store.
    nested.limit = 20;

    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.config.nested).toBe(nested);
    expect(snapshot(store).config).toEqual({rate: 2, nested: {limit: 20}});
  });

  test('a property made read-only through the proxy returns its own value', () => {
    const store = createClassyStore({config: {rate: 1}, count: 0});
    const raw = store.config;
    expect(raw.rate).toBe(1);

    Object.defineProperty(store, 'config', {
      writable: false,
      configurable: false,
    });

    expect(store.config.rate).toBe(1);
    store.count++;
    expect(snapshot(store).count).toBe(1);
  });
});
