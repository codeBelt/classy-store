import {useStore} from '@codebelt/classy-store/react';
import {Panel} from './Panel';
import {RenderBadge} from './RenderBadge';
import {postStore} from './stores';
import {useRenderCount} from './useRenderCount';

function LoadingIndicator() {
  const loading = useStore(postStore, (s) => s.loading);
  const renders = useRenderCount();
  return (
    <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
      <div>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wide">
          Loading
        </div>
        <div className="text-xl font-mono font-bold text-amber-400">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                role="img"
                aria-label="Loading spinner"
              >
                <title>Loading spinner</title>
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Fetching...
            </span>
          ) : (
            'Idle'
          )}
        </div>
      </div>
      <RenderBadge count={renders} />
    </div>
  );
}

function ErrorDisplay() {
  const error = useStore(postStore, (s) => s.error);
  const renders = useRenderCount();
  return (
    <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
      <div>
        <div className="text-[10px] text-zinc-400 uppercase tracking-wide">
          Error
        </div>
        <div
          className={`text-xl font-mono font-bold ${error ? 'text-red-400' : 'text-zinc-600'}`}
        >
          {error ?? 'None'}
        </div>
      </div>
      <RenderBadge count={renders} />
    </div>
  );
}

function PostList() {
  const posts = useStore(postStore, (s) => s.posts);
  const renders = useRenderCount();
  return (
    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-zinc-400 uppercase tracking-wide">
          Posts
        </div>
        <RenderBadge count={renders} />
      </div>
      {posts.length === 0 ? (
        <p className="text-sm text-zinc-500 py-2">
          No posts loaded. Click "Fetch Posts" to load.
        </p>
      ) : (
        <ul className="space-y-2">
          {posts.map((post) => (
            <li key={post.id} className="bg-zinc-800/50 rounded-lg px-3 py-2">
              <div className="text-sm font-medium text-emerald-400">
                {post.title}
              </div>
              <div className="text-xs text-zinc-400">{post.body}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PostCount() {
  const count = useStore(postStore, (s) => s.count);
  const renders = useRenderCount();
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-zinc-400">
        Count: <span className="font-mono text-zinc-200">{count}</span>
      </span>
      <RenderBadge count={renders} />
    </div>
  );
}

export function AsyncDemo() {
  return (
    <Panel
      title="Async Data Fetching"
      description="Mutations on each side of an await trigger separate notifications. Watch which slices re-render during each phase of the fetch lifecycle."
    >
      <div className="space-y-3 mb-4">
        <LoadingIndicator />
        <ErrorDisplay />
        <PostList />
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => postStore.fetchPosts()}
            className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition-colors cursor-pointer"
          >
            Fetch Posts
          </button>
          <button
            type="button"
            onClick={() => postStore.clear()}
            className="px-3 py-1.5 rounded-lg bg-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-600 transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
        <PostCount />
      </div>
    </Panel>
  );
}
