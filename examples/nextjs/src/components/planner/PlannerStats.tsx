'use client';

import {useStore} from '@codebelt/classy-store/react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {plannerStore} from '@/stores/planner-store';

export function PlannerStats() {
  const snap = useStore(plannerStore);

  return (
    <div className="space-y-2">
      <ApiInfo
        apis={['useStore', 'computed getters']}
        description="Displays computed stats: totalMealsPlanned, completionPercentage."
        code={`get totalMealsPlanned() { ... }
get completionPercentage() { ... }`}
      />
      <div className="flex gap-4">
        <div className="bg-card border border-border rounded-lg p-4 flex-1">
          <p className="text-xs text-muted">Meals Planned</p>
          <p className="text-2xl font-bold">{snap.totalMealsPlanned}/21</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 flex-1">
          <p className="text-xs text-muted">Completion</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{width: `${snap.completionPercentage}%`}}
              />
            </div>
            <span className="text-sm font-semibold">
              {snap.completionPercentage}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
