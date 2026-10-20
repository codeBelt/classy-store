import {useState} from 'react';
import {useClassyStore} from '../../../../../src/frameworks/react/react';
import {
  compilerStore,
  equalCompilerFields,
  selectCompilerFields,
} from '../../compiler.store';
import {CompilerFields} from '../compilerFields/CompilerFields';
import {MemoProfile} from '../memoProfile/MemoProfile';

export function CompilerSelector() {
  const [revision, setRevision] = useState(0);
  const [showFallback, setShowFallback] = useState(false);
  const state = useClassyStore(compilerStore, selectCompilerFields, {
    isEqual: equalCompilerFields,
  });
  const name = showFallback ? state.fallback.name : state.profile.first;
  const label = state.labels[revision % 2];

  return (
    <main>
      <button
        type="button"
        onClick={() => setRevision((previous) => previous + 1)}
      >
        Local rerender
      </button>
      <button
        type="button"
        onClick={() => setShowFallback((previous) => !previous)}
      >
        Toggle branch
      </button>
      <output data-testid="local-revision">{revision}</output>
      <output data-testid="label">{label}</output>
      <output data-testid="conditional-name">{name}</output>
      <CompilerFields text={state.text} edits={state.edits} />
      <MemoProfile profile={state.profile} />
    </main>
  );
}
