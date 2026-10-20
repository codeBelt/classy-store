import {describe, expect, spyOn, test} from 'bun:test';
import {createProxy, isChanged} from 'proxy-compare';
import {SnapshotTargetCache} from './snapshotTargetCache';

describe('SnapshotTargetCache', () => {
  test('scans a shared frozen list once across hundreds of independent readers', () => {
    const items = Object.freeze(
      Array.from({length: 1000}, (_, index) => Object.freeze({value: index})),
    );
    const source = Object.freeze({items});
    const cache = new SnapshotTargetCache();
    const descriptors = Object.getOwnPropertyDescriptors;
    let listScans = 0;
    const descriptorSpy = spyOn(
      Object,
      'getOwnPropertyDescriptors',
    ).mockImplementation((target) => {
      if (target === items) listScans += 1;
      return descriptors(target);
    });
    try {
      for (let index = 0; index < 1000; index += 1) {
        const reads = new WeakMap();
        const proxyCache = new WeakMap();
        const tracked = createProxy(source, reads, proxyCache, cache);
        expect(tracked.items[index].value).toBe(index);
        expect(createProxy(source, reads, proxyCache, cache)).toBe(tracked);
      }
      expect(listScans).toBe(1);
    } finally {
      descriptorSpy.mockRestore();
    }
  });

  test('keeps reader dependencies separate while sharing backing copies', () => {
    const source = Object.freeze({first: 1, second: 2});
    const cache = new SnapshotTargetCache();
    const firstReads = new WeakMap();
    const secondReads = new WeakMap();
    const first = createProxy(source, firstReads, new WeakMap(), cache);
    const second = createProxy(source, secondReads, new WeakMap(), cache);
    expect(first.first).toBe(1);
    expect(second.second).toBe(2);
    const next = Object.freeze({first: 3, second: 2});
    expect(isChanged(source, next, firstReads)).toBe(true);
    expect(isChanged(source, next, secondReads)).toBe(false);
  });

  test('protects both the initial and cached copies against reflective mutation', () => {
    const source = Object.freeze({nested: Object.freeze({value: 1})});
    const cache = new SnapshotTargetCache();
    const first = createProxy(source, new WeakMap(), new WeakMap(), cache);
    const second = createProxy(source, new WeakMap(), new WeakMap(), cache);
    for (const tracked of [first, second]) {
      expect(
        Reflect.defineProperty(tracked, 'nested', {value: {value: 2}}),
      ).toBe(false);
      expect(Reflect.setPrototypeOf(tracked, null)).toBe(false);
      expect(Reflect.preventExtensions(tracked)).toBe(false);
      expect(tracked.nested.value).toBe(1);
      expect(Reflect.set(tracked.nested, 'value', 2)).toBe(false);
      expect(Reflect.deleteProperty(tracked.nested, 'value')).toBe(false);
    }
    expect(source.nested.value).toBe(1);
  });

  test('rechecks mutable getter results when their descriptors change', () => {
    const mutable = {nested: {value: 1}};
    const source = Object.freeze({
      get data() {
        return mutable;
      },
    });
    const cache = new SnapshotTargetCache();
    const tracked = createProxy(source, new WeakMap(), new WeakMap(), cache);
    expect(tracked.data.nested.value).toBe(1);
    expect(cache.has(mutable)).toBe(false);
    Object.freeze(mutable);
    expect(tracked.data.nested.value).toBe(1);
    expect(cache.has(mutable)).toBe(true);
    expect(
      Reflect.defineProperty(tracked.data, 'nested', {value: {value: 2}}),
    ).toBe(false);
  });
});
