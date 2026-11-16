import {describe, expect, mock, test} from 'bun:test';
import {snapshot} from '../snapshot/snapshot';
import {createClassyStore, getInternal, subscribe} from './core';

describe('shared proxy ownership', () => {
  test('a retained row still notifies once after reverse, and stops after removal', async () => {
    const store = createClassyStore({rows: [{count: 1}, {count: 2}]});
    const retained = store.rows[1];
    const original = snapshot(store);
    store.rows.reverse();
    await Promise.resolve();
    const sync = mock(() => {});
    const batched = mock(() => {});
    subscribe(store, sync, {sync: true});
    subscribe(store, batched);

    retained.count++;
    expect(store.rows[0]).toBe(retained);
    expect(snapshot(store).rows[0].count).toBe(3);
    expect(original.rows[1].count).toBe(2);
    expect(sync).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(batched).toHaveBeenCalledTimes(1);

    store.rows.shift();
    const removed = snapshot(store);
    const calls = sync.mock.calls.length;
    retained.count++;
    expect(sync).toHaveBeenCalledTimes(calls);
    expect(snapshot(store)).toBe(removed);
  });

  test('an edit reaches every alias, including a path never read through the proxy', () => {
    const record = {count: 1};
    const store = createClassyStore({
      left: {record},
      right: {record},
      unchanged: {label: 'stable'},
      get total() {
        return this.left.record.count + this.right.record.count;
      },
    });
    const initial = snapshot(store);
    const retained = store.left.record;
    const changed = mock(() => {});
    subscribe(store, changed, {sync: true});
    retained.count++;

    const current = snapshot(store);
    expect(current.left.record).toBe(current.right.record);
    expect(current.right.record.count).toBe(2);
    expect(current.unchanged).toBe(initial.unchanged);
    expect(initial.right.record.count).toBe(1);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(store.total).toBe(4);

    store.left.record = {count: 10};
    retained.count++;
    expect(store.right.record).toBe(retained);
    expect(store.total).toBe(13);
    expect(snapshot(store).right.record.count).toBe(3);
  });

  test('read-only shared data releases collected request owners without a child mutation', async () => {
    const config = {currency: 'USD'};
    const retained = createClassyStore({config});
    const parents = getInternal(retained.config).parents;
    for (let i = 0; i < 1000; i++)
      snapshot(createClassyStore({config, request: i}));
    for (let i = 0; i < 30 && parents.size > 1; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      Bun.gc(true);
    }
    expect(parents.size).toBe(1);
    expect(retained.config.currency).toBe('USD');
  });

  test('a nested child follows its current sibling scope and detaches cleanly', () => {
    const from = createClassyStore<{box?: {row: {n: number}}; other: number}>({
      box: {row: {n: 0}},
      other: 0,
    });
    const to = createClassyStore<{box?: {row: {n: number}}; other: number}>({
      other: 0,
    });
    const box = from.box;
    if (!box) throw new Error('Expected initial box');
    const row = box.row;
    const changed = mock(() => {});
    const stop = subscribe(row, changed, {sync: true});
    to.box = box;
    delete from.box;
    changed.mockClear();
    from.other++;
    expect(changed).not.toHaveBeenCalled();
    to.other++;
    expect(changed).toHaveBeenCalledTimes(1);
    row.n++;
    expect(changed).toHaveBeenCalledTimes(2);
    stop();
    row.n++;
    expect(changed).toHaveBeenCalledTimes(2);
  });

  test('promoting a child to a root narrows existing descendant subscriptions', async () => {
    const outer = createClassyStore({editor: {row: {n: 0}, tab: 0}, other: 0});
    const changed = mock(() => {});
    const stop = subscribe(outer.editor.row, changed);
    outer.other++;
    await Promise.resolve();
    expect(changed).toHaveBeenCalledTimes(1);
    const editor = createClassyStore(outer.editor);
    outer.other++;
    await Promise.resolve();
    expect(changed).toHaveBeenCalledTimes(1);
    editor.tab++;
    editor.row.n++;
    await Promise.resolve();
    expect(changed).toHaveBeenCalledTimes(2);
    stop();
  });

  test('a retained child subscription keeps its notification scope alive', async () => {
    const changed = mock(() => {});
    const child = createClassyStore({child: {count: 1}}).child;
    subscribe(child, changed, {sync: true});
    await new Promise((resolve) => setTimeout(resolve, 0));
    Bun.gc(true);
    child.count++;
    expect(changed).toHaveBeenCalledTimes(1);
  });

  test('shared roots deliver each subscription once and keep independent registrations', async () => {
    const child = {count: 1};
    const one = createClassyStore({child, label: 'one'});
    const two = createClassyStore({child, label: 'two'});
    const shared = mock(() => {});
    const independent = mock(() => {});
    const stop = subscribe(one.child, shared);
    subscribe(one, independent);
    subscribe(two, independent);
    one.child.count++;
    await Promise.resolve();
    expect(shared).toHaveBeenCalledTimes(1);
    expect(independent).toHaveBeenCalledTimes(2);
    stop();
    two.label = 'second';
    await Promise.resolve();
    expect(shared).toHaveBeenCalledTimes(1);
    expect(independent).toHaveBeenCalledTimes(3);
  });

  test('a detached list refreshes shared rows when read again', () => {
    const store = createClassyStore({rows: [{n: 1}, {n: 2}]});
    const previousRows = store.rows;
    const previousSnapshot = snapshot(previousRows);
    store.rows = previousRows.filter((row) => row.n === 1);
    store.rows[0].n = 3;
    expect(snapshot(previousRows)[0].n).toBe(3);
    expect(previousSnapshot[0].n).toBe(1);
    const rootChanged = mock(() => {});
    const listChanged = mock(() => {});
    subscribe(store, rootChanged, {sync: true});
    subscribe(previousRows, listChanged, {sync: true});
    previousRows[1].n = 4;
    expect(listChanged).toHaveBeenCalledTimes(1);
    expect(rootChanged).not.toHaveBeenCalled();
  });

  test('filtering repeatedly keeps a single proxy and bounded work per scalar write', () => {
    let reads = 0;
    const row = new Proxy(
      {count: 0},
      {
        get(target, key, receiver) {
          if (key === 'count') reads++;
          return Reflect.get(target, key, receiver);
        },
      },
    );
    const store = createClassyStore({rows: [row]});
    const retained = store.rows[0];
    retained.count = 1;
    const initialReads = reads;
    for (let i = 0; i < 100; i++) store.rows = store.rows.filter(() => true);
    const changed = mock(() => {});
    subscribe(store, changed, {sync: true});
    expect(getInternal(retained).parents.size).toBe(1);
    reads = 0;
    store.rows[0].count = 2;
    expect(reads).toBe(initialReads);
    expect(store.rows[0]).toBe(retained);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(snapshot(store).rows[0].count).toBe(2);
  });
});

describe('createClassyStore memory ownership', () => {
  test.each([
    {description: 'replacement', remove: 'replace'},
    {description: 'deletion', remove: 'delete'},
  ])('disconnects retired subtrees after $description', ({remove}) => {
    const store = createClassyStore<{section?: {row: {value: number}}}>({
      section: {row: {value: 0}},
    });
    const retiredSection = store.section;
    if (!retiredSection) throw new Error('Expected initial section');
    const retiredRow = retiredSection.row;
    let rootNotifications = 0;
    const stopRoot = subscribe(store, () => rootNotifications++, {sync: true});

    if (remove === 'replace') store.section = {row: {value: 10}};
    else delete store.section;

    expect(rootNotifications).toBe(1);
    expect(getInternal(retiredSection).parents.size).toBe(0);
    expect(
      getInternal(retiredRow).parents.get(
        getInternal(retiredSection).reference,
      ),
    ).toBe(1);
    let retiredNotifications = 0;
    const stopRetired = subscribe(
      retiredSection,
      () => retiredNotifications++,
      {
        sync: true,
      },
    );
    retiredRow.value++;
    expect(retiredNotifications).toBe(1);
    expect(rootNotifications).toBe(1);
    stopRetired();
    stopRoot();
  });

  test('array truncation disconnects only removed index subtrees', () => {
    const store = createClassyStore({
      rows: Array.from({length: 4}, (_, index) => ({nested: {value: index}})),
    });
    const rows = store.rows;
    const first = rows[0];
    const removed = rows[3];
    const removedNested = removed.nested;
    let rootNotifications = 0;
    const stopRoot = subscribe(store, () => rootNotifications++, {sync: true});

    rows.length = 2;

    expect([...getInternal(rows).childInternals.keys()]).toEqual(['0', '1']);
    expect(getInternal(first).parents.get(getInternal(rows).reference)).toBe(1);
    expect(getInternal(removed).parents.size).toBe(0);
    expect(
      getInternal(removedNested).parents.get(getInternal(removed).reference),
    ).toBe(1);
    removedNested.value++;
    expect(rootNotifications).toBe(1);
    first.nested.value++;
    expect(rootNotifications).toBe(2);
    stopRoot();
  });

  test('repeated growth and truncation releases every removed child entry', () => {
    const store = createClassyStore({rows: [] as {value: number}[]});
    const rows = store.rows;
    for (let cycle = 0; cycle < 20; cycle++) {
      rows.push(...Array.from({length: 32}, (_, index) => ({value: index})));
      for (const row of rows) expect(row.value).toBeGreaterThanOrEqual(0);
      expect(getInternal(rows).childInternals.size).toBe(32);
      rows.length = 0;
      expect(getInternal(rows).childInternals.size).toBe(0);
    }
  });

  test('truncation preserves object-valued properties that are not array indices', () => {
    const rows = createClassyStore(
      Object.assign([{value: 0}, {value: 1}], {
        '01': {value: 2},
        '1.0': {value: 3},
        '4294967295': {value: 4},
      }),
    );
    const index = rows[1];
    const leadingZero = rows['01'];
    const decimal = rows['1.0'];
    const maximumLength = rows['4294967295'];

    Reflect.set(rows, 'length', '1');

    expect(rows.length).toBe(1);
    expect(getInternal(index).parents.size).toBe(0);
    expect(
      getInternal(leadingZero).parents.get(getInternal(rows).reference),
    ).toBe(1);
    expect(getInternal(decimal).parents.get(getInternal(rows).reference)).toBe(
      1,
    );
    expect(
      getInternal(maximumLength).parents.get(getInternal(rows).reference),
    ).toBe(1);
    expect([...getInternal(rows).childInternals.keys()].sort()).toEqual([
      '0',
      '01',
      '1.0',
      '4294967295',
    ]);
  });

  test('invalid array lengths leave existing child ownership intact', () => {
    const rows = createClassyStore([{value: 0}, {value: 1}]);
    const second = rows[1];
    let notifications = 0;
    const stop = subscribe(rows, () => notifications++, {sync: true});

    expect(() => Reflect.set(rows, 'length', -1)).toThrow(RangeError);

    expect(rows.length).toBe(2);
    expect(rows[1]).toBe(second);
    expect(getInternal(second).parents.get(getInternal(rows).reference)).toBe(
      1,
    );
    expect(notifications).toBe(0);
    second.value++;
    expect(notifications).toBe(1);
    stop();
  });

  test.each([
    {description: 'a rejected write', remove: 'replace'},
    {description: 'a rejected deletion', remove: 'delete'},
  ])('preserves the child cache after $description', ({remove}) => {
    const target = {section: {value: 0}};
    Object.defineProperty(target, 'section', {
      writable: false,
      configurable: true,
    });
    const store = createClassyStore(target);
    const section = store.section;
    if (remove === 'delete') {
      Object.defineProperty(target, 'section', {
        writable: true,
        configurable: false,
      });
    }
    let notifications = 0;
    const stop = subscribe(store, () => notifications++, {sync: true});

    if (remove === 'replace') Reflect.set(store, 'section', {value: 1});
    else expect(Reflect.deleteProperty(store, 'section')).toBe(false);

    expect(store.section).toBe(section);
    expect(getInternal(store).childInternals.get('section')?.proxy).toBe(
      section,
    );
    expect(getInternal(section).parents.get(getInternal(store).reference)).toBe(
      1,
    );
    expect(notifications).toBe(0);
    section.value++;
    expect(notifications).toBe(1);
    stop();
  });
});
