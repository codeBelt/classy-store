import {useClassyStore} from '@codebelt/classy-store/react';
import {useEffect} from 'react';
import type {QaHydrationProps} from '../../qa.types';

export function QaHydrationTracked({store, onCommit}: QaHydrationProps) {
  const state = useClassyStore(store);
  useEffect(() => {
    onCommit(state);
  }, [state, onCommit]);
  return <output>{state.name}</output>;
}
