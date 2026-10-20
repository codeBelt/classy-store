import {useClassyStore} from '@codebelt/classy-store/react';
import {useEffect} from 'react';
import {useEditorStore} from '../../../example/hooks/useEditorStore';
import type {ScopedSsrObservation} from '../scopedSsr.types';

type Props = Pick<ScopedSsrObservation, 'onRead' | 'onCommit'>;

export function ScopedSsrSelectedValue({onRead, onCommit}: Props) {
  const store = useEditorStore();
  const value = useClassyStore(
    store,
    (state) => `${state.title}|${state.body}`,
  );
  onRead?.(value);
  useEffect(() => {
    onCommit?.(value);
  }, [onCommit, value]);
  return <output data-scoped-value={true}>{value}</output>;
}
