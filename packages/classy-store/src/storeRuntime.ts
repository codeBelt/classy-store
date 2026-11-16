// Both package formats resolve this peer-free entry through #store-runtime.
export {createProxy, isChanged} from 'proxy-compare';
export {
  createClassyStore,
  getInternal,
  getVersion,
  subscribe,
} from './core/core';
export {hydrationSnapshots} from './frameworks/react/utils/hydrationSnapshots/hydrationSnapshots';
export {originalSnapshotAccessor, snapshot} from './snapshot/snapshot';
