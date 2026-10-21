import {useClassyStore} from '@codebelt/classy-store/react';
import {useLayoutEffect, useState} from 'react';
import type {ScaleConsumerProps} from '../../scale.types';

export function ScaleTrackedField({
  store,
  index,
  label,
  onCommit,
}: ScaleConsumerProps) {
  const state = useClassyStore(store);
  const value = state.fields[index].value;
  const [localCount, setLocalCount] = useState(0);
  useLayoutEffect(() => {
    onCommit(index);
  });
  return (
    <section data-consumer={index}>
      <label>
        {label} {index}
        <input
          value={value}
          onChange={(event) => {
            store.setFieldValue(index, event.currentTarget.value);
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => setLocalCount((previousCount) => previousCount + 1)}
      >
        Local {localCount}
      </button>
    </section>
  );
}
