import {mount, unmount} from 'svelte';
import SvelteForm from './SvelteForm.svelte';
import {formStore, getProbe} from './svelte.store';

const target = document.getElementById('svelte-root');
if (!target) throw new Error('Missing Svelte root');
let component: ReturnType<typeof mount> | undefined;

const svelteProbe = {
  getState: getProbe,
  setText: (text: string) => formStore.setText(text),
  mount() {
    if (component) throw new Error('Svelte fixture is already mounted');
    component = mount(SvelteForm, {target});
  },
  async unmount() {
    if (!component) throw new Error('Svelte fixture is not mounted');
    await unmount(component);
    component = undefined;
  },
};

declare global {
  interface Window {
    svelteProbe: typeof svelteProbe;
  }
}

window.svelteProbe = svelteProbe;
svelteProbe.mount();
