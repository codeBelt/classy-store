'use client';

import {useState} from 'react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {settingsPersist} from '@/stores/settings-store';

export function PersistControls() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAction(action: () => Promise<void>) {
    setErrorMessage(null);
    try {
      await action();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold text-sm">Persist Controls</h2>
      <ApiInfo
        apis={['PersistHandle', 'save', 'clear', 'rehydrate']}
        description="Manual persist controls: force-save, clear storage, and rehydrate from storage."
        code={`try {
  await settingsPersist.save();
  // Or await settingsPersist.clear() / settingsPersist.rehydrate().
} catch (error) {
  // Show the error in your UI.
}`}
      />
      <p className="text-xs text-muted">
        PersistHandle: save(), clear(), rehydrate()
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleAction(settingsPersist.save)}
          className="px-3 py-1.5 bg-accent text-white rounded text-sm hover:opacity-90"
        >
          Force Save
        </button>
        <button
          type="button"
          onClick={() => handleAction(settingsPersist.clear)}
          className="px-3 py-1.5 border border-danger text-danger rounded text-sm hover:bg-danger hover:text-white"
        >
          Clear Storage
        </button>
        <button
          type="button"
          onClick={() => handleAction(settingsPersist.rehydrate)}
          className="px-3 py-1.5 border border-border rounded text-sm hover:bg-border"
        >
          Rehydrate
        </button>
      </div>
      {errorMessage && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
