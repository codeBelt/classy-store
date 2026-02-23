'use client';

import {subscribe} from '@codebelt/classy-store';
import {useCallback, useEffect, useState} from 'react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {settingsStore} from '@/stores/settings-store';

const STORAGE_KEYS = [
  'classy-kitchen-settings',
  'classy-shopping-list',
  'classy-meal-planner',
];

export function StorageDebugPanel() {
  const [storageData, setStorageData] = useState<Record<string, string | null>>(
    {},
  );
  const [mutationCount, setMutationCount] = useState(0);

  const refreshStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    const data: Record<string, string | null> = {};
    for (const key of STORAGE_KEYS) {
      data[key] = localStorage.getItem(key);
    }
    setStorageData(data);
  }, []);

  useEffect(() => {
    refreshStorage();
    const unsub = subscribe(settingsStore, () => {
      setMutationCount((c) => c + 1);
      setTimeout(refreshStorage, 400);
    });
    return unsub;
  }, [refreshStorage]);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">Storage Debug</h2>
        <ApiInfo
          apis={['subscribe', 'localStorage']}
          description="Subscribes to settings store to count mutations. Reads raw localStorage to show persisted JSON and debounce effects."
          code={`subscribe(settingsStore, () => {
  setMutationCount((c) => c + 1);
  setTimeout(refreshStorage, 400);
});`}
        />
        <button
          type="button"
          onClick={refreshStorage}
          className="text-xs text-accent hover:underline"
        >
          Refresh
        </button>
      </div>
      <p className="text-xs text-muted">
        Settings mutations: <strong>{mutationCount}</strong> (debounced writes
        at 300ms)
      </p>
      <div className="space-y-2">
        {STORAGE_KEYS.map((key) => (
          <div key={key}>
            <p className="text-xs font-mono text-muted">{key}:</p>
            <pre className="text-xs font-mono bg-background border border-border rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap break-all">
              {storageData[key]
                ? JSON.stringify(
                    JSON.parse(storageData[key] as string),
                    null,
                    2,
                  )
                : '(empty)'}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
