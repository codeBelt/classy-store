'use client';

import {getVersion, snapshot} from '@codebelt/classy-store';
import {useState} from 'react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {shoppingStore} from '@/stores/shopping-store';

export function SnapshotViewer() {
  const [captured, setCaptured] = useState<{
    version: number;
    json: string;
  } | null>(null);

  const handleCapture = () => {
    const snap = snapshot(shoppingStore);
    setCaptured({
      version: getVersion(shoppingStore),
      json: JSON.stringify(snap, null, 2),
    });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold text-sm">Snapshot Viewer</h2>
      <ApiInfo
        apis={['snapshot', 'getVersion']}
        description="Manually captures a frozen snapshot and displays it as JSON alongside the current version number."
        code={`const snap = snapshot(shoppingStore);
const ver = getVersion(shoppingStore);`}
      />
      <p className="text-xs text-muted">
        Manual{' '}
        <code className="font-mono bg-border px-1 rounded">snapshot()</code> +{' '}
        <code className="font-mono bg-border px-1 rounded">getVersion()</code>{' '}
        capture
      </p>
      <button
        type="button"
        onClick={handleCapture}
        className="px-3 py-1.5 bg-accent text-white rounded text-sm hover:opacity-90"
      >
        Capture Snapshot
      </button>
      {captured && (
        <div>
          <p className="text-xs text-muted mb-1">
            Version: <strong>{captured.version}</strong>
          </p>
          <pre className="text-xs font-mono bg-background border border-border rounded p-2 max-h-48 overflow-auto">
            {captured.json}
          </pre>
        </div>
      )}
    </div>
  );
}
