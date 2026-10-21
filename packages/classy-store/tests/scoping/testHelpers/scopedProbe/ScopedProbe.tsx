import {useClassyStore} from '@codebelt/classy-store/react';
import {useEffect} from 'react';
import type {EditorStore} from '../../example/editorStore';
import {useEditorStore} from '../../example/hooks/useEditorStore';

type Props = {
  name: string;
  onStore?: (store: EditorStore) => void;
  onCommit?: (value: string) => void;
};

export function ScopedProbe({name, onStore, onCommit}: Props) {
  const store = useEditorStore();
  const tracked = useClassyStore(store);
  const selected = useClassyStore(
    store,
    (state) => `${state.title}:${state.body}`,
  );
  const value = `${tracked.title}:${tracked.body}|${selected}`;

  useEffect(() => {
    onStore?.(store);
  }, [onStore, store]);
  useEffect(() => {
    onCommit?.(value);
  });

  return <output data-scope={name}>{value}</output>;
}
