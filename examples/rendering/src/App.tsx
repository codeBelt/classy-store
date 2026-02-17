// This component must be the top-most import in this file!
import {ReactScan} from './components/ReactScan';
import './index.css';
import {Layout} from './components/Layout';
import {useHashRoute} from './hooks/useHashRoute';
import {CollectionsPage} from './pages/CollectionsPage';
import {DevtoolsPage} from './pages/DevtoolsPage';
import {HistoryPage} from './pages/HistoryPage';
import {OverviewPage} from './pages/OverviewPage';
import {PersistPage} from './pages/PersistPage';
import {ReactivityPage} from './pages/ReactivityPage';
import {ShallowEqualPage} from './pages/ShallowEqualPage';
import {SnapshotsPage} from './pages/SnapshotsPage';
import {SubscribeKeyPage} from './pages/SubscribeKeyPage';
import {UseLocalStorePage} from './pages/UseLocalStorePage';

const routes: Record<string, React.ComponentType> = {
  '/': OverviewPage,
  '/reactivity': ReactivityPage,
  '/collections': CollectionsPage,
  '/snapshots': SnapshotsPage,
  '/use-local-store': UseLocalStorePage,
  '/persist': PersistPage,
  '/history': HistoryPage,
  '/devtools': DevtoolsPage,
  '/subscribe-key': SubscribeKeyPage,
  '/shallow-equal': ShallowEqualPage,
};

export function App() {
  const route = useHashRoute();
  const Page = routes[route] ?? OverviewPage;

  return (
    <Layout route={route}>
      <ReactScan />
      <Page />
    </Layout>
  );
}

export default App;
