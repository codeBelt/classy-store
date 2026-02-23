import {createClassyStore} from '@codebelt/classy-store';
import {devtools, persist} from '@codebelt/classy-store/utils';

export type MealSlot = {
  recipeId: string | null;
  recipeTitle: string;
  notes: string;
};

export type DayPlan = {
  breakfast: MealSlot;
  lunch: MealSlot;
  dinner: MealSlot;
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type DayName = (typeof DAYS)[number];

function emptySlot(): MealSlot {
  return {recipeId: null, recipeTitle: '', notes: ''};
}

function emptyDay(): DayPlan {
  return {
    breakfast: emptySlot(),
    lunch: emptySlot(),
    dinner: emptySlot(),
  };
}

class PlannerStore {
  days: Record<DayName, DayPlan> = {
    Mon: emptyDay(),
    Tue: emptyDay(),
    Wed: emptyDay(),
    Thu: emptyDay(),
    Fri: emptyDay(),
    Sat: emptyDay(),
    Sun: emptyDay(),
  };

  get totalMealsPlanned(): number {
    let count = 0;
    for (const day of Object.values(this.days)) {
      if (day.breakfast.recipeId) count++;
      if (day.lunch.recipeId) count++;
      if (day.dinner.recipeId) count++;
    }
    return count;
  }

  get completionPercentage(): number {
    return Math.round((this.totalMealsPlanned / 21) * 100);
  }

  setMeal(
    day: DayName,
    slot: keyof DayPlan,
    recipeId: string | null,
    recipeTitle: string,
  ) {
    this.days[day][slot].recipeId = recipeId;
    this.days[day][slot].recipeTitle = recipeTitle;
  }

  setNotes(day: DayName, slot: keyof DayPlan, notes: string) {
    this.days[day][slot].notes = notes;
  }

  clearDay(day: DayName) {
    this.days[day] = emptyDay();
  }

  clearAll() {
    for (const day of DAYS) {
      this.days[day] = emptyDay();
    }
  }
}

export const plannerStore = createClassyStore(new PlannerStore());

export const plannerPersist = persist(plannerStore, {
  name: 'classy-meal-planner',
  properties: ['days'],
  debounce: 500,
  version: 2,
  migrate: (state, oldVersion) => {
    if (oldVersion < 2) {
      return state;
    }
    return state;
  },
  merge: 'shallow',
  syncTabs: true,
  expireIn: 7 * 24 * 60 * 60 * 1000,
  clearOnExpire: true,
});

export {DAYS};

devtools(plannerStore, {name: 'Planner Store'});
