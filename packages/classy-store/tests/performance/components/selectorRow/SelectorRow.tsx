import {useClassyStore} from '@codebelt/classy-store/react';
import {useLayoutEffect} from 'react';
import type {ScaleConsumerProps} from '../../performance.types';
import {recordConsumerCommit, recordSelector} from '../../performanceMetrics';

export function SelectorRow({store, index, revision}: ScaleConsumerProps) {
  const item = useClassyStore(store, (state) => {
    recordSelector();
    return state.items[index];
  });
  useLayoutEffect(recordConsumerCommit);
  return (
    <li data-row={index} data-revision={revision}>
      {item.text} — {item.completed ? 'done' : 'pending'}
    </li>
  );
}
