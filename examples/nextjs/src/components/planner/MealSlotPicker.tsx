'use client';

import {useClassyStore} from '@codebelt/classy-store/react';
import type {DayName, DayPlan} from '@/stores/planner-store';
import {plannerStore} from '@/stores/planner-store';
import type {Recipe} from '@/stores/recipe-store';
import {recipeStore} from '@/stores/recipe-store';

export function MealSlotPicker({
  day,
  slot,
  currentId,
}: {
  day: DayName;
  slot: keyof DayPlan;
  currentId: string | null;
}) {
  const recipeSnap = useClassyStore(recipeStore);
  const recipes = (
    recipeSnap.recipes._entries as ReadonlyArray<readonly [string, Recipe]>
  ).map(([, r]) => r);

  return (
    <select
      className="w-full text-xs bg-background border border-border rounded px-1 py-1 truncate"
      value={currentId ?? ''}
      onChange={(e) => {
        const id = e.target.value || null;
        const title = id ? (recipes.find((r) => r.id === id)?.title ?? '') : '';
        plannerStore.setMeal(day, slot, id, title);
      }}
    >
      <option value="">-</option>
      {recipes.map((r) => (
        <option key={r.id} value={r.id}>
          {r.title}
        </option>
      ))}
    </select>
  );
}
