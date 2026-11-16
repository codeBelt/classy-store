import {createApp} from 'vue';
import VueForm from './VueForm.vue';
import {formStore, getProbe} from './vue.store';

const target = document.getElementById('vue-root');
if (!target) throw new Error('Missing Vue root');
let app: ReturnType<typeof createApp> | undefined;
const vueProbe = {
  getState: getProbe,
  setText: (text: string) => formStore.setText(text),
  mount() {
    if (app) throw new Error('Vue fixture is already mounted');
    app = createApp(VueForm);
    app.config.warnHandler = (message) => {
      throw new Error(`Vue warning: ${message}`);
    };
    app.mount(target);
  },
  unmount() {
    if (!app) throw new Error('Vue fixture is not mounted');
    app.unmount();
    app = undefined;
  },
};
declare global {
  interface Window {
    vueProbe: typeof vueProbe;
  }
}
window.vueProbe = vueProbe;
vueProbe.mount();
