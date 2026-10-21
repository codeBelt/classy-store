import {notFound} from 'next/navigation';
import {FixtureStoreProvider} from '../../../components/shared/fixtureStoreProvider/FixtureStoreProvider';
import {StoreFields} from '../../../components/shared/storeFields/StoreFields';

type Props = {params: Promise<{route: string}>};

export const dynamic = 'force-dynamic';

export default async function WorkspacePage({params}: Props) {
  const {route} = await params;
  if (route !== 'alpha' && route !== 'beta') notFound();
  return (
    <FixtureStoreProvider
      key={route}
      initialData={{text: `${route}:initial`, count: 0}}
      scope="route"
    >
      <h2 data-testid="current-route">{route}</h2>
      <output data-testid="route-request-id">{crypto.randomUUID()}</output>
      <StoreFields prefix="route" />
    </FixtureStoreProvider>
  );
}
