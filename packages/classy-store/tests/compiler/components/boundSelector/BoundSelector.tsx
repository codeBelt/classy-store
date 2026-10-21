import {useLayoutEffect, useState} from 'react';
import {useCompilerStore} from '../../compiler.store';
import type {ConsumerProps} from '../../compiler.types';
import {MemoProfileName} from '../profileName/ProfileName';

export function BoundSelector({onCommit, isEqual, prefix = ''}: ConsumerProps) {
  const [index, setIndex] = useState(0);
  const count = useCompilerStore((state) => state.count);
  const profile = useCompilerStore((state) => state.profile);
  const selected = useCompilerStore(
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
