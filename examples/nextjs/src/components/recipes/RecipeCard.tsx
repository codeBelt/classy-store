'use client';

import {shallowEqual} from '@codebelt/classy-store';
import {useStore} from '@codebelt/classy-store/react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import type {Recipe} from '@/stores/recipe-store';
import {recipeStore} from '@/stores/recipe-store';

export function RecipeCard({recipeId}: {recipeId: string}) {
  const recipe = useStore(
    recipeStore,
    (s) => {
      // Access _entries directly — snapshot freezes ReactiveMap into a plain
      // object, so prototype methods like .get() aren't available.
      const entry = (
        s.recipes._entries as ReadonlyArray<readonly [string, Recipe]>
      ).find(([id]) => id === recipeId);
      if (!entry) return null;
      const r = entry[1];
      return {
        title: r.title,
        description: r.description,
        prepMinutes: r.prepMinutes,
        cookMinutes: r.cookMinutes,
        servings: r.servings,
        tags: r.tags,
        ingredientCount: r.ingredients.length,
      };
    },
    shallowEqual,
  );

  if (!recipe) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-2">
      <ApiInfo
        apis={['useStore', 'selector', 'shallowEqual']}
        description="Selector extracts a single recipe by ID; shallowEqual prevents re-renders when unrelated recipes change."
      />
      <div className="flex items-start justify-between">
        <h3 className="font-semibold">{recipe.title}</h3>
        <button
          type="button"
          className="text-xs text-danger hover:underline"
          onClick={() => recipeStore.removeRecipe(recipeId)}
        >
          Remove
        </button>
      </div>
      <p className="text-sm text-muted line-clamp-2">{recipe.description}</p>
      <div className="flex gap-3 text-xs text-muted">
        <span>Prep: {recipe.prepMinutes}m</span>
        <span>Cook: {recipe.cookMinutes}m</span>
        <span>Serves: {recipe.servings}</span>
        <span>{recipe.ingredientCount} ingredients</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {recipe.tags.map((tag) => (
          <span
            key={tag}
            className="text-xs bg-accent-light text-accent px-2 py-0.5 rounded-full"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
