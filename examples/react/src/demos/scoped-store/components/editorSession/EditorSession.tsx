import {type ReactNode, useState} from 'react';
import {Button} from '../../../../components/Button';
import {EditorStoreProvider} from '../../store/components/editorStoreProvider/EditorStoreProvider';
import type {EditorData} from '../../store/editorStore';
import {EditorFields} from '../editorFields/EditorFields';
import {EditorPreview} from '../editorPreview/EditorPreview';

type Props = {
  label: string;
  initialData: EditorData;
  children?: ReactNode;
};

export function EditorSession({label, initialData, children}: Props) {
  const [generation, setGeneration] = useState(0);
  return (
    <section
      className="rounded-xl border border-zinc-700 bg-zinc-900 p-4"
      aria-label={label}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-100">{label}</h2>
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Reset ${label}`}
          onClick={() => setGeneration((previous) => previous + 1)}
        >
          Reset
        </Button>
      </div>
      <EditorStoreProvider key={generation} initialData={initialData}>
        <EditorFields label={label} />
        <EditorPreview label={label} />
        {children}
      </EditorStoreProvider>
    </section>
  );
}
