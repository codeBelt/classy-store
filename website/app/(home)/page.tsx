import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex-1">
      <section className="border-b bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-2 md:items-center md:py-28">
          <div>
            <h1 className="max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">
              State management that reads like TypeScript.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/90">
              Define state and actions in plain classes. Classy Store handles
              reactivity, computed getters, and framework subscriptions for you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/docs"
                className="rounded-lg bg-white px-5 py-3 font-semibold text-emerald-950 shadow-sm transition hover:bg-white/90"
              >
                Read the docs
              </Link>
              <a
                href={`${process.env.NEXT_PUBLIC_DOCS_BASE_PATH}/demos/index.html`}
                className="rounded-lg border border-white/50 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
              >
                Explore examples
              </a>
            </div>
          </div>

          <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/90 p-6 text-sm leading-7 text-slate-100 shadow-2xl">
            <code>{`import { createClassyStore } from '@codebelt/classy-store';
import { useClassyStore } from '@codebelt/classy-store/react';

class CounterStore {
  count = 0;

  get doubled() {
    return this.count * 2;
  }

  increment() {
    this.count++;
  }
}

const counter = createClassyStore(new CounterStore());
function CounterButton() {
  const count = useClassyStore(counter, (state) => state.count);
  return <button onClick={() => counter.increment()}>{count}</button>;
}`}</code>
          </pre>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-6 py-16 md:grid-cols-3 md:py-20">
        <article className="rounded-2xl border bg-fd-card p-6">
          <h2 className="text-lg font-semibold">A class is the store</h2>
          <p className="mt-3 leading-7 text-fd-muted-foreground">
            Fields hold state, methods update it, and getters are memoized
            computed values.
          </p>
        </article>
        <article className="rounded-2xl border bg-fd-card p-6">
          <h2 className="text-lg font-semibold">Use your framework</h2>
          <p className="mt-3 leading-7 text-fd-muted-foreground">
            Use React, Vue, Svelte, or Angular. The Solid 2 adapter is in
            preview.
          </p>
        </article>
        <article className="rounded-2xl border bg-fd-card p-6">
          <h2 className="text-lg font-semibold">Useful tools included</h2>
          <p className="mt-3 leading-7 text-fd-muted-foreground">
            Persist state, inspect it with Redux DevTools, subscribe to a single
            key, or add undo and redo.
          </p>
        </article>
      </section>
    </main>
  );
}
