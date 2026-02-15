/**
 * @codebelt/classy-store -- Class-based reactive state management for React.
 *
 * Public API:
 * - `store(instance)` -- wrap a class instance in a reactive proxy
 * - `useStore(store, selector?)` -- React hook (selector or auto-tracked mode)
 * - `snapshot(store)` -- create an immutable frozen snapshot
 * - `subscribe(store, callback)` -- low-level change subscription
 * - `getVersion(store)` -- current version number (for debugging/caching)
 * - `shallowEqual(a, b)` -- shallow comparison helper for custom equality
 * - `reactiveMap(initial?)` / `reactiveSet(initial?)` -- proxy-compatible collections
 *
 * @module @codebelt/classy-store
 */
export type {ReactiveMap, ReactiveSet} from './collections';
export {reactiveMap, reactiveSet} from './collections';
export {getVersion, store, subscribe} from './core';
export {snapshot} from './snapshot';
export type {Snapshot} from './types';
export {useStore} from './useStore';
export {shallowEqual} from './utils';
