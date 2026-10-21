import {createRoot} from 'react-dom/client';
import {PersistenceForm} from './components/persistenceForm/PersistenceForm';
import {persistence} from './persistence.store';

await persistence.hydrated;
const container = document.getElementById('root');
if (!container) throw new Error('Missing persistence fixture root');
createRoot(container).render(<PersistenceForm />);
