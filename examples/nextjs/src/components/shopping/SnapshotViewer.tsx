'use client';

import {snapshot} from '@codebelt/classy-store';
import {useState} from 'react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {shoppingStore} from '@/stores/shopping-store';

export function SnapshotViewer() {
  const [captured, setCaptured] = useState<string | null>(null);

  const handleCapture = () => {
    const snap = snapshot(shoppingStore);
    setCaptured(JSON.stringify(snap, null, 2));
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold text-sm">Snapshot Viewer</h2>
      <ApiInfo
        apis={['snapshot']}
        description="Manually captures a snapshot and displays its state as JSON."
        code="const snap = snapshot(shoppingStore);"
      />
      <p className="text-xs text-muted">
        Manual{' '}
        <code className="font-mono bg-border px-1 rounded">snapshot()</code>{' '}
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
        <pre className="text-xs font-mono bg-background border border-border rounded p-2 max-h-48 overflow-auto">
          {captured}
        </pre>
      )}
    </div>
  );
}
