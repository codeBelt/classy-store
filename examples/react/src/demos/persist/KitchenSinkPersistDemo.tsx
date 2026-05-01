import {useClassyStore} from '@codebelt/classy-store/react';
import {useEffect, useState} from 'react';
import {Button} from '../../components/Button';
import {DemoContainer} from '../../components/DemoContainer';
import {RenderBadge} from '../../components/RenderBadge';
import {useRenderCount} from '../../hooks/useRenderCount';
import {kitchenSinkHandle, kitchenSinkStore} from '../../stores/persistStores';

const STORE_CODE = `class KitchenSinkStore {
  notes = reactiveMap<string, Note>();
  tags = reactiveSet<string>(['tutorial', 'persist']);
  lastEditedAt = new Date();
  viewMode: 'grid' | 'list' = 'list';
  sortBy: 'date' | 'title' = 'date';
  searchQuery = '';

  get filteredNotes() { /* filter + sort */ }
  addNote(title, body) { this.notes.set(...); }
}

persist(store, {
  name: 'kitchen-sink',
  debounce: 300,
  version: 1,
  merge: 'shallow',
  properties: [
    'viewMode', 'sortBy', 'searchQuery',
    { key: 'lastEditedAt',
      serialize: (d) => d.toISOString(),
      deserialize: (state) => new Date(s) },
    { key: 'notes',
      serialize: (n) => [...n.entries()],
      deserialize: (state) => reactiveMap(s) },
    { key: 'tags',
      serialize: (t) => [...t],
      deserialize: (state) => reactiveSet(s) },
  ],
  migrate: (state, oldVersion) => {
    if (oldVersion === 0) return { ...state, sortBy: 'date' };
    return state;
  },
});`;

function HydrationBadge() {
  const [hydrated, setHydrated] = useState(kitchenSinkHandle.isHydrated);

  useEffect(() => {
    if (hydrated) return;
    kitchenSinkHandle.hydrated.then(() => setHydrated(true));
  }, [hydrated]);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono border ${
        hydrated
          ? 'text-emerald-400 border-emerald-400/30'
          : 'text-amber-400 border-amber-400/30 animate-pulse'
      }`}
    >
      {hydrated ? 'hydrated' : 'hydrating...'}
    </span>
  );
}

function AddNoteForm() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    kitchenSinkStore.addNote(title.trim(), body.trim());
    setTitle('');
    setBody('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Note title"
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-teal-500/50"
      />
      <input
        type="text"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Body"
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-teal-500/50"
      />
      <button
        type="submit"
        className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-500 transition-colors cursor-pointer"
      >
        Add
      </button>
    </form>
  );
}

function NotesList() {
  const snap = useClassyStore(kitchenSinkStore);
  const renders = useRenderCount();
  const notes = snap.filteredNotes;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wide">
          Notes ({snap.noteCount})
        </span>
        <RenderBadge count={renders} />
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-zinc-600 italic">
          No notes yet. Add one above.
        </p>
      ) : (
        <div
          className={
            snap.viewMode === 'grid'
              ? 'grid grid-cols-2 gap-2'
              : 'flex flex-col gap-2'
          }
        >
          {notes.map((entry) => {
            const id = entry[0] as string;
            const note = entry[1] as {
              title: string;
              body: string;
              createdAt: string;
            };
            return (
              <div
                key={id}
                className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 flex items-start justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-teal-400 truncate">
                    {note.title}
                  </p>
                  {note.body && (
                    <p className="text-xs text-zinc-400 mt-0.5 truncate">
                      {note.body}
                    </p>
                  )}
                  <p className="text-[10px] text-zinc-600 mt-1">
                    {new Date(note.createdAt).toLocaleTimeString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => kitchenSinkStore.removeNote(id)}
                  className="text-zinc-600 hover:text-rose-400 text-sm transition-colors cursor-pointer shrink-0"
                  title="Delete note"
                >
                  x
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TagsSection() {
  const snap = useClassyStore(kitchenSinkStore);
  const renders = useRenderCount();
  const [newTag, setNewTag] = useState('');
  const tags = [...snap.tags];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wide">
          Tags ({tags.length})
        </span>
        <RenderBadge count={renders} />
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-violet-500/10 border border-violet-500/20 rounded-full px-2.5 py-0.5 text-xs text-violet-400"
          >
            {tag}
            <button
              type="button"
              onClick={() => kitchenSinkStore.removeTag(tag)}
              className="text-violet-400/50 hover:text-rose-400 cursor-pointer"
            >
              x
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-xs text-zinc-600 italic">No tags</span>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!newTag.trim()) return;
          kitchenSinkStore.addTag(newTag.trim());
          setNewTag('');
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
          placeholder="Add tag"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-violet-500/50"
        />
        <button
          type="submit"
          className="px-3 py-1 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-colors cursor-pointer"
        >
          + Tag
        </button>
      </form>
    </div>
  );
}

function ViewControls() {
  const viewMode = useClassyStore(kitchenSinkStore, (state) => state.viewMode);
  const sortBy = useClassyStore(kitchenSinkStore, (state) => state.sortBy);
  const renders = useRenderCount();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border border-zinc-700 overflow-hidden">
          <button
            type="button"
            onClick={() => kitchenSinkStore.setViewMode('list')}
            className={`px-2.5 py-1 text-xs cursor-pointer transition-colors ${
              viewMode === 'list'
                ? 'bg-teal-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => kitchenSinkStore.setViewMode('grid')}
            className={`px-2.5 py-1 text-xs cursor-pointer transition-colors ${
              viewMode === 'grid'
                ? 'bg-teal-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Grid
          </button>
        </div>
        <select
          value={sortBy}
          onChange={(event) =>
            kitchenSinkStore.setSortBy(event.target.value as 'date' | 'title')
          }
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 cursor-pointer outline-none"
        >
          <option value="date">Sort: Date</option>
          <option value="title">Sort: Title</option>
        </select>
      </div>
      <RenderBadge count={renders} />
    </div>
  );
}

function SearchInput() {
  const searchQuery = useClassyStore(
    kitchenSinkStore,
    (state) => state.searchQuery,
  );
  const renders = useRenderCount();

  return (
    <div className="flex items-center justify-between gap-3">
      <input
        type="text"
        value={searchQuery}
        onChange={(event) => kitchenSinkStore.setSearch(event.target.value)}
        placeholder="Search notes... (debounced 300ms)"
        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-teal-500/50"
      />
      <RenderBadge count={renders} />
    </div>
  );
}

function LastEdited() {
  const lastEditedAt = useClassyStore(
    kitchenSinkStore,
    (state) => state.lastEditedAt,
  );
  const renders = useRenderCount();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Last edited:</span>
        <span className="text-xs font-mono text-zinc-300">
          {lastEditedAt instanceof Date
            ? lastEditedAt.toLocaleString()
            : String(lastEditedAt)}
        </span>
      </div>
      <RenderBadge count={renders} />
    </div>
  );
}

function StorageInspector() {
  const [raw, setRaw] = useState(() => localStorage.getItem('kitchen-sink'));
  const snap = useClassyStore(kitchenSinkStore);

  const current = localStorage.getItem('kitchen-sink');
  if (current !== raw) {
    setRaw(current);
  }

  void snap;

  return (
    <div>
      <span className="text-xs text-zinc-500 uppercase tracking-wide block mb-1.5">
        localStorage["kitchen-sink"]
      </span>
      <pre className="text-[10px] bg-zinc-950 border border-zinc-800 rounded-lg p-3 overflow-x-auto text-teal-400/80 font-mono leading-relaxed max-h-48 overflow-y-auto">
        {raw ? JSON.stringify(JSON.parse(raw), null, 2) : '(empty)'}
      </pre>
    </div>
  );
}

function ControlPanel() {
  const [status, setStatus] = useState('');

  const showStatus = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(''), 2000);
  };

  return (
    <div>
      <span className="text-xs text-zinc-500 uppercase tracking-wide block mb-2">
        Persist Controls
      </span>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={async () => {
            await kitchenSinkHandle.save();
            showStatus('Saved!');
          }}
          className="!bg-teal-600 hover:!bg-teal-500"
        >
          Force Save
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            await kitchenSinkHandle.clear();
            showStatus('Storage cleared');
          }}
          className="!bg-amber-600 hover:!bg-amber-500"
        >
          Clear Storage
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            kitchenSinkHandle.unsubscribe();
            showStatus('Unsubscribed - mutations no longer persisted');
          }}
        >
          Unsubscribe
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            await kitchenSinkHandle.rehydrate();
            showStatus('Rehydrated from storage');
          }}
        >
          Rehydrate
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            kitchenSinkStore.reset();
            await kitchenSinkHandle.clear();
            await kitchenSinkHandle.save();
            showStatus('Reset to defaults');
          }}
        >
          Full Reset
        </Button>
      </div>
      {status && (
        <p className="text-xs text-emerald-400 mt-2 font-mono">{status}</p>
      )}
    </div>
  );
}

export function KitchenSinkPersistDemo() {
  return (
    <DemoContainer
      title="Kitchen Sink Persist"
      description="ReactiveMap + ReactiveSet + Date transforms + debounce + version migration + cross-tab sync."
      codeTabs={[{label: 'Store', code: STORE_CODE, language: 'typescript'}]}
    >
      <div className="flex items-center justify-between mb-4">
        <HydrationBadge />
        <span className="text-[10px] text-zinc-600">
          Open another tab to see cross-tab sync
        </span>
      </div>

      <div className="flex flex-col gap-5">
        <SearchInput />
        <ViewControls />
        <AddNoteForm />
        <NotesList />
        <TagsSection />
        <LastEdited />
        <StorageInspector />
        <ControlPanel />
      </div>
    </DemoContainer>
  );
}
