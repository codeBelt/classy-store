import {describe, expect, test} from 'bun:test';
import {createProxy, isChanged} from 'proxy-compare';
import {TrackingReadMap} from './trackingReadMap';

describe('TrackingReadMap', () => {
  test('retains committed dependencies when a later render reuses a memoized value', () => {
    const committed = new WeakMap<object, unknown>();
    const source = Object.freeze({first: 1, second: 2});
    const firstReads = new TrackingReadMap(committed);
    const first = createProxy(source, firstReads);
    expect(first.first).toBe(1);
    firstReads.commit();
    const nextReads = new TrackingReadMap(committed);
    const next = createProxy(source, nextReads);
    expect(next.second).toBe(2);
    nextReads.commit();
    expect(isChanged(source, {first: 3, second: 2}, nextReads)).toBe(true);
    expect(isChanged(source, {first: 1, second: 3}, nextReads)).toBe(true);
    expect(isChanged(source, {first: 1, second: 2}, nextReads)).toBe(false);
  });

  test('does not publish reads from an abandoned render', () => {
    const committed = new WeakMap<object, unknown>();
    const source = Object.freeze({first: 1, second: 2});
    const originalReads = new TrackingReadMap(committed);
    expect(createProxy(source, originalReads).first).toBe(1);
    originalReads.commit();
    const abandonedReads = new TrackingReadMap(committed);
    expect(createProxy(source, abandonedReads).second).toBe(2);
    const nextReads = new TrackingReadMap(committed);
    expect(isChanged(source, {first: 1, second: 3}, originalReads)).toBe(false);
    expect(isChanged(source, {first: 1, second: 3}, nextReads)).toBe(false);
    expect(isChanged(source, {first: 2, second: 2}, nextReads)).toBe(true);
  });

  test('does not publish a dependency removed before commit', () => {
    const committed = new WeakMap<object, unknown>();
    const source = Object.freeze({value: 1});
    const reads = new TrackingReadMap(committed);
    expect(createProxy(source, reads).value).toBe(1);
    reads.delete(source);
    reads.commit();
    expect(committed.has(source)).toBe(false);
  });
});
