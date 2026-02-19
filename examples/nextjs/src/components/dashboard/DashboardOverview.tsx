'use client';

import {shallowEqual} from '@codebelt/classy-store';
import {useStore} from '@codebelt/classy-store/react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {plannerStore} from '@/stores/planner-store';
import {recipeStore} from '@/stores/recipe-store';
import {shoppingStore} from '@/stores/shopping-store';

export function DashboardOverview() {
  const recipeStats = useStore(
    recipeStore,
    (s) => ({
      count: s.recipeCount,
      avgTime: s.averageTotalTime,
    }),
    shallowEqual,
  );

  const shoppingStats = useStore(
    shoppingStore,
    (s) => ({
      total: s.totalItems,
      unchecked: s.uncheckedCount,
    }),
    shallowEqual,
  );

  const plannerStats = useStore(
    plannerStore,
    (s) => ({
      meals: s.totalMealsPlanned,
      pct: s.completionPercentage,
    }),
    shallowEqual,
  );

  const cards = [
    {
      label: 'Recipes',
      value: recipeStats.count,
      sub: `Avg ${recipeStats.avgTime} min`,
    },
    {
      label: 'Shopping Items',
      value: shoppingStats.total,
      sub: `${shoppingStats.unchecked} remaining`,
    },
    {
      label: 'Meals Planned',
      value: plannerStats.meals,
      sub: `${plannerStats.pct}% complete`,
    },
  ];

  return (
    <div className="space-y-2">
      <ApiInfo
        apis={['useStore', 'selector', 'shallowEqual']}
        description="Reads from 3 stores using selectors with shallowEqual to prevent unnecessary re-renders."
        code={`const stats = useStore(recipeStore, (s) => ({
  count: s.recipeCount,
  avgTime: s.averageTotalTime,
}), shallowEqual);`}
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-card border border-border rounded-lg p-4"
          >
            <p className="text-sm text-muted">{card.label}</p>
            <p className="text-3xl font-bold mt-1">{card.value}</p>
            <p className="text-xs text-muted mt-1">{card.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
