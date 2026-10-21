import {useClassyStore} from '@codebelt/classy-store/react';
import {useId} from 'react';
import {useEditorStore} from '../../store/hooks/useEditorStore';

type Props = {label: string};

export function EditorFields({label}: Props) {
  const store = useEditorStore();
  const state = useClassyStore(store);
  const id = useId();

  return (
    <div className="grid gap-3">
      <label
        className="grid gap-1 text-xs text-zinc-400"
        htmlFor={`${id}-title`}
      >
        {label} title
        <input
          id={`${id}-title`}
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          value={state.title}
          onChange={(event) => store.setTitle(event.target.value)}
        />
      </label>
      <label
        className="grid gap-1 text-xs text-zinc-400"
        htmlFor={`${id}-body`}
      >
        {label} body
        <textarea
          id={`${id}-body`}
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          rows={3}
          value={state.body}
          onChange={(event) => store.setBody(event.target.value)}
        />
      </label>
    </div>
  );
}
