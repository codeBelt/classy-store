import type {
  PersistHandle,
  PersistStatus,
} from '../../../../utils/persist/persist.types';
import {useUtilityStatus} from '../useUtilityStatus/useUtilityStatus';

/** Subscribe to persistence hydration, expiry, errors, and disposal. */
export function usePersistStatus(handle: PersistHandle): PersistStatus {
  return useUtilityStatus(handle);
}
