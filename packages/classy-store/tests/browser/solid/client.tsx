import {render} from '@solidjs/web';
import {SolidForm} from './components/solidForm/SolidForm';
import {lifecycleProbe} from './lifecycleProbe';
import {formStore, getProbe} from './solid.store';

const target = document.getElementById('solid-root');
if (!target) throw new Error('Missing Solid root');
let dispose: (() => void) | undefined;
const solidProbe = {
  getState: getProbe,
  lifecycle: lifecycleProbe,
  setText: (text: string) => formStore.setText(text),
  mount() {
    if (dispose) throw new Error('Solid fixture is already mounted');
    dispose = render(() => <SolidForm />, target);
  },
  unmount() {
    if (!dispose) throw new Error('Solid fixture is not mounted');
    dispose();
    dispose = undefined;
  },
};
declare global {
  interface Window {
    solidProbe: typeof solidProbe;
  }
}
window.solidProbe = solidProbe;
solidProbe.mount();
