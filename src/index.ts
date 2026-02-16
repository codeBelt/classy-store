/**
 * @codebelt/classy-store -- Class-based reactive state management (Core/Vanilla).
 *
 * This entry point includes only the core logic.
 * For React usage, import from `@codebelt/classy-store/react`.
 *
 * @module @codebelt/classy-store
 */
export type {ReactiveMap, ReactiveSet} from './collections/collections';
export {reactiveMap, reactiveSet} from './collections/collections';
export {getVersion, store, subscribe} from './core/core';
export {snapshot} from './snapshot/snapshot';
export type {Snapshot} from './types';
export {shallowEqual} from './utils/equality/equality';
