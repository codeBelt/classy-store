'use client';

import {useEffect, useState} from 'react';
import {plannerPersist} from '@/stores/planner-store';

export function PlannerHydrator() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    plannerPersist.rehydrate().then(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <p className="text-sm text-muted italic py-2">
        Hydrating planner from storage...
      </p>
    );
  }

  return null;
}
