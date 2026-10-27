import {useClassyStore, useHistoryStatus} from '@codebelt/classy-store/react';
import {Button} from '../../components/Button';
import {DemoContainer} from '../../components/DemoContainer';
import {RenderBadge} from '../../components/RenderBadge';
import {useRenderCount} from '../../hooks/useRenderCount';
import {history, textEditorStore} from '../../stores/historyStore';

const STORE_CODE = `class TextEditorStore {
  title = 'Untitled Document';
  content = 'Start typing here...';

  setTitle(title: string) { this.title = title; }
  setContent(content: string) { this.content = content; }
  reset() {
    this.title = 'Untitled Document';
    this.content = 'Start typing here...';
  }
}

const store = createClassyStore(new TextEditorStore());
const history = withHistory(store, { limit: 50 });`;

const COMPONENT_CODE = `// Undo/redo controls
history.undo();
history.redo();

// Subscribe to status inside a React component
const {canUndo, canRedo, isPaused} = useHistoryStatus(history);

// Synchronous edits naturally share one history entry
store.setTitle('New Title');
store.setContent('New content');

// Control recording separately
history.pause(); // skip notifications delivered while paused
history.resume(); // record future notifications`;

function TitleEditor() {
  const title = useClassyStore(textEditorStore, (state) => state.title);
  const renders = useRenderCount();

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-zinc-400 uppercase tracking-wide">
          Title
        </span>
        <RenderBadge count={renders} />
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => textEditorStore.setTitle(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500/50"
      />
    </div>
  );
}

function ContentEditor() {
  const content = useClassyStore(textEditorStore, (state) => state.content);
  const renders = useRenderCount();

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-zinc-400 uppercase tracking-wide">
          Content
        </span>
        <RenderBadge count={renders} />
      </div>
      <textarea
        value={content}
        onChange={(e) => textEditorStore.setContent(e.target.value)}
        rows={4}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500/50 resize-none"
      />
    </div>
  );
}

function HistoryControls() {
  const status = useHistoryStatus(history);
  const paused = status.isPaused;
  const renders = useRenderCount();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-400 uppercase tracking-wide">
          History Controls
        </span>
        <RenderBadge count={renders} />
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <Button
          size="sm"
          onClick={() => history.undo()}
          disabled={!status.canUndo}
          className="disabled:opacity-30"
        >
          Undo
        </Button>
        <Button
          size="sm"
          onClick={() => history.redo()}
          disabled={!status.canRedo}
          className="disabled:opacity-30"
        >
          Redo
        </Button>
        <Button
          size="sm"
          variant={paused ? 'danger' : 'secondary'}
          onClick={() => {
            if (paused) {
              history.resume();
            } else {
              history.pause();
            }
          }}
        >
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => textEditorStore.reset()}
        >
          Reset
        </Button>
      </div>
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span>
          Can undo:{' '}
          <span
            className={status.canUndo ? 'text-emerald-400' : 'text-zinc-600'}
          >
            {String(status.canUndo)}
          </span>
        </span>
        <span>
          Can redo:{' '}
          <span
            className={status.canRedo ? 'text-emerald-400' : 'text-zinc-600'}
          >
            {String(status.canRedo)}
          </span>
        </span>
        {paused && (
          <span className="text-amber-400 font-medium">
            Recording paused — edits are not recorded
          </span>
        )}
      </div>
    </div>
  );
}

export function UndoRedoDemo() {
  return (
    <DemoContainer
      title="Undo / Redo Editor"
      description="withHistory() adds undo/redo via snapshot stack. Use pause()/resume() to control recording and useHistoryStatus() to render its status."
      codeTabs={[
        {label: 'Store', code: STORE_CODE, language: 'typescript'},
        {label: 'Usage', code: COMPONENT_CODE},
      ]}
    >
      <div className="flex flex-col gap-4">
        <TitleEditor />
        <ContentEditor />
        <HistoryControls />
      </div>
    </DemoContainer>
  );
}
