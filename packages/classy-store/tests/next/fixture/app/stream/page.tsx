import {Suspense} from 'react';
import {ServerStream} from '../../components/pages/stream/serverStream/ServerStream';
import {FixtureStoreProvider} from '../../components/shared/fixtureStoreProvider/FixtureStoreProvider';
import {StoreSelector} from '../../components/shared/storeSelector/StoreSelector';

type Props = {searchParams: Promise<{seed?: string; ticket?: string}>};

export const dynamic = 'force-dynamic';

export default async function StreamPage({searchParams}: Props) {
  const {seed = 'stream', ticket} = await searchParams;
  return (
    <FixtureStoreProvider
      initialData={{text: `server:${seed}`, count: 0}}
      scope="stream"
    >
      <main>
        <h1>Streaming store hydration</h1>
        <StoreSelector testId="stream-restored-value" includeCount={true} />
        <Suspense
          fallback={<p data-testid="stream-fallback">Loading fields</p>}
        >
          <ServerStream ticket={ticket} />
        </Suspense>
      </main>
    </FixtureStoreProvider>
  );
}
