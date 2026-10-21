import {useClassyStore} from '@codebelt/classy-store/react';
import {useEffect} from 'react';
import {useEditorStore} from '../../../example/hooks/useEditorStore';
import type {ScopedSsrObservation} from '../scopedSsr.types';

type Props = Pick<ScopedSsrObservation, 'onRead' | 'onCommit'>;

export function ScopedSsrTrackedValue({onRead, onCommit}: Props) {
  const store = useEditorStore();
  const state = useClassyStore(store);
  const value = `${state.title}|${state.body}`;
  onRead?.(value);
  useEffect(() => {
    onCommit?.(value);
  }, [onCommit, value]);
  return <output data-scoped-value={true}>{value}</output>;
}
