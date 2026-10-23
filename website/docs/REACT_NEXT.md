# Next.js App Router

Pass initial data from a Server Component to a Client Component, then construct
the class store inside the client boundary. That component also renders on the
server for the initial request, so prepare its snapshot before persistence or
other effects start. The browser constructs its own store from the same data.

Do not pass a store proxy or class instance across the React Server Component
boundary. Use a plain data object containing the fields the client needs.
React defines the supported [serializable prop types](https://react.dev/reference/rsc/use-client#serializable-types-returned-by-server-components).

## Package boundaries

| Entry | App Router use |
| --- | --- |
| `@codebelt/classy-store` | Core store creation and snapshots in server or client modules. |
| `@codebelt/classy-store/collections` | Reactive collections in server or client modules. |
| `@codebelt/classy-store/utils` | Server-safe imports; configure browser storage and effects inside Client Components. |
| `@codebelt/classy-store/react` | Client hooks. The published ESM and CommonJS entries carry `use client`. |
| `@codebelt/classy-store/react/server` | `prepareStoreForHydration` without importing React hooks; safe in Server Components and ordinary SSR code. |

Components that use hooks still need their own client boundary. Do not call
`useClassyStore`, `useLocalStore`, or `createStoreHook` in a Server Component.
Preparing a store in an RSC module does not transfer that store or its capture
to the browser; initialize and prepare the browser counterpart separately.
Both preparation exports use the same capture cache within a module graph.

## A route-owned store

Define the class in a regular module that has no browser effects:

```ts
// stores/profile/profile.store.ts
export type ProfileData = {name: string; visits: number};

export class ProfileStore {
  name: string;
  visits: number;

  constructor(initialData: ProfileData) {
    this.name = initialData.name;
    this.visits = initialData.visits;
  }

  recordVisit() {
    this.visits++;
  }
}
```

Construct and prepare it inside the Client Component:

```tsx
// components/profileEditor/ProfileEditor.tsx
'use client';

import {useClassyStore, useLocalStore} from '@codebelt/classy-store/react';
import {prepareStoreForHydration} from '@codebelt/classy-store/react/server';
import {type ProfileData, ProfileStore} from '../../stores/profile/profile.store';

export function ProfileEditor({initialData}: {initialData: ProfileData}) {
  const store = prepareStoreForHydration(
    useLocalStore(() => new ProfileStore(initialData)),
  );
  const state = useClassyStore(store);

  return (
    <div>
      <input
        aria-label="Name"
        value={state.name}
        onChange={(event) => { store.name = event.target.value; }}
      />
      <button type="button" onClick={() => store.recordVisit()}>
        Visits: {state.visits}
      </button>
    </div>
  );
}
```

The Server Component supplies data and an intentional reset key:

```tsx
// app/profile/page.tsx
import {ProfileEditor} from '../../components/profileEditor/ProfileEditor';

type Props = {searchParams: Promise<{name?: string}>};

export default async function ProfilePage({searchParams}: Props) {
  const {name = 'Ada'} = await searchParams;
  return <ProfileEditor key={name} initialData={{name, visits: 0}} />;
}
```

The key determines when a mounted editor gets a new store. A new `initialData`
object alone does not reset `useLocalStore` or its prepared snapshot. Avoid
module-level server stores; construct request state inside the request instead.

## Streaming, persistence, and navigation

Attach persistence in an effect after preparation, call `rehydrate()` there,
and call `handle.dispose()` during cleanup. The [SSR guide](./REACT_SSR.md) shows
this pattern. If persistence restores before a streamed boundary hydrates,
the boundary first reads the prepared server data, then catches up to live
state. Keep the initial server and browser payloads identical.

For a store shared across routes, place its Client Provider in the appropriate
layout. Put route-specific providers below that layout and use keys when a
route identity change should reset them. See the [typed context example](./REACT_SCOPING.md).
`router.refresh()` merges new server output; it does not inherently reset a
mounted client store. Choose explicitly whether refreshed data should update
the existing store or replace its provider via a key.

The integration tests use the default App Router configuration with
`cacheComponents: false`. With Cache Components enabled, Next.js can use React
Activity to preserve hidden route state while cleaning up its effects. Returning
to a hidden route can resume the same store; effect cleanup does not necessarily
mean the instance was destroyed. See [Next.js state preservation](https://nextjs.org/docs/app/guides/preserving-ui-state).

## Tested package consumer

Run `bun run test:react:next` from the repository root. It installs the package
tarball into an isolated Next.js 16.4.2 / React 19.3.1 app and runs clean
production Turbopack builds with React Compiler off and on. Tests verify the
actual compiler-generated selector and tracking functions, request isolation,
real inputs, streamed response ordering, delayed hydration without replacing
server DOM, navigation, refresh, and persistence cleanup. They also exercise
the server-safe APIs under React's `react-server` export condition and verify
shared hydration captures across public entry points.

This matrix covers the stated versions and default navigation behavior. It
does not establish compatibility with every Next.js version, bundler, or
Cache Components configuration.

Next App Router can supply its own React runtime. The test evidence records the
actual browser `React.version`; this Next.js version uses
`19.3.0-canary-278794d7-20261002`, while the installed React package is 19.3.1.
