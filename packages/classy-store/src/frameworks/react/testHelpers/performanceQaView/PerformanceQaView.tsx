import {useEffect} from 'react';
import {useClassyStore} from '../../react';
import type {
  PerformanceQaCommit,
  PerformanceQaStore,
} from '../performanceQa.types';

type Props = {
  id: string;
  store: PerformanceQaStore;
  index: number;
  label?: string;
  onCommit: PerformanceQaCommit;
};

export function PerformanceQaView({
  id,
  store,
  index,
  label = '',
  onCommit,
}: Props) {
  const state = useClassyStore(store);
  const name = state.rows[index].name;
  useEffect(() => {
    onCommit(id, state);
  });
  return (
    <output data-consumer={id}>
      {label}:{name}
    </output>
  );
}
