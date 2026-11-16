import {getArrayIndex} from '../internal/internal';

function remainingIndices(array: readonly unknown[], after: number): string[] {
  return Object.getOwnPropertyNames(array).filter((key) => {
    const index = getArrayIndex(key);
    return index !== undefined && index > after;
  });
}

/**
 * Shallow-equal comparison for objects and arrays.
 * Useful as a custom `isEqual` for `useClassyStore` selectors that return objects/arrays.
 *
 * - Primitives compared with `Object.is`.
 * - Arrays: length, occupied indices, and element-wise `Object.is`.
 * - Objects: key count + value-wise `Object.is`.
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
