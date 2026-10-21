import {useClassyStore} from '@codebelt/classy-store/react';
import type {QaReadKind, QaStore} from '../../qa.types';
import {readQaShape} from '../../qa.utils';

type Props = {store: QaStore; label: string; kind: QaReadKind};

export function QaReflectiveReads({store, label, kind}: Props) {
  const state = useClassyStore(store);
  const shape = readQaShape(state, kind);
  return (
    <output>
      {label}:{shape}:{state.count}
    </output>
  );
}
