import {describe, expect, mock, test} from 'bun:test';
import {snapshot} from '../snapshot/snapshot';
import {createClassyStore, getInternal, getVersion, subscribe} from './core';

describe('createClassyStore subtree lifecycle', () => {
  test('retired descendants stop notifying and retaining their former root', () => {
    const store = createClassyStore({section: {row: {value: 1}}});
    const section = store.section;
    const row = section.row;
    store.section = {row: {value: 2}};
    const rootListener = mock(() => {});
    const retiredListener = mock(() => {});
    const unsubscribeRoot = subscribe(store, rootListener, {sync: true});
    const unsubscribeRetired = subscribe(section, retiredListener, {
      sync: true,
    });
    const rootVersion = getVersion(store);

    row.value = 3;

    expect(rootListener).not.toHaveBeenCalled();
    expect(retiredListener).toHaveBeenCalledTimes(1);
    expect(getVersion(store)).toBe(rootVersion);
    expect(getInternal(section).parent).toBeNull();
    expect(getInternal(row).parent).toBe(getInternal(section));
    expect(snapshot(section).row.value).toBe(3);
    expect(store.section.row.value).toBe(2);
    unsubscribeRoot();
    unsubscribeRetired();
  });

  test('truncated slots create fresh proxies when the array grows again', () => {
    const store = createClassyStore({rows: [{value: 1}, {value: 2}]});
    const firstRow = store.rows[0];
    const retiredRow = store.rows[1];

    store.rows.length = 1;
    store.rows.push({value: 3});

    expect(store.rows[0]).toBe(firstRow);
    expect(store.rows[1]).not.toBe(retiredRow);
    expect(store.rows[1].value).toBe(3);
    expect(snapshot(store).rows).toEqual([{value: 1}, {value: 3}]);
    expect(getInternal(retiredRow).parent).toBeNull();
  });

  test('partial array truncation prunes removed children and reports the actual mutation', () => {
    const rawRows = [{value: 0}, {value: 1}, {value: 2}, {value: 3}];
    Object.defineProperty(rawRows, '1', {configurable: false});
    const store = createClassyStore({rows: rawRows});
    const retainedRow = store.rows[1];
    const retiredRow = store.rows[3];
    const listener = mock(() => {});
    const unsubscribe = subscribe(store, listener, {sync: true});

    expect(Reflect.set(store.rows, 'length', 0)).toBe(false);

    expect(store.rows.length).toBe(2);
    expect(store.rows[1]).toBe(retainedRow);
    expect(getInternal(retiredRow).parent).toBeNull();
    expect(getInternal(store.rows).childProxies.has('3')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot(store).rows).toEqual([{value: 0}, {value: 1}]);
    unsubscribe();
  });
});
