import {useClassyStore} from '@codebelt/classy-store/react';
import {useLayoutEffect, useState} from 'react';
import {compilerStore} from '../../compiler.store';
import type {ConsumerProps} from '../../compiler.types';
import {MemoProfileName} from '../profileName/ProfileName';

export function DirectTracked({onCommit}: ConsumerProps) {
  const state = useClassyStore(compilerStore);
  const [index, setIndex] = useState(0);
  const names = state.groups.map((group) => group.name).join(',');
  const value = `${state.count}|${state.groups[index].name}`;
  useLayoutEffect(() => {
    onCommit(value);
  });
  return (
    <section>
      <button
        type="button"
        onClick={() => setIndex((previous) => 1 - previous)}
      >
        Switch group
      </button>
      <output>{value}</output>
      <p data-names="">{names}</p>
      <MemoProfileName profile={state.profile} />
    </section>
  );
}
