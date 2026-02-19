/**
 * @codebelt/classy-store -- Class-based reactive state management (Core/Vanilla).
 *
 * This entry point includes only the core logic.
 *
 * @module @codebelt/classy-store
 */
export {createClassyStore, getVersion, subscribe} from './core/core';
export {snapshot} from './snapshot/snapshot';
export type {Snapshot} from './types';
export {shallowEqual} from './utils/equality/equality';
