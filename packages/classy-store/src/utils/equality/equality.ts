import {getArrayIndex, isPlainObject} from '../internal/internal';

function remainingIndices(array: readonly unknown[], after: number): string[] {
  return Object.getOwnPropertyNames(array).filter((key) => {
    const index = getArrayIndex(key);
    return index !== undefined && index > after;
  });
}

/**
 * Shallow-equal comparison: the two values, or their contents one level deep.
 * Useful as a custom `isEqual` for `useClassyStore` selectors that return a new
 * object, array, or collection on each call.
 *
 * - Primitives and identical references compared with `Object.is`.
 * - Values with different prototypes are never equal.
 * - Arrays: length, occupied indices, and element-wise `Object.is`.
 * - `Date`: the same instant. `Map` and `Set`: same size and same members,
 *   with map values compared by `Object.is`.
 * - Other objects: key count + value-wise `Object.is` over enumerable string
 *   keys. An object with no such keys is equal to another only when both are
 *   plain records, since its state cannot be seen from here.
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== 'object' ||
    a === null ||
    typeof b !== 'object' ||
    b === null
  ) {
    return false;
  }
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  if (a instanceof Date) {
    return b instanceof Date && Object.is(a.getTime(), b.getTime());
  }
  if (a instanceof Map) {
    if (!(b instanceof Map) || a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !Object.is(value, b.get(key))) return false;
    }
    return true;
  }
  if (a instanceof Set) {
    if (!(b instanceof Set) || a.size !== b.size) return false;
    for (const value of a) {
      if (!b.has(value)) return false;
    }
    return true;
  }

  let keysA: string[];
  let keysB: string[];
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    let i = 0;
    for (; i < a.length; i++) {
      const present = Object.hasOwn(a, i);
      if (present !== Object.hasOwn(b, i)) return false;
      if (!present) break;
      if (!Object.is(a[i], b[i])) return false;
    }
    if (i === a.length) return true;
    // Both have a hole here. Compare only populated suffix indices so a
    // trailing hole spanning billions of slots costs no length-sized scan.
    keysA = remainingIndices(a, i);
    keysB = remainingIndices(b, i);
  } else {
    if (Array.isArray(b)) return false;
    keysA = Object.keys(a);
    keysB = Object.keys(b);
    // A RegExp, an Error, a Promise: nothing here says whether they match.
    if (!keysA.length && !keysB.length) return isPlainObject(a);
  }
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (
      !Object.hasOwn(b, key) ||
      !Object.is(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      )
    ) {
      return false;
    }
  }
  return true;
}
