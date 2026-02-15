const objectProto = Object.getPrototypeOf({});

/**
 * Symbol that class instances can use to opt-in to deep proxying.
 * Classes with `static [PROXYABLE] = true` will be wrapped by the store proxy
 * just like plain objects, enabling nested reactivity.
 */
export const PROXYABLE = Symbol.for('@codebelt/classy-store.proxyable');

/**
 * Returns `true` if `value` is a plain object (created via `{}` or `new Object()`).
 * Needed by `canProxy()` to distinguish plain objects (which should be deep-proxied)
 * from class instances, Date, Map, etc. (which should not).
 */
export function isPlainObject(
  value: unknown,
): value is Record<string | symbol, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === objectProto || proto === null;
}

/**
 * Central gatekeeper for the proxy system: determines which values get wrapped
 * in child proxies (`core.ts`) or deep-cloned in snapshots (`snapshot.ts`).
 *
 * Returns `true` for arrays, plain objects, and class instances that opt-in
 * via `static [PROXYABLE] = true`. Everything else (Date, Map, Set, class
 * instances without PROXYABLE, primitives) is left as-is.
 */
export function canProxy(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return true;
  // Allow class instances that opt-in via the PROXYABLE symbol.
  const ctor = (value as {constructor?: unknown}).constructor;
  if (ctor && (ctor as Record<symbol, unknown>)[PROXYABLE]) {
    return true;
  }
  return isPlainObject(value);
}

/**
 * Walk the prototype chain of `target` looking for a getter descriptor for `prop`.
 * Returns the first (most-derived) getter found, or `undefined` if none exists.
 *
 * Used by `core.ts` (GET trap) to detect class getters for memoized evaluation,
 * and by `snapshot.ts` to skip own-property copying for getter-backed keys.
 */
export function findGetterDescriptor(
  target: object,
  prop: string | symbol,
): PropertyDescriptor | undefined {
  let proto: object | null = target;
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc?.get) return desc;
    proto = Object.getPrototypeOf(proto);
  }
  return undefined;
}

/**
 * Shallow-equal comparison for objects and arrays.
 * Useful as a custom `isEqual` for `useStore` selectors that return objects/arrays.
 *
 * - Primitives compared with `Object.is`.
 * - Arrays: length + element-wise `Object.is`.
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

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
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
