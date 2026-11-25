const objectProto = Object.getPrototypeOf({});

/** An array index is a canonical unsigned integer key below the maximum array length. */
export function getArrayIndex(key: string | symbol): number | undefined {
  if (typeof key !== 'string') return undefined;
  const index = Number(key);
  if (
    Number.isInteger(index) &&
    index >= 0 &&
    index < 2 ** 32 - 1 &&
    String(index) === key
  )
    return index;
  return undefined;
}

/** Visit only present indices, including non-enumerable ones. Keep trailing holes. */
export function mapOwnArrayElements<T, U>(
  source: readonly T[],
  project: (value: T, index: number) => U,
): U[] {
  const length = source.length;
  const result = new Array<U>(length);
  // Nearly every array is dense: walk it by index up to the first hole. A
  // sparse array reaches its first hole within its populated count, so a
  // trailing hole spanning billions of slots still costs no length-sized scan.
  // `in` is an order of magnitude cheaper here than an own-property check.
  let index = 0;
  for (; index < length && index in source; index++) {
    result[index] = project(source[index], index);
  }
  if (index === length) return result;
  for (const key of Object.getOwnPropertyNames(source)) {
    const later = getArrayIndex(key);
    if (later !== undefined && later > index) {
      result[later] = project(source[later], later);
    }
  }
  return result;
}

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
  // Read constructor from the prototype, NOT the instance, so that user data
  // with a `constructor` field of its own can't trick the check.
  const proto = Object.getPrototypeOf(value);
  const ctor = proto?.constructor;
  if (ctor && (ctor as Record<symbol, unknown>)[PROXYABLE]) {
    return true;
  }
  return isPlainObject(value);
}

/**
 * Look up the effective descriptor, respecting own and inherited data properties
 * that shadow an accessor on a more distant prototype.
 */
export function findPropertyDescriptor(
  target: object,
  prop: string | symbol,
): PropertyDescriptor | undefined {
  let proto: object | null = target;
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc) return desc;
    proto = Object.getPrototypeOf(proto);
  }
  return undefined;
}

/** Return the effective getter, respecting a nearer data property. */
export function findGetterDescriptor(target: object, prop: string | symbol) {
  const descriptor = findPropertyDescriptor(target, prop);
  return descriptor?.get ? descriptor : undefined;
}
