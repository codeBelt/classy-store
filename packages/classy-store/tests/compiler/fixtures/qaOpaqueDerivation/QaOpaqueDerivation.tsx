import {useClassyStore} from '@codebelt/classy-store/react';
import type {QaStore} from '../../qa.types';
import {formatQaName} from '../../qa.utils';

type Props = {store: QaStore; label: string};

export function QaOpaqueDerivation({store, label}: Props) {
  const state = useClassyStore(store);
  const formatted = formatQaName(state);
  return (
    <output>
      {label}:{formatted}:{state.count}
    </output>
  );
}
