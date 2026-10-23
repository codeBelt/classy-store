import type {
  HistoryHandle,
  HistoryStatus,
} from '../../../../utils/history/history';
import {useUtilityStatus} from '../useUtilityStatus/useUtilityStatus';

/** Subscribe to undo/redo availability, recording state, and history disposal. */
export function useHistoryStatus(history: HistoryHandle): HistoryStatus {
  return useUtilityStatus(history);
}
