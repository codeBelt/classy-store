'use client';

import {subscribe} from '@codebelt/classy-store';
import {useEffect, useState} from 'react';
import {shoppingStore, subscriptionLog} from '@/stores/shopping-store';

export function SubscriptionLog() {
  const [entries, setEntries] = useState<string[]>([]);

  useEffect(() => {
    const unsub = subscribe(shoppingStore, () => {
      setEntries([...subscriptionLog]);
    });
    setEntries([...subscriptionLog]);
    return unsub;
  }, []);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold text-sm">subscribeKey Log</h2>
      <p className="text-xs text-muted">
        Captured via{' '}
        <code className="font-mono bg-border px-1 rounded">subscribeKey()</code>{' '}
        on <code className="font-mono bg-border px-1 rounded">items</code> and{' '}
        <code className="font-mono bg-border px-1 rounded">lastAction</code>
      </p>
      {entries.length === 0 ? (
        <p className="text-xs text-muted italic">No events yet...</p>
      ) : (
        <div className="font-mono text-xs space-y-0.5 max-h-48 overflow-y-auto">
          {entries
            .slice()
            .reverse()
            .map((entry) => (
              <p key={entry}>{entry}</p>
            ))}
        </div>
      )}
    </div>
  );
}
