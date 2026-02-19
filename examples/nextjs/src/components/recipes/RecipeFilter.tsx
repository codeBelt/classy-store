'use client';

import {useStore} from '@codebelt/classy-store/react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {recipeStore} from '@/stores/recipe-store';

export function RecipeFilter() {
  const snap = useStore(recipeStore);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold text-sm">Filter Recipes</h2>
      <ApiInfo
        apis={['useStore (auto-tracked)', 'deep nested mutation']}
        description="Auto-tracked mode — only re-renders when accessed properties change. Mutates nested store.filter.searchTerm directly."
        code={`const snap = useStore(recipeStore);
// deep nested mutation:
recipeStore.filter.maxPrepTime = Number(value) || 0;`}
      />
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted text-xs">Search</span>
          <input
            type="text"
            className="border border-border bg-background rounded px-3 py-1.5 text-sm w-56"
            placeholder="Search recipes..."
            value={snap.filter.searchTerm}
            onChange={(e) => recipeStore.setSearchTerm(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted text-xs">Max prep time (min)</span>
          <input
            type="number"
            className="border border-border bg-background rounded px-3 py-1.5 text-sm w-24"
            placeholder="0 = any"
            value={snap.filter.maxPrepTime || ''}
            onChange={(e) => {
              recipeStore.filter.maxPrepTime = Number(e.target.value) || 0;
            }}
          />
        </label>
      </div>
      <div>
        <span className="text-xs text-muted">Filter by tag:</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {(snap.allTags._items as readonly string[]).map((tag) => {
            const selected = snap.filter.selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => recipeStore.toggleTagFilter(tag)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  selected
                    ? 'bg-accent text-white border-accent'
                    : 'border-border text-muted hover:border-accent'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
