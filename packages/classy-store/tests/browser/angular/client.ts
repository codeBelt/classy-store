import type {ApplicationRef, ComponentRef} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {formStore, getProbe} from './angular.store';
import {AngularRoot} from './components/angularRoot/AngularRoot';

let app: ApplicationRef | undefined;
let root: ComponentRef<AngularRoot> | undefined;
const angularProbe = {
  getState: getProbe,
  setText: (text: string) => formStore.setText(text),
  addItem() {
    formStore.items.push({id: 3, label: 'Three'});
  },
  renameFirst() {
    formStore.items[0].label = 'Renamed';
  },
  reverseItems() {
    formStore.items.reverse();
  },
  removeFirst() {
    formStore.items.splice(0, 1);
  },
  replaceItems() {
    formStore.items = [
      {id: 2, label: 'Two replaced'},
      {id: 4, label: 'Four'},
    ];
  },
  setConsumers(ids: number[]) {
    if (!root) throw new Error('Missing root');
    root.instance.consumers.set(ids);
  },
  async stable() {
    if (!app) throw new Error('Angular fixture is not mounted');
    await app.whenStable();
  },
  async mount() {
    if (app) throw new Error('Angular fixture is already mounted');
    if (!document.querySelector('angular-root'))
      document.body.appendChild(document.createElement('angular-root'));
    app = await bootstrapApplication(AngularRoot);
    root = app.components[0] as ComponentRef<AngularRoot>;
    await app.whenStable();
  },
  unmount() {
    if (!app) throw new Error('Angular fixture is not mounted');
    app.destroy();
    app = undefined;
    root = undefined;
  },
};
declare global {
  interface Window {
    angularProbe: typeof angularProbe;
  }
}
window.angularProbe = angularProbe;
await angularProbe.mount();
