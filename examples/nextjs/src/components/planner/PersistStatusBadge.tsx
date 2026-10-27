'use client';

import {usePersistStatus} from '@codebelt/classy-store/react';
import {useState} from 'react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {plannerPersist} from '@/stores/planner-store';

export function PersistStatusBadge() {
  const status = usePersistStatus(plannerPersist);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleAction(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <ApiInfo
        apis={['PersistHandle', 'isHydrated', 'isExpired', 'save', 'clear']}
        description="Subscribes directly to persistence status and exposes manual save/clear controls."
      />
      <div className="flex gap-2 text-xs">
        <span
          className={`px-2 py-0.5 rounded-full ${
            status.isHydrated
              ? 'bg-success/10 text-success'
              : 'bg-accent-light text-accent'
          }`}
        >
          {status.isHydrated ? 'Hydrated' : 'Pending'}
        </span>
        {status.isExpired && (
          <span className="px-2 py-0.5 rounded-full bg-danger/10 text-danger">
            Expired
          </span>
        )}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => handleAction(plannerPersist.save)}
          className="text-xs text-accent hover:underline"
        >
          Force Save
        </button>
        <button
          type="button"
          onClick={() => handleAction(plannerPersist.clear)}
          className="text-xs text-danger hover:underline"
        >
          Clear Storage
        </button>
      </div>
      {(actionError || status.lastError) && (
        <p role="alert" className="text-xs text-danger">
          {actionError ?? `Persistence failed: ${status.lastError?.operation}`}
        </p>
      )}
    </div>
  );
}
