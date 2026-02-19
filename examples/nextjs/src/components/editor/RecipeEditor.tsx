'use client';

import {useLocalStore, useStore} from '@codebelt/classy-store/react';
import type {HistoryHandle} from '@codebelt/classy-store/utils';
import {withHistory} from '@codebelt/classy-store/utils';
import {useRef} from 'react';
import {RecipeEditorStore} from '@/stores/recipe-editor-store';
import {EditorPreview} from './EditorPreview';
import {HistoryControls} from './HistoryControls';
import {IngredientEditor} from './IngredientEditor';
import {InstructionEditor} from './InstructionEditor';

export function RecipeEditor() {
  const store = useLocalStore(() => new RecipeEditorStore());
  const historyRef = useRef<HistoryHandle | null>(null);
  if (!historyRef.current) {
    historyRef.current = withHistory(store, {limit: 30});
  }
  const snap = useStore(store);

  return (
    <div className="space-y-4">
      <HistoryControls history={historyRef.current} store={store} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h2 className="font-semibold text-sm">Recipe Details</h2>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted text-xs">Title</span>
              <input
                type="text"
                className="border border-border bg-background rounded px-3 py-1.5 text-sm"
                value={snap.title}
                onChange={(e) => store.setTitle(e.target.value)}
                placeholder="Recipe title"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted text-xs">Description</span>
              <textarea
                className="border border-border bg-background rounded px-3 py-1.5 text-sm resize-none"
                rows={2}
                value={snap.description}
                onChange={(e) => store.setDescription(e.target.value)}
                placeholder="Brief description"
              />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-col gap-1 text-sm flex-1">
                <span className="text-muted text-xs">Prep (min)</span>
                <input
                  type="number"
                  className="border border-border bg-background rounded px-3 py-1.5 text-sm"
                  value={snap.prepMinutes}
                  onChange={(e) => store.setPrepMinutes(Number(e.target.value))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm flex-1">
                <span className="text-muted text-xs">Cook (min)</span>
                <input
                  type="number"
                  className="border border-border bg-background rounded px-3 py-1.5 text-sm"
                  value={snap.cookMinutes}
                  onChange={(e) => store.setCookMinutes(Number(e.target.value))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm flex-1">
                <span className="text-muted text-xs">Servings</span>
                <input
                  type="number"
                  className="border border-border bg-background rounded px-3 py-1.5 text-sm"
                  value={snap.servings}
                  onChange={(e) => store.setServings(Number(e.target.value))}
                />
              </label>
            </div>
          </div>
          <IngredientEditor store={store} />
          <InstructionEditor store={store} />
        </div>
        <EditorPreview store={store} />
      </div>
    </div>
  );
}
