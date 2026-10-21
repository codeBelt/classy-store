import {useClassyStore} from '@codebelt/classy-store/react';
import {useLayoutEffect, useState} from 'react';
import type {ScaleConsumerProps} from '../../scale.types';

export function ScaleTrackedRow({
  store,
  index,
  label,
  onCommit,
}: ScaleConsumerProps) {
  const state = useClassyStore(store);
  const value = `${state.rows[index].title}:${state.rows[index].count}`;
  const [localCount, setLocalCount] = useState(0);
  useLayoutEffect(() => {
    onCommit(index);
  });
  return (
    <li data-consumer={index}>
      <output>
        {label}:{value}
      </output>
      <button
        type="button"
        onClick={() => setLocalCount((previousCount) => previousCount + 1)}
      >
        Local {localCount}
      </button>
    </li>
  );
}
