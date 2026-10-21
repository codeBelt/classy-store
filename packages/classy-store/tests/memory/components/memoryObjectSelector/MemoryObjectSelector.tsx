import type {Snapshot} from '@codebelt/classy-store';
import {useClassyStore} from '@codebelt/classy-store/react';
import type {MemoryStore} from '../../memory.store';
import type {MemoryConsumerProps} from '../../memory.types';

// Stable identity exercises the hook's memoized selector getter across updates.
function selectLastRow(state: Snapshot<MemoryStore>) {
  return state.rows.at(-1);
}

export function MemoryObjectSelector({store}: MemoryConsumerProps) {
  const row = useClassyStore(store, selectLastRow);
  return <output>{row?.text ?? 'empty'}</output>;
}
