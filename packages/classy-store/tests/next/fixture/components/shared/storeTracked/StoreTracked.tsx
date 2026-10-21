'use client';

import {useClassyStore} from '@codebelt/classy-store/react';
import {useFixtureStore} from '../../../hooks/useFixtureStore/useFixtureStore';

type Props = {testId: string; includeCount?: boolean};

export function StoreTracked({testId, includeCount = false}: Props) {
  const state = useClassyStore(useFixtureStore());
  const value = includeCount ? `${state.text}:${state.count}` : state.text;
  return <output data-testid={testId}>{value}</output>;
}
