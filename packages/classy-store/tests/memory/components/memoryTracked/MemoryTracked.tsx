import {useClassyStore} from '@codebelt/classy-store/react';
import type {MemoryConsumerProps} from '../../memory.types';

export function MemoryTracked({store}: MemoryConsumerProps) {
  const state = useClassyStore(store);
  return <output>{state.rows.at(-1)?.text ?? 'empty'}</output>;
}
