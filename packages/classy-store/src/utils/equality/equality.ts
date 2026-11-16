import {getArrayIndex} from '../internal/internal';

function arrayIndexKeys(array: readonly unknown[]): string[] {
  return Object.getOwnPropertyNames(array).filter(
    (key) => getArrayIndex(key) !== undefined,
  );
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
    keysA = arrayIndexKeys(a);
    keysB = arrayIndexKeys(b);
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
