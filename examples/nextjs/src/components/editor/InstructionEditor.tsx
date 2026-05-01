'use client';

import {useClassyStore} from '@codebelt/classy-store/react';
import {ApiInfo} from '@/components/shared/ApiInfo';
import type {RecipeEditorStore} from '@/stores/recipe-editor-store';

export function InstructionEditor({store}: {store: RecipeEditorStore}) {
  const snap = useClassyStore(store);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">
          Instructions ({snap.instructionCount} steps)
        </h2>
        <ApiInfo
          apis={['array push', 'array splice']}
          description="Same array mutation pattern for instruction steps."
          code={`this.instructions.push('');       // add
this.instructions.splice(i, 1);   // remove`}
        />
        <button
          type="button"
          onClick={() => store.addInstruction()}
          className="text-xs text-accent hover:underline"
        >
          + Add Step
        </button>
      </div>
      <div className="space-y-2">
        {snap.instructions.map((instruction, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: items are identified by index
          <div key={i} className="flex gap-2">
            <span className="text-xs text-muted py-2 w-6 text-right shrink-0">
              {i + 1}.
            </span>
            <input
              type="text"
              className="border border-border bg-background rounded px-3 py-1.5 text-sm flex-1"
              value={instruction}
              onChange={(e) => store.updateInstruction(i, e.target.value)}
              placeholder={`Step ${i + 1}`}
            />
            {snap.instructions.length > 1 && (
              <button
                type="button"
                onClick={() => store.removeInstruction(i)}
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
