import {useClassyStore} from '@codebelt/classy-store/react';
import {useLayoutEffect} from 'react';
import type {ScaleConsumerProps} from '../../performance.types';
import {recordConsumerCommit, recordSelector} from '../../performanceMetrics';

export function SelectorField({store, index, revision}: ScaleConsumerProps) {
  const text = useClassyStore(store, (state) => {
    recordSelector();
    return state.items[index].text;
  });
  useLayoutEffect(recordConsumerCommit);
  return (
    <input
      aria-label={`Field ${index}`}
      data-revision={revision}
      value={text}
      onChange={(event) => {
        store.setText(index, event.currentTarget.value);
      }}
    />
  );
}
