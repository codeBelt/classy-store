import {useClassyStore} from '@codebelt/classy-store/react';
import {useLayoutEffect} from 'react';
import type {ScaleConsumerProps} from '../../performance.types';
import {recordConsumerCommit} from '../../performanceMetrics';

export function TrackedField({store, index, revision}: ScaleConsumerProps) {
  const state = useClassyStore(store);
  useLayoutEffect(recordConsumerCommit);
  return (
    <input
      aria-label={`Field ${index}`}
      data-revision={revision}
      value={state.items[index].text}
      onChange={(event) => {
        store.setText(index, event.currentTarget.value);
      }}
    />
  );
}
