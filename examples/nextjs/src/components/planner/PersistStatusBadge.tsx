'use client';

import {subscribe} from '@codebelt/classy-store';
import {useEffect, useState} from 'react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {plannerPersist, plannerStore} from '@/stores/planner-store';

export function PersistStatusBadge() {
  const [status, setStatus] = useState({hydrated: false, expired: false});

  useEffect(() => {
    const check = () => {
      setStatus({
        hydrated: plannerPersist.isHydrated,
        expired: plannerPersist.isExpired,
      });
    };
    check();
    // Re-check after hydration completes
    plannerPersist.hydrated.then(check);
    // Re-check after any store mutation (persist writes happen after)
    const unsub = subscribe(plannerStore, () => {
      setTimeout(check, 100);
    });
    return unsub;
  }, []);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <ApiInfo
        apis={['PersistHandle', 'isHydrated', 'isExpired', 'save', 'clear']}
        description="Reads persist handle state and exposes manual save/clear controls. Uses subscribe for reactivity."
      />
      <div className="flex gap-2 text-xs">
        <span
          className={`px-2 py-0.5 rounded-full ${
            status.hydrated
              ? 'bg-success/10 text-success'
              : 'bg-accent-light text-accent'
          }`}
        >
          {status.hydrated ? 'Hydrated' : 'Pending'}
        </span>
        {status.expired && (
          <span className="px-2 py-0.5 rounded-full bg-danger/10 text-danger">
            Expired
          </span>
        )}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => plannerPersist.save()}
          className="text-xs text-accent hover:underline"
        >
          Force Save
        </button>
        <button
          type="button"
          onClick={() => plannerPersist.clear()}
          className="text-xs text-danger hover:underline"
        >
          Clear Storage
        </button>
      </div>
    </div>
  );
}
