'use client';

import {useEffect, useState} from 'react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {plannerPersist} from '@/stores/planner-store';

export function PlannerHydrator() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void plannerPersist.rehydrate().then(
      () => setHydrated(true),
      (error) => {
        console.error('Could not restore planner data', error);
        setHydrated(true);
      },
    );
  }, []);

  if (!hydrated) {
    return (
      <p className="text-sm text-muted italic py-2">
        Hydrating planner from storage...
      </p>
    );
  }

  return (
    <ApiInfo
      apis={['persist skipHydration', 'rehydrate()']}
      description="SSR-safe pattern: store skips auto-hydration, component calls rehydrate() in useEffect on client."
      code={`persist(plannerStore, { skipHydration: true, ... });
// in useEffect:
void plannerPersist.rehydrate().catch(console.error);`}
    />
  );
}
