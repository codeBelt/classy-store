import {useClassyStore} from '@codebelt/classy-store/react';
import {memo, useEffect} from 'react';
import type {EditorStore} from '../../../example/editorStore';
import {useEditorStore} from '../../../example/hooks/useEditorStore';

type Props = {
  onStore: (store: EditorStore) => void;
  suspend?: () => void;
};

export const QaScopeProbe = memo(function QaScopeProbe({
  onStore,
  suspend,
}: Props) {
  const store = useEditorStore();
  const state = useClassyStore(store);
  suspend?.();
  useEffect(() => onStore(store), [store, onStore]);
  return (
    <output data-qa-tracked={true}>
      {state.title}|{state.body}
    </output>
  );
});
