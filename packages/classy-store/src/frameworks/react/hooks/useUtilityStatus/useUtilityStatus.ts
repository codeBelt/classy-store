import {useSyncExternalStore} from 'react';
import type {UtilityStatusSource} from '../../../../utils/utilityStatus/utilityStatus';

/** Internal subscription shared by the public history and persistence hooks. */
export function useUtilityStatus<T>(handle: UtilityStatusSource<T>): T {
  return useSyncExternalStore(
    handle.subscribe,
    handle.getSnapshot,
    handle.getServerSnapshot,
  );
}
