import {hydrateRoot} from 'react-dom/client';
import {HydrationApp} from './components/hydrationApp/HydrationApp';
import {createHydrationRuntime, type HydrationData} from './hydration.store';

const container = document.getElementById('hydration-root');
const initialDataElement = document.getElementById('initial-data');
if (!container || !initialDataElement?.textContent) {
  throw new Error('Missing server hydration fixture');
}
const initialData: HydrationData = JSON.parse(initialDataElement.textContent);
const runtime = createHydrationRuntime(initialData, true);
runtime.probe.serverElements = [...container.querySelectorAll('output, input')];
window.hydrationRuntime = runtime;
hydrateRoot(container, <HydrationApp runtime={runtime} />, {
  onRecoverableError(error) {
    runtime.probe.recoverableErrors.push(String(error));
  },
});
