import {TipBox} from '../components/TipBox';
import {AsyncDemo} from '../demos/reactivity/AsyncDemo';
import {ReactiveFundamentalsDemo} from '../demos/reactivity/ReactiveFundamentalsDemo';

export function ReactivityPage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-100">Reactivity</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Selectors, microtask batching, and async data fetching — watch the
          render badges to see exactly which components re-render.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <ReactiveFundamentalsDemo />
        <AsyncDemo />
        <TipBox>
          Selectors prevent re-renders when unrelated state changes. Use{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">
            useStore(store, s =&gt; s.count)
          </code>{' '}
          to only re-render when{' '}
          <code className="text-xs bg-zinc-800 px-1 rounded">count</code>{' '}
          changes.
        </TipBox>
      </div>
    </>
  );
}
