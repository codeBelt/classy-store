import {useClassyStore} from '@codebelt/classy-store/react';
import type {QaTransitionProps} from '../../qa.types';
import {readQaGate} from '../../qa.utils';

export function QaSelectorTransition({store, field, gate}: QaTransitionProps) {
  const value = useClassyStore(store, (state) => state.node[field]);
  readQaGate(gate, field);
  return <output>{value}</output>;
}
