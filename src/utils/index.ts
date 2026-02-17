/**
 * @codebelt/classy-store/utils -- Utility functions for @codebelt/classy-store.
 *
 * Public API:
 * - `persist(store, options)` -- persist store state to storage with transforms, versioning, and cross-tab sync
 * - `devtools(store, options?)` -- connect a store to Redux DevTools for inspection and time-travel
 * - `subscribeKey(store, key, callback)` -- subscribe to changes on a single property
 * - `withHistory(store, options?)` -- add undo/redo capability via a snapshot stack
 *
 * @module @codebelt/classy-store/utils
 */

export type {DevtoolsOptions} from './devtools/devtools';
export {devtools} from './devtools/devtools';
export type {HistoryHandle, HistoryOptions} from './history/history';
export {withHistory} from './history/history';
export type {
  PersistHandle,
  PersistOptions,
  PropertyTransform,
  StorageAdapter,
} from './persist/persist';
export {persist} from './persist/persist';
export {subscribeKey} from './subscribe-key/subscribe-key';
