import {describe, expect, test} from 'bun:test';
import {createClassyStore, getInternal, subscribe} from './core';

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
    expect(getInternal(retiredSection).parent).toBeNull();
    expect(getInternal(retiredRow).parent).toBe(getInternal(retiredSection));
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

    expect(getInternal(rows).childInternals.size).toBe(1);
    expect(getInternal(rows).childProxies.size).toBe(1);
    expect(getInternal(first).parent).toBe(getInternal(rows));
    expect(getInternal(removed).parent).toBeNull();
    expect(getInternal(removedNested).parent).toBe(getInternal(removed));
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
      expect(getInternal(rows).childProxies.size).toBe(0);
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
    expect(getInternal(index).parent).toBeNull();
    expect(getInternal(leadingZero).parent).toBe(getInternal(rows));
    expect(getInternal(decimal).parent).toBe(getInternal(rows));
    expect(getInternal(maximumLength).parent).toBe(getInternal(rows));
    expect(getInternal(rows).childInternals.size).toBe(3);
  });

  test('invalid array lengths leave existing child ownership intact', () => {
    const rows = createClassyStore([{value: 0}, {value: 1}]);
    const second = rows[1];
    let notifications = 0;
    const stop = subscribe(rows, () => notifications++, {sync: true});

    expect(() => Reflect.set(rows, 'length', -1)).toThrow(RangeError);

    expect(rows.length).toBe(2);
    expect(rows[1]).toBe(second);
    expect(getInternal(second).parent).toBe(getInternal(rows));
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
    expect(getInternal(store).childProxies.get('section')).toBe(section);
    expect(getInternal(section).parent).toBe(getInternal(store));
    expect(notifications).toBe(0);
    section.value++;
    expect(notifications).toBe(1);
    stop();
  });
});
