'use client';

import {useClassyStore} from '@codebelt/classy-store/react';
import {Fragment} from 'react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import type {DayName, DayPlan} from '@/stores/planner-store';
import {DAYS, plannerStore} from '@/stores/planner-store';
import {MealSlotPicker} from './MealSlotPicker';

const SLOTS: (keyof DayPlan)[] = ['breakfast', 'lunch', 'dinner'];

export function PlannerGrid() {
  const snap = useClassyStore(plannerStore);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Weekly Plan</h2>
        <ApiInfo
          apis={['useClassyStore (auto-tracked)', 'deep nested objects']}
          description="Reads and mutates deeply nested days[day][slot] objects. Cross-store data via MealSlotPicker."
          code={`const meal = snap.days[day][slot];
plannerStore.setMeal(day, slot, id, title);`}
        />
        <button
          type="button"
          onClick={() => plannerStore.clearAll()}
          className="text-xs text-danger hover:underline"
        >
          Clear All
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="grid grid-cols-8 gap-px bg-border rounded-lg overflow-hidden min-w-[640px]">
          <div className="bg-card p-2" />
          {DAYS.map((day) => (
            <div
              key={day}
              className="bg-card p-2 text-center text-sm font-semibold"
            >
              {day}
            </div>
          ))}

          {SLOTS.map((slot) => (
            <Fragment key={slot}>
              <div className="bg-card p-2 text-xs font-medium text-muted capitalize">
                {slot}
              </div>
              {DAYS.map((day) => {
                const meal = snap.days[day][slot];
                return (
                  <div
                    key={`${day}-${slot}`}
                    className="bg-card p-1.5 min-h-16"
                  >
                    <MealSlotPicker
                      day={day as DayName}
                      slot={slot}
                      currentId={meal.recipeId}
                    />
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
