import {useClassyStore} from '@codebelt/classy-store/react';
import {Button} from '../../components/Button';
import {DemoContainer} from '../../components/DemoContainer';
import {RenderBadge} from '../../components/RenderBadge';
import {useRenderCount} from '../../hooks/useRenderCount';
import {collectionStore} from '../../stores/collectionStore';

const roles = ['viewer', 'editor', 'admin'] as const;

const STORE_CODE = `class CollectionStore {
  users = reactiveMap<string, User>([
    ['u1', { name: 'Alice', role: 'admin' }],
    ['u2', { name: 'Bob', role: 'viewer' }],
  ]);
  tags = reactiveSet<string>(['urgent', 'bug']);

  get userCount() { return this.users.size; }
  get tagCount() { return this.tags.size; }

  addUser(id: string, name: string, role: Role) {
    this.users.set(id, { name, role });
  }
  removeUser(id: string) { this.users.delete(id); }
  addTag(tag: string) { this.tags.add(tag); }
  removeTag(tag: string) { this.tags.delete(tag); }
}`;

const COMPONENT_CODE = `// Auto-tracked mode — no selector needed
const snap = useClassyStore(collectionStore);

// Iterate reactive collections
const users = [...snap.users.entries()];
const tags = [...snap.tags];

// Computed getters
const userCount = useClassyStore(collectionStore, (state) => state.userCount);`;

function UserList() {
  const snap = useClassyStore(collectionStore);
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
  const snap = useClassyStore(collectionStore);
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
  const userCount = useClassyStore(collectionStore, (state) => state.userCount);
  const tagCount = useClassyStore(collectionStore, (state) => state.tagCount);
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
    <DemoContainer
      title="Reactive Collections"
      description="reactiveMap() and reactiveSet() provide Map/Set semantics that the proxy can track."
      codeTabs={[
        {label: 'Store', code: STORE_CODE, language: 'typescript'},
        {label: 'Component', code: COMPONENT_CODE},
      ]}
    >
      <div className="space-y-3 mb-4">
        <UserList />
        <TagList />
        <CountDisplay />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            const name = sampleNames[nameIdx % sampleNames.length] as string;
            const role = roles[
              nameIdx % roles.length
            ] as (typeof roles)[number];
            nameIdx++;
            collectionStore.addUser(`u${userId++}`, name, role);
          }}
        >
          + User
        </Button>
        <Button
          onClick={() => {
            const tag = sampleTags[tagIdx % sampleTags.length] as string;
            tagIdx++;
            collectionStore.addTag(tag);
          }}
          className="!bg-emerald-500 hover:!bg-emerald-400"
        >
          + Tag
        </Button>
        <Button variant="secondary" onClick={() => collectionStore.clearTags()}>
          Clear Tags
        </Button>
      </div>
    </DemoContainer>
  );
}
