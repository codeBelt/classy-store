import {useState} from 'react';
import {Button} from '../../../../components/Button';
import {EditorSession} from '../editorSession/EditorSession';

export function ScopedStoresDemo() {
  const [refreshes, setRefreshes] = useState(0);
  const [showRight, setShowRight] = useState(true);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => setRefreshes((previous) => previous + 1)}
        >
          Re-render parent ({refreshes})
        </Button>
        <Button
          variant="ghost"
          onClick={() => setShowRight((previous) => !previous)}
        >
          {showRight ? 'Unmount right editor' : 'Mount right editor'}
        </Button>
      </div>
      <p className="text-sm text-zinc-400">
        Edits stay in their scope. Refreshing the parent preserves drafts; reset
        starts a new session. Unmounting and mounting the right editor creates a
        fresh draft.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <EditorSession
          label="Left editor"
          initialData={{
            title: 'Left draft',
            body: 'This draft belongs to the left scope.',
          }}
        >
          <div className="mt-4 border-t border-zinc-700 pt-4">
            <p className="mb-3 text-xs text-zinc-400">
              This nested editor has its own provider. Resetting the left scope
              also remounts its nested scope.
            </p>
            <EditorSession
              label="Nested editor"
              initialData={{
                title: 'Nested draft',
                body: 'The nearest provider owns this draft.',
              }}
            />
          </div>
        </EditorSession>
        {showRight && (
          <EditorSession
            label="Right editor"
            initialData={{
              title: 'Right draft',
              body: 'This draft belongs to the right scope.',
            }}
          />
        )}
      </div>
    </div>
  );
}
