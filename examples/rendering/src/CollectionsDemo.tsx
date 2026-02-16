import {useStore} from '@codebelt/classy-store/react';
import {Panel} from './Panel';
import {RenderBadge} from './RenderBadge';
import {collectionStore} from './stores';
import {useRenderCount} from './useRenderCount';

const roles = ['viewer', 'editor', 'admin'] as const;

function UserList() {
  const snap = useStore(collectionStore);
  const renders = useRenderCount();
  const users = [...snap.users.entries()];

  return (
    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-zinc-400 uppercase tracking-wide">
          ReactiveMap — Users ({users.length})
        </div>
        <RenderBadge count={renders} />
      </div>
      {users.length === 0 ? (
        <p className="text-sm text-zinc-500 py-2">No users. Add one below.</p>
      ) : (
        <ul className="space-y-1.5">
          {users.map(([id, user]) => (
            <li
              key={id}
              className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-indigo-400">
                  {user.name}
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${
                    user.role === 'admin'
                      ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                      : user.role === 'editor'
                        ? 'text-violet-400 border-violet-500/30 bg-violet-500/10'
                        : 'text-zinc-400 border-zinc-600/30 bg-zinc-700/30'
                  }`}
                >
                  {user.role}
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => collectionStore.promoteUser(id)}
                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors cursor-pointer"
                >
                  Promote
                </button>
                <button
                  type="button"
                  onClick={() => collectionStore.removeUser(id)}
                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TagList() {
  const snap = useStore(collectionStore);
  const renders = useRenderCount();
  const tags = [...snap.tags];

  return (
    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-zinc-400 uppercase tracking-wide">
          ReactiveSet — Tags ({tags.length})
        </div>
        <RenderBadge count={renders} />
      </div>
      {tags.length === 0 ? (
        <p className="text-sm text-zinc-500 py-2">No tags. Add one below.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-2.5 py-1 text-xs font-mono"
            >
              {tag}
              <button
                type="button"
                onClick={() => collectionStore.removeTag(tag)}
                className="hover:text-red-400 transition-colors cursor-pointer"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CountDisplay() {
  const userCount = useStore(collectionStore, (s) => s.userCount);
  const tagCount = useStore(collectionStore, (s) => s.tagCount);
  const renders = useRenderCount();

  return (
    <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
      <div>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wide">
          Computed (getter)
        </div>
        <div className="text-sm font-mono text-amber-400">
          {userCount} users · {tagCount} tags
        </div>
      </div>
      <RenderBadge count={renders} />
    </div>
  );
}

let userId = 3;
const sampleNames = ['Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank'];
let nameIdx = 0;

const sampleTags = ['feature', 'docs', 'perf', 'refactor', 'test', 'ci'];
let tagIdx = 0;

export function CollectionsDemo() {
  return (
    <Panel
      title="Reactive Collections"
      description="reactiveMap() and reactiveSet() provide Map/Set semantics that the proxy can track. Native Map/Set internal methods aren't interceptable."
    >
      <div className="space-y-3 mb-4">
        <UserList />
        <TagList />
        <CountDisplay />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const name = sampleNames[nameIdx % sampleNames.length] as string;
            const role = roles[
              nameIdx % roles.length
            ] as (typeof roles)[number];
            nameIdx++;
            collectionStore.addUser(`u${userId++}`, name, role);
          }}
          className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition-colors cursor-pointer"
        >
          + User
        </button>
        <button
          type="button"
          onClick={() => {
            const tag = sampleTags[tagIdx % sampleTags.length] as string;
            tagIdx++;
            collectionStore.addTag(tag);
          }}
          className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 transition-colors cursor-pointer"
        >
          + Tag
        </button>
        <button
          type="button"
          onClick={() => collectionStore.clearTags()}
          className="px-3 py-1.5 rounded-lg bg-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-600 transition-colors cursor-pointer"
        >
          Clear Tags
        </button>
      </div>
    </Panel>
  );
}
