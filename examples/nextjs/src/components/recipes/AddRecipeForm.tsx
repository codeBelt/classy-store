'use client';

import {useState} from 'react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import {recipeStore} from '@/stores/recipe-store';

export function AddRecipeForm() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const id = `${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    recipeStore.addRecipe({
      id,
      title: title.trim(),
      description: description.trim(),
      prepMinutes: 15,
      cookMinutes: 30,
      servings: 4,
      ingredients: ['Ingredient 1'],
      instructions: ['Step 1'],
      tags: tags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    });
    setTitle('');
    setDescription('');
    setTags('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="glass-card p-6 space-y-5 animate-slide-up-delay-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg tracking-tight">
          Add Recipe (ReactiveMap.set)
        </h2>
        <ApiInfo
          alignment="left"
          apis={['reactiveMap']}
          description="Adds entries to the ReactiveMap via store method, generating unique IDs."
          code={`recipeStore.addRecipe({ id, title, ... });
// internally: this.recipes.set(id, recipe)`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label
            htmlFor="recipe-title"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
          >
            Title
          </label>
          <input
            id="recipe-title"
            type="text"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all outline-none placeholder:text-muted-foreground/70"
            placeholder="e.g. Grandma's Apple Pie"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="recipe-tags"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
          >
            Tags
          </label>
          <input
            id="recipe-tags"
            type="text"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all outline-none placeholder:text-muted-foreground/70"
            placeholder="dessert, sweet, holiday (comma separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>

        <div className="md:col-span-2 space-y-1.5">
          <label
            htmlFor="recipe-description"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
          >
            Description
          </label>
          <textarea
            id="recipe-description"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all outline-none placeholder:text-muted-foreground/70 min-h-[80px]"
            placeholder="A brief description of this delicious recipe..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={!title.trim()}
          className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
        >
          Add Recipe
        </button>
      </div>
    </form>
  );
}
