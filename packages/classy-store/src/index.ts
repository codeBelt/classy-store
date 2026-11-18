/**
 * @codebelt/classy-store -- Class-based reactive state management (Core/Vanilla).
 *
 * This entry point includes only the core logic.
 *
 * @module @codebelt/classy-store
 */
export {batch, createClassyStore, snapshot, subscribe} from './storeRuntime';
export type {Snapshot, SubscribeOptions} from './types';
export {shallowEqual} from './utils/equality/equality';
export {PROXYABLE} from './utils/internal/internal';
