# Brief: a development build and its diagnostics

- **Report:** `review/stage-3/devbuild.md`
- **Scratch folder:** `<scratch>/stage-3-devbuild/`
- **Skill to load first:** `mattpocock-skills:prototype`, then
  `api-and-interface-design`
- **Spikes:** yes, as the common brief describes.

## Subject

API question 8 in `REVIEW_PLAN.md`. The library has no convention for
development-only code today. Every stage 2 report lists diagnostics that would
catch a silent failure; `review/stage-3/merged.md`, if it exists, has them in
one place under "diagnostics and a development build". Read
`packages/classy-store/package.json` (exports), `tsdown.config.ts`,
`src/storeRuntime.ts` and the `#store-runtime` import, and
`packages/classy-store/tests/size/`.

## The work

**B1. How the build is split.** Compare, by building each in the worktree: an
inline `process.env.NODE_ENV !== 'production'` check left for the
application's bundler (Vue's bundler build, Legend-State, Zustand, Jotai);
`development` and `production` export conditions that select separate files
(Solid, Vue's Node builds); and no split, with every check always on. For
each: bytes per entry in production, what an application that uses Vite,
Next.js, a plain Node script, Bun, and a browser `<script type="module">`
actually loads, and what `bun run check:package` (publint and
arethetypeswrong) says. `review/stage-2/solid.md` finding 9 and
`review/stage-2/vue-reactivity.md` question 8 describe two working setups.

**B2. Codes and messages.** Solid, Svelte and Immer give each diagnostic a
stable code. The Signals report warns that hiding the message text behind the
development flag leaves production errors empty. Propose a format, and say
which messages stay in production.

**B3. The list.** Every diagnostic a report proposed, deduplicated, each with:
the silent failure it catches, where the check would live, whether it is an
error or a warning, whether it needs the development build or is cheap enough
to be always on, and its cost in bytes and in time on the hot path. Spike the
five you think matter most and measure them.

Then your recommendation: the split, the format, which diagnostics for 1.0,
and what the size budgets in `CONSTRAINTS.md` would have to become.
