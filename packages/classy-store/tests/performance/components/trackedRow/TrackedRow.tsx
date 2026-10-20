import {useClassyStore} from '@codebelt/classy-store/react';
import {useLayoutEffect} from 'react';
import type {ScaleConsumerProps} from '../../performance.types';
import {recordConsumerCommit} from '../../performanceMetrics';

export function TrackedRow({store, index, revision}: ScaleConsumerProps) {
  const state = useClassyStore(store);
  const item = state.items[index];
  useLayoutEffect(recordConsumerCommit);
  return (
    <li data-row={index} data-revision={revision}>
      {item.text} — {item.completed ? 'done' : 'pending'}
    </li>
  );
}
