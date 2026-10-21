'use client';

import {useClassyStore} from '@codebelt/classy-store/react';
import {useFixtureStore} from '../../../hooks/useFixtureStore/useFixtureStore';

type Props = {testId: string; includeCount?: boolean};

export function StoreSelector({testId, includeCount = false}: Props) {
  const store = useFixtureStore();
  const value = useClassyStore(store, (state) =>
    includeCount ? `${state.text}:${state.count}` : state.text,
  );
  return <output data-testid={testId}>{value}</output>;
}
