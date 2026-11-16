import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
} from '@angular/core';
import {injectStore} from '@codebelt/classy-store/angular';
import {formStore, probe} from '../../angular.store';

@Component({
  selector: 'angular-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label>Text <input [value]="state().text" (input)="setText($event)" /></label>
    <label>Enabled <input type="checkbox" [checked]="state().enabled" (change)="setEnabled($event)" /></label>
    <output data-testid="enabled">{{ state().enabled }}</output>
    <output data-testid="uppercase">{{ uppercase() }}</output>
    <output data-testid="summary">{{ summary() }}</output>
    <output data-testid="item-count">{{ state().items.length }}</output>
    <ul>@for (item of state().items; track item.id) { <li [attr.data-id]="item.id">{{ item.label }}</li> }</ul>
    <button (click)="updateTogether()">Update together</button>
  `,
})
export class AngularForm {
  readonly state = injectStore(formStore);
  readonly uppercase = computed(() => this.state().text.toUpperCase());
  readonly summary = computed(
    () => `${this.state().text}:${this.state().doubled}:${this.uppercase()}`,
  );
  constructor() {
    effect(() => {
      probe.effects.push(this.summary());
    });
  }
  setText(event: Event) {
    formStore.setText((event.target as HTMLInputElement).value);
  }
  setEnabled(event: Event) {
    formStore.enabled = (event.target as HTMLInputElement).checked;
  }
  updateTogether() {
    formStore.text = 'updated';
    formStore.count = 2;
    formStore.count = 3;
    probe.snapshotDuringEvent = this.summary();
    probe.coreDuringEvent = probe.coreNotifications;
  }
}
