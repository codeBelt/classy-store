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
