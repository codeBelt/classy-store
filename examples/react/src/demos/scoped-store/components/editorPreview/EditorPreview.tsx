import {useClassyStore} from '@codebelt/classy-store/react';
import {useEditorStore} from '../../store/hooks/useEditorStore';

type Props = {label: string};

export function EditorPreview({label}: Props) {
  const store = useEditorStore();
  const title = useClassyStore(store, (state) => state.title);
  return (
    <output
      className="mt-3 block text-sm text-indigo-300"
      aria-label={`${label} preview`}
    >
      Shared preview: {title || 'Untitled'}
    </output>
  );
}
