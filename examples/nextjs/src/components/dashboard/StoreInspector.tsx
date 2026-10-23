'use client';

import {snapshot, subscribe} from '@codebelt/classy-store';
import {useEffect, useState} from 'react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {plannerStore} from '@/stores/planner-store';
import {recipeStore} from '@/stores/recipe-store';
import {shoppingStore} from '@/stores/shopping-store';

export function StoreInspector() {
  const [lastMutated, setLastMutated] = useState<string | null>(null);

  const [updateCounts, setUpdateCounts] = useState({
    recipe: 0,
    shopping: 0,
    planner: 0,
  });

  useEffect(() => {
    let highlightTimer: ReturnType<typeof setTimeout> | undefined;
    function recordUpdate(store: keyof typeof updateCounts, label: string) {
      setUpdateCounts((previousCounts) => ({
        ...previousCounts,
        [store]: previousCounts[store] + 1,
      }));
      setLastMutated(label);
      clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => setLastMutated(null), 1000);
    }
    const subscriptions = [
      subscribe(recipeStore, () => {
        recordUpdate('recipe', 'Recipe Store');
      }),
      subscribe(shoppingStore, () => {
        recordUpdate('shopping', 'Shopping Store');
      }),
      subscribe(plannerStore, () => {
        recordUpdate('planner', 'Planner Store');
      }),
    ];
    return () => {
      for (const unsubscribe of subscriptions) unsubscribe();
      clearTimeout(highlightTimer);
    };
  }, []);

  const totalUpdates =
    updateCounts.recipe + updateCounts.shopping + updateCounts.planner;

  const recipeSnap = snapshot(recipeStore);
  const recipeKeys = Object.keys(recipeSnap);

  return (
    <div className="glass-card flex flex-col h-full animate-slide-up-delay-2">
      <div className="p-5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-sm">Store Inspector</h2>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Real-time Analysis
            </p>
          </div>
        </div>

        <ApiInfo
          minimal={true}
          apis={['snapshot', 'subscribe']}
          description="Subscribes to each store, counts batched updates observed since mounting, and displays snapshot keys."
          code={`subscribe(recipeStore, () => {
  setUpdateCount((previousCount) => previousCount + 1);
});`}
        />
      </div>

      <div className="p-5 flex-1 flex flex-col gap-6">
        {/* Stats Row */}
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-black/20 rounded-lg p-3 border border-white/5 relative overflow-hidden">
            <p className="text-[10px] text-muted-foreground font-mono mb-1">
              OBSERVED UPDATES
            </p>
            <p className="text-2xl font-bold font-mono tracking-tight">
              {totalUpdates}
            </p>
            {lastMutated && (
              <div className="absolute top-0 right-0 h-full w-1 bg-indigo-500 animate-pulse box-shadow-[0_0_10px_theme(colors.indigo.500)]" />
            )}
          </div>

          <div className="flex-1 space-y-2">
            {[
              {
                label: 'Recipe',
                count: updateCounts.recipe,
                color: 'text-blue-400',
              },
              {
                label: 'Shopping',
                count: updateCounts.shopping,
                color: 'text-emerald-400',
              },
              {
                label: 'Planner',
                count: updateCounts.planner,
                color: 'text-orange-400',
              },
            ].map((state) => (
              <div
                key={state.label}
                className="flex justify-between items-center text-xs"
              >
                <span className="text-muted-foreground">{state.label}:</span>
                <span
                  className={`font-mono font-medium ${state.color} bg-white/5 px-2 py-0.5 rounded`}
                >
                  {state.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Snapshot Keys */}
        <div className="flex-1 bg-black/40 rounded-lg border border-white/5 p-3 font-mono text-xs overflow-hidden">
          <div className="flex items-center justify-between mb-2 text-[10px] uppercase text-muted-foreground tracking-wider">
            <span>Recipe Snapshot Keys</span>
            <span className="text-[10px] bg-white/10 px-1 rounded text-white">
              {recipeKeys.length} keys
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recipeKeys.map((key) => (
              <span
                key={key}
                className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
              >
                {key}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
