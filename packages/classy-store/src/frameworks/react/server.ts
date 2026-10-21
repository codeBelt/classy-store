import {getInternal} from '../../core/core';
import {snapshot} from '../../snapshot/snapshot';
import {hydrationSnapshots} from './utils/hydrationSnapshots/hydrationSnapshots';

/**
 * Capture the initial snapshot used for server rendering and client hydration.
 *
 * Call on each request's store and on its client counterpart, initialized with
 * the same data, before rendering or starting persistence. Repeated calls keep
 * the first snapshot. The returned proxy is unchanged and remains mutable.
 * Client-only stores do not need preparation.
 *
 * Prepare the exact proxy passed to the hooks. Opaque snapshot leaves such as
 * Date and Map retain their identity; replace them instead of mutating in place.
 * This entry imports no React hooks and is safe in a React Server Component.
 * Pass serializable initial data across that boundary, not the store instance.
 */
export function prepareStoreForHydration<T extends object>(proxyStore: T): T {
  getInternal(proxyStore);
  if (!hydrationSnapshots.has(proxyStore)) {
    hydrationSnapshots.set(proxyStore, snapshot(proxyStore));
  }
  return proxyStore;
}
