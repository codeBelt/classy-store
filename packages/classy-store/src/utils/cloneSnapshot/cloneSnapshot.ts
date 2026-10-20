import {isMemoizedSnapshotGetter} from '../../snapshot/snapshot';
import {canProxy} from '../internal/internal';

/** Restore proxyable snapshot data as mutable objects, preserving prototypes. */
export function cloneSnapshotValue(
  value: unknown,
  clones: WeakMap<object, object>,
): unknown {
  // Match snapshot leaf semantics: opaque values and functions pass through.
  if (!canProxy(value)) return value;
  const cached = clones.get(value);
  if (cached) return cached;

  const clone: object = Array.isArray(value)
    ? Object.setPrototypeOf(
        new Array(value.length),
        Object.getPrototypeOf(value),
      )
    : Object.create(Object.getPrototypeOf(value));
  clones.set(value, clone);

  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if (!('value' in descriptor)) {
      // Snapshot getters cache frozen values; use the original prototype getters.
      if (isMemoizedSnapshotGetter(descriptor.get)) {
        continue;
      }
      // Custom persistence merges and transforms can supply their own accessors.
      Object.defineProperty(clone, key, {...descriptor, configurable: true});
      continue;
    }
    Object.defineProperty(clone, key, {
      value: cloneSnapshotValue(descriptor.value, clones),
      enumerable: descriptor.enumerable,
      configurable: true,
      writable: true,
    });
  }

  return clone;
}
