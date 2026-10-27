'use client';

import {useHistoryStatus} from '@codebelt/classy-store/react';
import type {HistoryHandle} from '@codebelt/classy-store/utils';
import {ApiInfo} from '@/components/shared/ApiInfo';

export function HistoryControls({history}: {history: HistoryHandle}) {
  const status = useHistoryStatus(history);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold">History:</span>
        <button
          type="button"
          onClick={() => history.undo()}
          disabled={!status.canUndo}
          className="px-3 py-1 bg-accent text-white rounded text-sm disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => history.redo()}
          disabled={!status.canRedo}
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
          canUndo: {String(status.canUndo)} | canRedo: {String(status.canRedo)}
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
        description="History status updates independently of store data. Pause stops recording; resume enables it for future edits."
        code={`history.undo();  history.redo();
history.pause(); history.resume();
history.canUndo; history.canRedo;`}
      />
    </div>
  );
}
