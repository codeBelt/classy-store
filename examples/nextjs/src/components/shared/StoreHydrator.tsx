'use client';

import {type ReactNode, useEffect, useState} from 'react';
import {settingsPersist} from '@/stores/settings-store';
import {shoppingPersist} from '@/stores/shopping-store';

const persists = [settingsPersist, shoppingPersist];

export function StoreHydrator({children}: {children: ReactNode}) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void Promise.allSettled(persists.map((handle) => handle.rehydrate())).then(
      (results) => {
        for (const result of results) {
          if (result.status === 'rejected')
            console.error('Could not restore persisted state', result.reason);
        }
        setHydrated(true);
      },
    );
  }, []);

  if (!hydrated) {
    return null;
  }

  return <>{children}</>;
}
