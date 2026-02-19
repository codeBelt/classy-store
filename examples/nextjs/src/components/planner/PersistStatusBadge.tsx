'use client';

import {useEffect, useState} from 'react';
import {plannerPersist} from '@/stores/planner-store';

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
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-end gap-1">
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
      <div className="flex gap-2">
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
