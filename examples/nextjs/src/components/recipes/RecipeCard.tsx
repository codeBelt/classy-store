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
    <div className="glass-card group relative p-5 flex flex-col h-full animate-slide-up-delay-3 hover:scale-[1.02] transition-transform duration-300">
      <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <ApiInfo
          minimal={true}
          alignment="left"
          apis={['useStore', 'selector', 'shallowEqual']}
          description="Selector extracts a single recipe by ID; shallowEqual prevents re-renders when unrelated recipes change."
        />
      </div>

      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-lg text-white leading-tight pr-8">
          {recipe.title}
        </h3>
      </div>

      <p className="text-sm text-muted-foreground line-clamp-2 mb-4 min-h-[2.5em]">
        {recipe.description}
      </p>

      <div className="mt-auto space-y-3">
        <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground border-t border-white/5 pt-3">
          <div className="flex items-center gap-1.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{recipe.prepMinutes + recipe.cookMinutes}m</span>
          </div>

          <div className="flex items-center gap-1.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5"
              aria-hidden="true"
            >
              <path d="M17 21v-2a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a2 2 0 0 0-2-2-2.3 2.3 0 0 0-1.74 3.06" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>{recipe.servings} ppl</span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <span className="bg-white/5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wide">
              {recipe.ingredientCount} ingr
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {recipe.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20"
            >
              {tag}
            </span>
          ))}
        </div>

        <button
          type="button"
          className="w-full mt-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 py-1.5 rounded transition-colors opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.preventDefault();
            recipeStore.removeRecipe(recipeId);
          }}
        >
          Remove Recipe
        </button>
      </div>
    </div>
  );
}
