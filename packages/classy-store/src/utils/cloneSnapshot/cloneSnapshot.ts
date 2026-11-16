import {originalSnapshotAccessor} from '../../storeRuntime';
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
      const original = originalSnapshotAccessor(descriptor.get);
      if (original !== null) {
        Object.defineProperty(clone, key, {
          ...(original ?? descriptor),
          configurable: true,
        });
      }
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
