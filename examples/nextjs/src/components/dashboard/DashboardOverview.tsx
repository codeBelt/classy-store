'use client';

import {shallowEqual} from '@codebelt/classy-store';
import {useClassyStore} from '@codebelt/classy-store/react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {plannerStore} from '@/stores/planner-store';
import {recipeStore} from '@/stores/recipe-store';
import {shoppingStore} from '@/stores/shopping-store';

const Icons = {
  Recipe: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  Shopping: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  ),
  Planner: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
};

export function DashboardOverview() {
  const recipeStats = useClassyStore(
    recipeStore,
    (state) => ({
      count: state.recipeCount,
      avgTime: state.averageTotalTime,
    }),
    {isEqual: shallowEqual},
  );

  const shoppingStats = useClassyStore(
    shoppingStore,
    (state) => ({
      total: state.totalItems,
      unchecked: state.uncheckedCount,
    }),
    {isEqual: shallowEqual},
  );

  const plannerStats = useClassyStore(
    plannerStore,
    (state) => ({
      meals: state.totalMealsPlanned,
      pct: state.completionPercentage,
    }),
    {isEqual: shallowEqual},
  );

  const cards = [
    {
      label: 'Recipes',
      value: recipeStats.count,
      sub: `Avg ${recipeStats.avgTime} min`,
      icon: Icons.Recipe,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Shopping Items',
      value: shoppingStats.total,
      sub: `${shoppingStats.unchecked} remaining`,
      icon: Icons.Shopping,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Meals Planned',
      value: plannerStats.meals,
      sub: `${plannerStats.pct}% complete`,
      icon: Icons.Planner,
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
    },
  ];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Overview</h2>
        <ApiInfo
          minimal={true}
          apis={['useClassyStore', 'selector', 'shallowEqual']}
          description="Reads from 3 stores using selectors with shallowEqual."
          code={`const stats = useClassyStore(recipeStore, (state) => ({
  count: state.recipeCount,
  avgTime: state.averageTotalTime,
        }), {isEqual: shallowEqual});`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {cards.map((card, i) => (
          <div
            key={card.label}
            className={`glass-card p-6 relative overflow-hidden group animate-slide-up-delay-${i + 1}`}
          >
            <div className="absolute top-0 right-0 p-4 opacity-50 text-muted-foreground group-hover:opacity-20 group-hover:scale-110 transition-all duration-500">
              <card.icon className="w-12 h-12 stroke-1" aria-hidden="true" />
            </div>

            <div className="relative z-10">
              <div
                className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center mb-4`}
              >
                <card.icon
                  className={`w-5 h-5 ${card.color}`}
                  aria-hidden="true"
                />
              </div>

              <p className="text-sm font-medium text-muted-foreground">
                {card.label}
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-white">
                  {card.value}
                </span>
                <span className="text-xs font-medium text-muted-foreground bg-white/5 py-0.5 px-2 rounded-full">
                  {card.sub}
                </span>
              </div>
            </div>

            {/* Hover effect gradient */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/0 to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          </div>
        ))}
      </div>
    </section>
  );
}
