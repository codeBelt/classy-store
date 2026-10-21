import {useClassyStore} from '@codebelt/classy-store/react';
import {useLayoutEffect, useState} from 'react';
import {compilerStore} from '../../compiler.store';
import type {ConsumerProps} from '../../compiler.types';
import {MemoProfileName} from '../profileName/ProfileName';

export function DirectSelector({
  onCommit,
  isEqual,
  prefix = '',
}: ConsumerProps) {
  const [index, setIndex] = useState(0);
  const count = useClassyStore(compilerStore, (state) => state.count);
  const profile = useClassyStore(compilerStore, (state) => state.profile);
  const selected = useClassyStore(
    compilerStore,
    (state) => ({name: `${prefix}${state.groups[index].name}`}),
    {isEqual: isEqual ?? ((previous, next) => previous.name === next.name)},
  );
  const value = `${count}|${selected.name}`;
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
      <MemoProfileName profile={profile} />
    </section>
  );
}
