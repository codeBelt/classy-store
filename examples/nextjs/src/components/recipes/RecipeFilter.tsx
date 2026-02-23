'use client';

import {useStore} from '@codebelt/classy-store/react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {recipeStore} from '@/stores/recipe-store';

export function RecipeFilter() {
  const snap = useStore(recipeStore);

  return (
    <div className="glass-card p-6 space-y-4 animate-slide-up-delay-1">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg tracking-tight">Filter Recipes</h2>
        <ApiInfo
          alignment="left"
          apis={['useStore (auto-tracked)', 'deep nested mutation']}
          description="Auto-tracked mode — only re-renders when accessed properties change. Mutates nested store.filter.searchTerm directly."
          code={`const snap = useStore(recipeStore);
// deep nested mutation:
recipeStore.filter.maxPrepTime = Number(value) || 0;`}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1.5 text-sm flex-1 min-w-[200px]">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Search
          </span>
          <div className="relative">
            <input
              type="text"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all outline-none placeholder:text-muted-foreground/70"
              placeholder="Search recipes..."
              value={snap.filter.searchTerm}
              onChange={(e) => recipeStore.setSearchTerm(e.target.value)}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 pointer-events-none">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
          </div>
        </label>

        <label className="flex flex-col gap-1.5 text-sm w-32">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Max Time (min)
          </span>
          <input
            type="number"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all outline-none placeholder:text-muted-foreground/70"
            placeholder="Any"
            min="0"
            value={snap.filter.maxPrepTime || ''}
            onChange={(e) => {
              recipeStore.filter.maxPrepTime = Number(e.target.value) || 0;
            }}
          />
        </label>
      </div>

      <div>
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider block mb-2">
          Filter by tag
        </span>
        <div className="flex flex-wrap gap-2">
          {(snap.allTags._items as readonly string[]).map((tag) => {
            const selected = snap.filter.selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => recipeStore.toggleTagFilter(tag)}
                className={`text-xs px-3 py-1 rounded-full border transition-all duration-200 ${
                  selected
                    ? 'bg-primary text-white border-primary shadow-[0_0_10px_rgba(249,115,22,0.3)]'
                    : 'bg-white/5 border-white/10 text-muted-foreground hover:border-white/20 hover:text-white hover:bg-white/10'
                }`}
              >
                {tag}
              </button>
            );
          })}
          {snap.allTags._items.length === 0 && (
            <span className="text-xs text-muted-foreground italic">
              No tags available. Add some below!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
