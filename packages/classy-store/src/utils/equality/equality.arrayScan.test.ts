import {describe, expect, it} from 'bun:test';
import {shallowEqual} from '../../index';

describe('shallowEqual() — how much of an array it reads', () => {
  it('compares equal dense arrays without enumerating their keys', () => {
    let scans = 0;
    const observed = new Proxy([1, 2, 3], {
      ownKeys(target) {
        scans++;
        return Reflect.ownKeys(target);
      },
    });

    expect(shallowEqual(observed, [1, 2, 3])).toBe(true);
    expect(scans).toBe(0);
  });

  it('stops walking a sparse array slot by slot at its first hole', () => {
    const first = new Array<number>(100_000);
    const second = new Array<number>(100_000);
    first[0] = 1;
    second[0] = 1;
    first[99_999] = 2;
    second[99_999] = 2;
    const probed: (string | symbol)[] = [];
    const observed = new Proxy(first, {
      getOwnPropertyDescriptor(target, key) {
        probed.push(key);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      has(target, key) {
        probed.push(key);
        return Reflect.has(target, key);
      },
    });

    expect(shallowEqual(observed, second)).toBe(true);
    // The occupied slot, then the hole. The far end is found by its key.
    expect(probed).toEqual(['0', '1']);
    second[99_999] = 3;
    expect(shallowEqual(observed, second)).toBe(false);
  });
});
