'use client';

import {useStore} from '@codebelt/classy-store/react';
import type {RecipeEditorStore} from '@/stores/recipe-editor-store';

export function IngredientEditor({store}: {store: RecipeEditorStore}) {
  const snap = useStore(store);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">
          Ingredients ({snap.ingredientSummary})
        </h2>
        <button
          type="button"
          onClick={() => store.addIngredient()}
          className="text-xs text-accent hover:underline"
        >
          + Add
        </button>
      </div>
      <div className="space-y-2">
        {snap.ingredients.map((ingredient, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: items are identified by index
          <div key={i} className="flex gap-2">
            <input
              type="text"
              className="border border-border bg-background rounded px-3 py-1.5 text-sm flex-1"
              value={ingredient}
              onChange={(e) => store.updateIngredient(i, e.target.value)}
              placeholder={`Ingredient ${i + 1}`}
            />
            {snap.ingredients.length > 1 && (
              <button
                type="button"
                onClick={() => store.removeIngredient(i)}
                className="text-xs text-danger hover:underline px-2"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
