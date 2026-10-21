import {Profiler} from 'react';
import type {ScaleStore} from '../../performance.store';
import type {ScaleConfiguration} from '../../performance.types';
import {recordRootCommit} from '../../performanceMetrics';
import {SelectorField} from '../selectorField/SelectorField';
import {SelectorRow} from '../selectorRow/SelectorRow';
import {TrackedField} from '../trackedField/TrackedField';
import {TrackedRow} from '../trackedRow/TrackedRow';

type Props = {
  configuration: ScaleConfiguration;
  store: ScaleStore;
  revision: number;
};

export function ScaleApp({configuration, store, revision}: Props) {
  const Consumer =
    configuration.workload === 'form'
      ? configuration.mode === 'selector'
        ? SelectorField
        : TrackedField
      : configuration.mode === 'selector'
        ? SelectorRow
        : TrackedRow;
  const identities = Array.from({length: configuration.size}, (_, index) => ({
    id: `item-${index}`,
    index,
  }));
  const children = identities.map(({id, index}) => (
    <Consumer key={id} store={store} index={index} revision={revision} />
  ));
  return (
    <Profiler id="scale" onRender={recordRootCommit}>
      {configuration.workload === 'form' ? (
        <form>{children}</form>
      ) : (
        <ul>{children}</ul>
      )}
    </Profiler>
  );
}
