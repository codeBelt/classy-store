import {useClassyStore} from '@codebelt/classy-store/react';
import type {MemoryConsumerProps} from '../../memory.types';

export function MemorySelector({store}: MemoryConsumerProps) {
  const text = useClassyStore(
    store,
    (state) => state.rows.at(-1)?.text ?? 'empty',
  );
  return <output>{text}</output>;
}
