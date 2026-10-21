'use client';

import {useClassyStore} from '@codebelt/classy-store/react';
import {useFixtureStore} from '../../../hooks/useFixtureStore/useFixtureStore';
import {StoreSelector} from '../storeSelector/StoreSelector';
import {StoreTracked} from '../storeTracked/StoreTracked';

type Props = {prefix: string; includeCount?: boolean};

export function StoreFields({prefix, includeCount = false}: Props) {
  const store = useFixtureStore();
  const state = useClassyStore(store);
  return (
    <section>
      <label>
        {prefix}
        <input
          data-testid={`${prefix}-input`}
          value={state.text}
          onChange={(event) => {
            store.text = event.target.value;
            store.count++;
          }}
        />
      </label>
      <StoreSelector
        testId={`${prefix}-selector`}
        includeCount={includeCount}
      />
      <StoreTracked testId={`${prefix}-tracked`} includeCount={includeCount} />
    </section>
  );
}
