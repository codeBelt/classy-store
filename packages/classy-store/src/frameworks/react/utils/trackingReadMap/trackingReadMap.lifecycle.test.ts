import {describe, expect, test} from 'bun:test';
import {createProxy, isChanged} from 'proxy-compare';
import {TrackingReadMap} from './trackingReadMap';

describe('TrackingReadMap lifecycle', () => {
  test('isolates nested reads from an abandoned render after another render commits', () => {
    const committed = new WeakMap<object, unknown>();
    const nested = Object.freeze({first: 1, second: 2, third: 3});
    const source = Object.freeze({nested});
    const initialReads = new TrackingReadMap(committed);
    expect(createProxy(source, initialReads).nested.first).toBe(1);
    initialReads.commit();

    const abandonedReads = new TrackingReadMap(committed);
    const abandoned = createProxy(source, abandonedReads);
    expect(abandoned.nested.second).toBe(2);
    const nextReads = new TrackingReadMap(committed);
    expect(createProxy(source, nextReads).nested.first).toBe(1);
    nextReads.commit();
    // Suspended work may continue reading after a different render committed.
    expect(abandoned.nested.third).toBe(3);

    const followingReads = new TrackingReadMap(committed);
    expect(
      isChanged(
        source,
        {nested: {first: 1, second: 20, third: 30}},
        followingReads,
      ),
    ).toBe(false);
    expect(
      isChanged(
        source,
        {nested: {first: 10, second: 2, third: 3}},
        followingReads,
      ),
    ).toBe(true);
  });

  test('keeps late reads on committed objects visible to later memoized renders', () => {
    const committed = new WeakMap<object, unknown>();
    const source = Object.freeze({renderValue: 1, effectValue: 2});
    const reads = new TrackingReadMap(committed);
    const state = createProxy(source, reads);
    expect(state.renderValue).toBe(1);
    reads.commit();
    expect(state.effectValue).toBe(2);

    const nextReads = new TrackingReadMap(committed);
    expect(isChanged(source, {renderValue: 1, effectValue: 3}, nextReads)).toBe(
      true,
    );
    expect(isChanged(source, {renderValue: 2, effectValue: 2}, nextReads)).toBe(
      true,
    );
    expect(isChanged(source, {renderValue: 1, effectValue: 2}, nextReads)).toBe(
      false,
    );
  });

  test('publishes newly read objects on a later commit without reviving deleted entries', () => {
    const committed = new WeakMap<object, unknown>();
    const first = Object.freeze({value: 1});
    const second = Object.freeze({value: 2});
    const discarded = Object.freeze({value: 3});
    const reads = new TrackingReadMap(committed);
    expect(createProxy(first, reads).value).toBe(1);
    reads.commit();
    expect(createProxy(second, reads).value).toBe(2);
    expect(createProxy(discarded, reads).value).toBe(3);
    reads.delete(discarded);
    reads.commit();
    reads.commit();

    const nextReads = new TrackingReadMap(committed);
    expect(isChanged(first, {value: 1, ignored: true}, nextReads)).toBe(false);
    expect(isChanged(second, {value: 2, ignored: true}, nextReads)).toBe(false);
    expect(committed.has(discarded)).toBe(false);
  });
});
