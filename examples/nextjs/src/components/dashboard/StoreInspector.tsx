'use client';

import {getVersion, snapshot, subscribe} from '@codebelt/classy-store';
import {useCallback, useEffect, useState} from 'react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {plannerStore} from '@/stores/planner-store';
import {recipeStore} from '@/stores/recipe-store';
import {shoppingStore} from '@/stores/shopping-store';

export function StoreInspector() {
  const [mutationCount, setMutationCount] = useState(0);
  const [versions, setVersions] = useState({
    recipe: 0,
    shopping: 0,
    planner: 0,
  });

  const updateVersions = useCallback(() => {
    setVersions({
      recipe: getVersion(recipeStore),
      shopping: getVersion(shoppingStore),
      planner: getVersion(plannerStore),
    });
  }, []);

  useEffect(() => {
    updateVersions();
    const unsubs = [
      subscribe(recipeStore, () => {
        setMutationCount((c) => c + 1);
        updateVersions();
      }),
      subscribe(shoppingStore, () => {
        setMutationCount((c) => c + 1);
        updateVersions();
      }),
      subscribe(plannerStore, () => {
        setMutationCount((c) => c + 1);
        updateVersions();
      }),
    ];
    return () => {
      for (const u of unsubs) u();
    };
  }, [updateVersions]);

  const recipeSnap = snapshot(recipeStore);
  const recipeKeys = Object.keys(recipeSnap);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold">Store Inspector</h2>
      <ApiInfo
        apis={['getVersion', 'snapshot', 'subscribe']}
        description="Manually subscribes to all stores, tracks mutation count, and displays version numbers and snapshot keys."
        code={`subscribe(recipeStore, () => {
  setMutationCount((c) => c + 1);
  updateVersions();
});`}
      />
      <p className="text-sm text-muted">
        Uses{' '}
        <code className="font-mono text-xs bg-border px-1 rounded">
          getVersion()
        </code>
        ,{' '}
        <code className="font-mono text-xs bg-border px-1 rounded">
          snapshot()
        </code>
        , and{' '}
        <code className="font-mono text-xs bg-border px-1 rounded">
          subscribe()
        </code>
      </p>
      <div className="text-sm space-y-1">
        <p>
          Total mutations observed: <strong>{mutationCount}</strong>
        </p>
        <p>
          Recipe Store version: <strong>{versions.recipe}</strong>
        </p>
        <p>
          Shopping Store version: <strong>{versions.shopping}</strong>
        </p>
        <p>
          Planner Store version: <strong>{versions.planner}</strong>
        </p>
      </div>
      <div>
        <p className="text-xs text-muted mb-1">Recipe snapshot keys:</p>
        <code className="text-xs font-mono bg-border px-2 py-1 rounded block">
          {recipeKeys.join(', ')}
        </code>
      </div>
    </div>
  );
}
