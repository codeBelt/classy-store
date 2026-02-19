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
      className="bg-card border border-border rounded-lg p-4 space-y-3"
    >
      <h2 className="font-semibold text-sm">Add Recipe (ReactiveMap.set)</h2>
      <ApiInfo
        apis={['reactiveMap']}
        description="Adds entries to the ReactiveMap via store method, generating unique IDs."
        code={`recipeStore.addRecipe({ id, title, ... });
// internally: this.recipes.set(id, recipe)`}
      />
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          className="border border-border bg-background rounded px-3 py-1.5 text-sm flex-1 min-w-40"
          placeholder="Recipe title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="text"
          className="border border-border bg-background rounded px-3 py-1.5 text-sm flex-1 min-w-40"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          type="text"
          className="border border-border bg-background rounded px-3 py-1.5 text-sm w-40"
          placeholder="Tags (comma-sep)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <button
          type="submit"
          className="px-4 py-1.5 bg-accent text-white rounded text-sm hover:opacity-90"
        >
          Add
        </button>
      </div>
    </form>
  );
}
