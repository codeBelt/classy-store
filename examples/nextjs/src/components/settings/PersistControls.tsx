'use client';

import {settingsPersist} from '@/stores/settings-store';

export function PersistControls() {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold text-sm">Persist Controls</h2>
      <p className="text-xs text-muted">
        PersistHandle: save(), clear(), rehydrate()
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => settingsPersist.save()}
          className="px-3 py-1.5 bg-accent text-white rounded text-sm hover:opacity-90"
        >
          Force Save
        </button>
        <button
          type="button"
          onClick={() => settingsPersist.clear()}
          className="px-3 py-1.5 border border-danger text-danger rounded text-sm hover:bg-danger hover:text-white"
        >
          Clear Storage
        </button>
        <button
          type="button"
          onClick={() => settingsPersist.rehydrate()}
          className="px-3 py-1.5 border border-border rounded text-sm hover:bg-border"
        >
          Rehydrate
        </button>
      </div>
    </div>
  );
}
