'use client';

import {useStore} from '@codebelt/classy-store/react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {recipeStore} from '@/stores/recipe-store';
import {RecipeCard} from './RecipeCard';

export function RecipeList() {
  const snap = useStore(recipeStore);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h2 className="font-semibold text-xl tracking-tight leading-none mb-1">
            Recipes
          </h2>
          <p className="text-sm text-muted-foreground">
            Showing {snap.filteredRecipes.length} of {snap.recipeCount} recipes
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Avg Prep Time
            </p>
            <p className="font-mono text-primary">
              {snap.averageTotalTime} min
            </p>
          </div>

          <ApiInfo
            alignment="left"
            apis={['useStore (auto-tracked)', 'computed getters']}
            description="Auto-tracked useStore reads computed getters like filteredRecipes and recipeCount."
            code={`const snap = useStore(recipeStore);
snap.filteredRecipes // computed getter
snap.recipeCount     // computed getter`}
          />
        </div>
      </div>

      {snap.filteredRecipes.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-16 text-muted-foreground border-dashed border-white/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-12 h-12 mb-4 opacity-20"
            aria-hidden="true"
          >
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a2 2 0 0 1 2.83 2.83l-9.17 9.17a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l8.31-8.31" />
          </svg>
          <p className="text-lg font-medium">No recipes found</p>
          <p className="text-sm opacity-60">
            Try adjusting your search filters or add a new recipe.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {snap.filteredRecipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipeId={recipe.id} />
          ))}
        </div>
      )}
    </div>
  );
}
