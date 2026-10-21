import {useClassyStore} from '@codebelt/classy-store/react';
import {useLayoutEffect, useState} from 'react';
import type {MemoryConsumerProps} from '../../memory.types';

export function MemoryTracked({
  store,
  label,
  onCommit,
  onLifetime,
}: MemoryConsumerProps) {
  const state = useClassyStore(store);
  const value = `${state.stable.label}:${state.summary}`;
  const [localCount, setLocalCount] = useState(0);
  useLayoutEffect(() => {
    onCommit(value);
  });
  useLayoutEffect(() => {
    onLifetime('setup');
    return () => onLifetime('cleanup');
  }, [onLifetime]);
  return (
    <section>
      <output>
        {label}:{value}
      </output>
      <button
        type="button"
        onClick={() => setLocalCount((previousCount) => previousCount + 1)}
      >
        Local {localCount}
      </button>
    </section>
  );
}
