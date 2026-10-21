import {useClassyStore} from '@codebelt/classy-store/react';
import type {QaTransitionProps} from '../../qa.types';
import {readQaGate} from '../../qa.utils';

export function QaTrackedTransition({store, field, gate}: QaTransitionProps) {
  const state = useClassyStore(store);
  const value = state.node[field];
  readQaGate(gate, field);
  return <output>{value}</output>;
}
