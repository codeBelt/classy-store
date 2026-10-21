'use client';

import {useContext} from 'react';
import {FixtureStoreContext} from '../../stores/fixtureStore/fixtureStoreContext';

export function useFixtureStore() {
  const store = useContext(FixtureStoreContext);
  if (!store) throw new Error('FixtureStoreProvider is required');
  return store;
}
