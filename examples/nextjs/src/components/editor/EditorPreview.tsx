'use client';

import {useClassyStore} from '@codebelt/classy-store/react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import type {RecipeEditorStore} from '@/stores/recipe-editor-store';

export function EditorPreview({store}: {store: RecipeEditorStore}) {
  const snap = useClassyStore(store);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4 h-fit sticky top-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">Preview</h2>
        <ApiInfo
          apis={['computed getters']}
          description="Displays read-only computed values: totalTime, isValid, ingredientSummary, instructionCount."
          code={`get totalTime() { return this.prepMinutes + this.cookMinutes; }
get isValid() { return this.title.length > 0 && ...; }`}
        />
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            snap.isValid
              ? 'bg-success/10 text-success'
              : 'bg-danger/10 text-danger'
          }`}
        >
          {snap.isValid ? 'Valid' : 'Incomplete'}
        </span>
      </div>

      <div>
        <h3 className="text-lg font-bold">{snap.title || 'Untitled Recipe'}</h3>
        {snap.description && (
          <p className="text-sm text-muted mt-1">{snap.description}</p>
        )}
      </div>

      <div className="flex gap-4 text-sm">
        <div>
          <span className="text-muted text-xs block">Total Time</span>
          <span className="font-semibold">{snap.totalTime} min</span>
        </div>
        <div>
          <span className="text-muted text-xs block">Servings</span>
          <span className="font-semibold">{snap.servings}</span>
        </div>
        <div>
          <span className="text-muted text-xs block">Ingredients</span>
          <span className="font-semibold">{snap.ingredientSummary}</span>
        </div>
        <div>
          <span className="text-muted text-xs block">Steps</span>
          <span className="font-semibold">{snap.instructionCount}</span>
        </div>
      </div>

      {snap.ingredients.some((i) => i.trim()) && (
        <div>
          <h4 className="text-xs font-semibold text-muted uppercase mb-1">
            Ingredients
          </h4>
          <ul className="text-sm space-y-0.5">
            {snap.ingredients
              .filter((i) => i.trim())
              .map((ing) => (
                <li key={ing}>- {ing}</li>
              ))}
          </ul>
        </div>
      )}

      {snap.instructions.some((i) => i.trim()) && (
        <div>
          <h4 className="text-xs font-semibold text-muted uppercase mb-1">
            Instructions
          </h4>
          <ol className="text-sm space-y-0.5 list-decimal list-inside">
            {snap.instructions
              .filter((i) => i.trim())
              .map((inst) => (
                <li key={inst}>{inst}</li>
              ))}
          </ol>
        </div>
      )}
    </div>
  );
}
