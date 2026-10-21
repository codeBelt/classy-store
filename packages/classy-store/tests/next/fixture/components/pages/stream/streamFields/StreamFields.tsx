'use client';

import {useEffect} from 'react';
import {getDiagnostics} from '../../../../utils/diagnostics/diagnostics';
import {StoreFields} from '../../../shared/storeFields/StoreFields';

export function StreamFields() {
  useEffect(() => {
    getDiagnostics().streamChildHydrated = true;
  }, []);
  return <StoreFields prefix="stream" includeCount={true} />;
}
