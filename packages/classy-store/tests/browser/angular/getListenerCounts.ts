import {getInternal} from '../../../src/core/core';

export function getListenerCounts(store: object): {
  syncListeners: number;
  batchedListeners: number;
} | null {
  const internal = getInternal(store);
  return {
    syncListeners: internal.syncListeners.size,
    batchedListeners: internal.batchedListeners.size,
  };
}
