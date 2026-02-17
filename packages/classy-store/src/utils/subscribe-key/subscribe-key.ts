import {subscribe} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import type {Snapshot} from '../../types';

/**
 * Subscribe to changes on a single property of a store proxy.
 *
 * Wraps `subscribe()` + `snapshot()` and compares `snapshot()[key]` with the
 * previous value via `Object.is()`. The callback fires only when the watched
 * property actually changes.
 *
 * @param proxyStore - A reactive proxy created by `createClassyStore()`.
 * @param key - The property key to watch.
 * @param callback - Called with `(value, previousValue)` when the property changes.
 * @returns An unsubscribe function.
 */
export function subscribeKey<
  T extends object,
  K extends keyof T & keyof Snapshot<T>,
>(
  proxyStore: T,
  key: K,
  callback: (value: Snapshot<T>[K], previousValue: Snapshot<T>[K]) => void,
): () => void {
  let previousValue = snapshot(proxyStore)[key];

  return subscribe(proxyStore, () => {
    const snap = snapshot(proxyStore);
    const currentValue = snap[key];

    if (!Object.is(currentValue, previousValue)) {
      const prev = previousValue;
      previousValue = currentValue;
      callback(currentValue, prev);
    }
  });
}
