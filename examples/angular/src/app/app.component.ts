import {ChangeDetectionStrategy, Component, computed} from '@angular/core';
import {injectStore} from '@codebelt/classy-store/angular';
import {counterStore, history} from '../store';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="font-family: sans-serif; max-width: 480px; margin: 40px auto; padding: 0 16px">
      <h1>{{ snap().label }}</h1>
      <p>Count: <strong>{{ snap().count }}</strong> · Doubled: <strong>{{ snap().doubled }}</strong></p>

      <p>{{ summary() }}</p>

      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px">
        <button (click)="counterStore.increment()">+{{ snap().step }}</button>
        <button (click)="counterStore.decrement()">-{{ snap().step }}</button>
        <button (click)="counterStore.reset()">Reset</button>
        <button (click)="history.undo()">Undo</button>
        <button (click)="history.redo()">Redo</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px">
        <label>
          Label:
          <input
            [value]="snap().label"
            (input)="setLabel($event)"
            style="margin-left: 8px"
          />
        </label>
        <label>
          Step:
          <input
            type="number"
            [value]="snap().step"
            (input)="setStep($event)"
            style="margin-left: 8px; width: 60px"
          />
        </label>
        <label>
          <input type="checkbox" [checked]="snap().enabled" (change)="setEnabled($event)" />
          Enabled
        </label>
      </div>
      <ul>
        @for (item of snap().items; track item.id) { <li>{{ item.label }}</li> }
      </ul>
      <button (click)="counterStore.addItem()">Add item</button>
      <button (click)="counterStore.reverseItems()">Reverse items</button>
    </div>
  `,
})
export class AppComponent {
  readonly snap = injectStore(counterStore);
  readonly summary = computed(
    () =>
      `${this.snap().label}: ${this.snap().enabled ? 'enabled' : 'disabled'}`,
  );
  readonly counterStore = counterStore;
  readonly history = history;

  setLabel(event: Event) {
    counterStore.setLabel((event.target as HTMLInputElement).value);
  }
  setStep(event: Event) {
    counterStore.setStep(Number((event.target as HTMLInputElement).value));
  }
  setEnabled(event: Event) {
    counterStore.enabled = (event.target as HTMLInputElement).checked;
  }
}
