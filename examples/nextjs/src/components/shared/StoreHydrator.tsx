'use client';

import {type ReactNode, useEffect, useState} from 'react';
import {settingsPersist} from '@/stores/settings-store';
import {shoppingPersist} from '@/stores/shopping-store';

const persists = [settingsPersist, shoppingPersist];

export function StoreHydrator({children}: {children: ReactNode}) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    Promise.all(persists.map((p) => p.rehydrate())).then(() =>
      setHydrated(true),
    );
  }, []);

  if (!hydrated) {
    return null;
  }

  return <>{children}</>;
}
