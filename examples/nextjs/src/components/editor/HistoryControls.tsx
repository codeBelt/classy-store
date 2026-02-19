'use client';

import {useStore} from '@codebelt/classy-store/react';
import type {HistoryHandle} from '@codebelt/classy-store/utils';
import {ApiInfo} from '@/components/shared/ApiInfo';

export function HistoryControls({
  history,
  store,
}: {
  history: HistoryHandle;
  store: object;
}) {
  // Subscribe to store changes so we re-render when canUndo/canRedo changes.
  useStore(store);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold">History:</span>
        <button
          type="button"
          onClick={() => history.undo()}
          disabled={!history.canUndo}
          className="px-3 py-1 bg-accent text-white rounded text-sm disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => history.redo()}
          disabled={!history.canRedo}
          className="px-3 py-1 bg-accent text-white rounded text-sm disabled:opacity-40"
        >
          Redo
        </button>
        <div className="h-4 w-px bg-border" />
        <button
          type="button"
          onClick={() => history.pause()}
          className="px-3 py-1 border border-border rounded text-sm hover:bg-border"
        >
          Pause
        </button>
        <button
          type="button"
          onClick={() => history.resume()}
          className="px-3 py-1 border border-border rounded text-sm hover:bg-border"
        >
          Resume
        </button>
        <p className="text-xs text-muted ml-auto">
          canUndo: {String(history.canUndo)} | canRedo:{' '}
          {String(history.canRedo)}
        </p>
      </div>
      <ApiInfo
        apis={[
          'withHistory',
          'undo',
          'redo',
          'pause',
          'resume',
          'canUndo',
          'canRedo',
        ]}
        description="Full history API: undo/redo navigation, pause to batch edits, resume to re-enable tracking."
        code={`history.undo();  history.redo();
history.pause(); history.resume();
history.canUndo; history.canRedo;`}
      />
    </div>
  );
}
