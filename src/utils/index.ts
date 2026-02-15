/**
 * @codebelt/classy-store/utils -- Utility functions for @codebelt/classy-store.
 *
 * Public API:
 * - `persist(store, options)` -- persist store state to storage with transforms, versioning, and cross-tab sync
 *
 * @module @codebelt/classy-store/utils
 */

export type {
  PersistHandle,
  PersistOptions,
  PropertyTransform,
  StorageAdapter,
} from './persist';
export {persist} from './persist';
