'use client';

import {useStore} from '@codebelt/classy-store/react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {recipeStore} from '@/stores/recipe-store';
import {RecipeCard} from './RecipeCard';

export function RecipeList() {
  const snap = useStore(recipeStore);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">
          Recipes ({snap.filteredRecipes.length} of {snap.recipeCount})
        </h2>
        <ApiInfo
          apis={['useStore (auto-tracked)', 'computed getters']}
          description="Auto-tracked useStore reads computed getters like filteredRecipes and recipeCount."
          code={`const snap = useStore(recipeStore);
snap.filteredRecipes // computed getter
snap.recipeCount     // computed getter`}
        />
        <p className="text-xs text-muted">
          Avg total time: {snap.averageTotalTime} min
        </p>
      </div>
      {snap.filteredRecipes.length === 0 ? (
        <p className="text-sm text-muted italic py-8 text-center">
          No recipes match your filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {snap.filteredRecipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipeId={recipe.id} />
          ))}
        </div>
      )}
    </div>
  );
}
