import { Boxes, Gauge, Layers, Package, Snowflake, Zap } from 'lucide-react';
import Link from 'next/link';

const codeHtml = `<span class="cs-k">class</span> <span class="cs-fn">CounterStore</span> {
  count = <span class="cs-num">0</span>;

  <span class="cs-k">get</span> <span class="cs-fn">double</span>() {
    <span class="cs-k">return</span> <span class="cs-k">this</span>.count * <span class="cs-num">2</span>;
  }

  <span class="cs-fn">increment</span>() {
    <span class="cs-k">this</span>.count++;
  }
}

<span class="cs-k">const</span> store = <span class="cs-fn">createClassyStore</span>(<span class="cs-k">new</span> <span class="cs-fn">CounterStore</span>());`;

const features = [
  {
    icon: Boxes,
    title: 'A class is the store',
    description:
      'Fields are state, methods are actions, and getters are computed values. TypeScript infers the rest.',
  },
  {
    icon: Zap,
    title: 'No wrappers',
    description:
      'No observer(), no Provider, no HOCs, no decorators. Import a hook and a store — that is it.',
  },
  {
    icon: Gauge,
    title: 'Fine-grained reactivity',
    description:
      'Components re-render only when the specific properties they read actually change.',
  },
  {
    icon: Layers,
    title: 'Memoized computed values',
    description:
      'Class getters are cached with dependency tracking and recompute only when a dependency changes.',
  },
  {
    icon: Snowflake,
    title: 'Immutable snapshots',
    description:
      'Structural sharing keeps unchanged sub-trees reference-equal, so selectors stay cheap.',
  },
  {
    icon: Package,
    title: 'Batteries included',
    description:
      'Persistence, Redux DevTools, undo/redo, and reactive collections in tree-shakeable entry points.',
  },
];

const frameworks = [
  { name: 'React', color: '#61dafb' },
  { name: 'Vue', color: '#42b883' },
  { name: 'Svelte', color: '#ff3e00' },
  { name: 'Solid', color: '#4f88c6' },
  { name: 'Angular', color: '#e23237' },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative overflow-hidden border-b border-fd-border">
        <div className="cs-dotgrid absolute inset-0" />
        <div
          className="cs-orb"
          style={{
            width: 380,
            height: 380,
            background: 'var(--cs-g1)',
            top: -150,
            left: -90,
          }}
        />
        <div
          className="cs-orb"
          style={{
            width: 340,
            height: 340,
            background: 'var(--cs-g3)',
            top: -60,
            right: -40,
            animationDelay: '-4s',
          }}
        />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-20 md:py-28 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card/70 px-3 py-1 text-xs font-medium text-fd-muted-foreground backdrop-blur">
              <span
                className="size-2 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, var(--cs-g1), var(--cs-g3))',
                }}
              />
              ~2.3 KB gzipped · React · Vue · Svelte · Solid · Angular
            </span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight md:text-5xl">
              Class-based <span className="cs-grad-text">reactive state</span>,
              without the boilerplate
            </h1>
            <p className="mt-4 max-w-lg text-lg text-fd-muted-foreground">
              Write a plain TypeScript class, wrap it with{' '}
              <code className="rounded bg-fd-muted px-1.5 py-0.5 text-sm">
                createClassyStore()
              </code>
              , and get fine-grained reactivity, memoized getters, and immutable
              snapshots for free.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/docs/getting-started/quick-start"
                className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-semibold text-fd-primary-foreground shadow-lg shadow-fd-primary/25 transition-opacity hover:opacity-90"
              >
                Get started — 5 min
              </Link>
              <Link
                href="/docs"
                className="rounded-lg border border-fd-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-fd-accent"
              >
                Read the docs
              </Link>
              <a
                href="https://github.com/codebelt/classy-store"
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-lg border border-fd-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-fd-accent"
              >
                GitHub
              </a>
            </div>
          </div>

          <div className="cs-glass overflow-hidden rounded-xl border border-fd-border shadow-2xl">
            <div className="flex items-center gap-1.5 border-b border-fd-border px-4 py-3">
              <span className="size-3 rounded-full bg-fd-muted" />
              <span className="size-3 rounded-full bg-fd-muted" />
              <span className="size-3 rounded-full bg-fd-muted" />
              <span className="ml-2 text-xs text-fd-muted-foreground">
                counter-store.tsx
              </span>
            </div>
            <pre className="cs-code overflow-x-auto p-4 text-[13px] leading-relaxed">
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static authored snippet */}
              <code dangerouslySetInnerHTML={{ __html: codeHtml }} />
            </pre>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold tracking-tight">
          Everything you need, nothing wasted
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-fd-muted-foreground">
          A tiny core with batteries-included utilities — all tree-shakeable.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:border-fd-primary/40"
            >
              <div
                className="mb-3 inline-flex size-10 items-center justify-center rounded-lg text-fd-primary"
                style={{
                  background:
                    'color-mix(in srgb, var(--color-fd-primary) 14%, transparent)',
                }}
              >
                <feature.icon className="size-5" />
              </div>
              <h3 className="text-base font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-fd-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-fd-border">
        <div
          className="cs-orb"
          style={{
            width: 340,
            height: 340,
            background: 'var(--cs-g2)',
            bottom: -170,
            left: '32%',
            opacity: 0.4,
          }}
        />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-20 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              Your class <span className="cs-grad-text">is</span> the store
            </h2>
            <p className="mt-4 max-w-md text-fd-muted-foreground">
              The proxy tracks mutations and streams immutable snapshots to
              whichever framework you use — each binding matches its own
              reactive idioms.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {frameworks.map((f) => (
                <span
                  key={f.name}
                  className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card px-3 py-1 text-sm font-medium"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ background: f.color }}
                  />
                  {f.name}
                </span>
              ))}
            </div>
          </div>
          <div className="flex justify-center">
            <ReactiveFlow />
          </div>
        </div>
      </section>
    </main>
  );
}

function ReactiveFlow() {
  return (
    <svg
      viewBox="0 0 440 300"
      className="w-full max-w-md"
      role="img"
      aria-label="A class flows through a proxy to five frameworks"
    >
      <defs>
        <linearGradient id="cs-flow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--cs-g1)" />
          <stop offset="0.5" stopColor="var(--cs-g2)" />
          <stop offset="1" stopColor="var(--cs-g3)" />
        </linearGradient>
      </defs>
      <rect
        x="0"
        y="120"
        width="118"
        height="60"
        rx="12"
        fill="var(--color-fd-secondary)"
        stroke="var(--color-fd-border)"
      />
      <text
        x="59"
        y="146"
        textAnchor="middle"
        fill="var(--color-fd-foreground)"
        fontSize="13"
        fontFamily="monospace"
      >
        class
      </text>
      <text
        x="59"
        y="164"
        textAnchor="middle"
        fill="var(--color-fd-muted-foreground)"
        fontSize="11"
        fontFamily="monospace"
      >
        {'Store {}'}
      </text>
      <circle
        cx="210"
        cy="150"
        r="40"
        fill="none"
        stroke="url(#cs-flow)"
        strokeWidth="2.5"
      />
      <text
        x="210"
        y="147"
        textAnchor="middle"
        fill="var(--color-fd-foreground)"
        fontSize="12"
        fontWeight="700"
      >
        proxy
      </text>
      <text
        x="210"
        y="164"
        textAnchor="middle"
        fill="var(--color-fd-muted-foreground)"
        fontSize="9"
      >
        store
      </text>
      <path
        d="M118 150 H170"
        stroke="url(#cs-flow)"
        strokeWidth="2.5"
        fill="none"
      />
      <g stroke="url(#cs-flow)" strokeWidth="2" fill="none">
        <path d="M250 150 C300 150 300 40 360 40" />
        <path d="M250 150 C300 150 300 95 360 95" />
        <path d="M250 150 H360" />
        <path d="M250 150 C300 150 300 205 360 205" />
        <path d="M250 150 C300 150 300 260 360 260" />
      </g>
      <g fontSize="11" fontWeight="700">
        <rect
          x="360"
          y="26"
          width="64"
          height="28"
          rx="14"
          fill="var(--color-fd-secondary)"
          stroke="var(--color-fd-border)"
        />
        <circle cx="375" cy="40" r="4" fill="#61dafb" />
        <text x="386" y="44" fill="var(--color-fd-foreground)">
          React
        </text>
        <rect
          x="360"
          y="81"
          width="58"
          height="28"
          rx="14"
          fill="var(--color-fd-secondary)"
          stroke="var(--color-fd-border)"
        />
        <circle cx="375" cy="95" r="4" fill="#42b883" />
        <text x="386" y="99" fill="var(--color-fd-foreground)">
          Vue
        </text>
        <rect
          x="360"
          y="136"
          width="72"
          height="28"
          rx="14"
          fill="var(--color-fd-secondary)"
          stroke="var(--color-fd-border)"
        />
        <circle cx="375" cy="150" r="4" fill="#ff3e00" />
        <text x="386" y="154" fill="var(--color-fd-foreground)">
          Svelte
        </text>
        <rect
          x="360"
          y="191"
          width="64"
          height="28"
          rx="14"
          fill="var(--color-fd-secondary)"
          stroke="var(--color-fd-border)"
        />
        <circle cx="375" cy="205" r="4" fill="#4f88c6" />
        <text x="386" y="209" fill="var(--color-fd-foreground)">
          Solid
        </text>
        <rect
          x="360"
          y="246"
          width="76"
          height="28"
          rx="14"
          fill="var(--color-fd-secondary)"
          stroke="var(--color-fd-border)"
        />
        <circle cx="375" cy="260" r="4" fill="#e23237" />
        <text x="386" y="264" fill="var(--color-fd-foreground)">
          Angular
        </text>
      </g>
    </svg>
  );
}
