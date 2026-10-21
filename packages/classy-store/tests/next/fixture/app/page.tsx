import {FixtureStoreProvider} from '../components/shared/fixtureStoreProvider/FixtureStoreProvider';
import {StoreFields} from '../components/shared/storeFields/StoreFields';
import {createServerProof} from '../utils/serverProof/serverProof';

type Props = {searchParams: Promise<{seed?: string}>};

export const dynamic = 'force-dynamic';

export default async function HomePage({searchParams}: Props) {
  const {seed = 'home'} = await searchParams;
  const data = await createServerProof(seed);
  return (
    <main>
      <h1>Packed App Router consumer</h1>
      <output data-testid="request-seed">{data.seed}</output>
      <output data-testid="server-imports">{data.proof}</output>
      <FixtureStoreProvider initialData={data.initialData} scope="request">
        <StoreFields prefix="request" />
      </FixtureStoreProvider>
    </main>
  );
}
