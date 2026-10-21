import type {ReactNode} from 'react';
import {WorkspaceRefresh} from '../../components/pages/workspace/workspaceRefresh/WorkspaceRefresh';
import {FixtureStoreProvider} from '../../components/shared/fixtureStoreProvider/FixtureStoreProvider';
import {StoreFields} from '../../components/shared/storeFields/StoreFields';

export default function WorkspaceLayout({children}: {children: ReactNode}) {
  return (
    <FixtureStoreProvider
      initialData={{text: 'shared:initial', count: 0}}
      scope="shared"
    >
      <main>
        <h1>Shared workspace</h1>
        <StoreFields prefix="workspace-shared" />
        <WorkspaceRefresh />
        {children}
      </main>
    </FixtureStoreProvider>
  );
}
