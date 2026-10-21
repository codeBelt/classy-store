'use client';

import {createContext} from 'react';
import type {FixtureStore} from './fixtureStore.store';

export const FixtureStoreContext = createContext<FixtureStore | null>(null);
