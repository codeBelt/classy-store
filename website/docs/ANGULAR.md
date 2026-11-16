# Angular 22 integration

The `/angular` adapter supports **all stable Angular 22 releases**, with the
optional `@angular/core` peer set to `^22.0.0`. Angular 21 and earlier, Angular 23,
and prereleases are outside this support range. Keep your application's Angular
runtime and compiler packages aligned to the same release.

Development dependencies and the example stay pinned to Angular `22.2.3`; the
example uses matching CLI/build/compiler packages and TypeScript `6.0.3`.
Compatibility checks install the packed library into isolated consumers using
Angular `22.0.0` and `22.2.3`, compile the shared fixture with each version's
compiler, and test timing, inputs, computed values, keyed lists, zoneless
rendering, and cleanup. CI runs these six scenarios in Chromium for both versions;
the normal source suite also runs in Firefox and WebKit.

## Signals, inputs, and lists

Call `injectStore(store)` in an Angular injection context, such as a component
field initializer, constructor, or provider factory. It returns a readonly
`Signal<Snapshot<T>>`. Read `state()` in templates and Angular `computed()`
functions; write through the original store or its methods.

```ts
import {ChangeDetectionStrategy, Component, computed} from '@angular/core';
import {createClassyStore} from '@codebelt/classy-store';
import {injectStore} from '@codebelt/classy-store/angular';

class FormStore {
  text = 'Hello';
  enabled = true;
  items = [{id: 1, label: 'First item'}];

  get characterCount() {
    return this.text.length;
  }

  setText(text: string) {
    this.text = text;
  }
}

const formStore = createClassyStore(new FormStore());

@Component({
  selector: 'app-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label>
      Text
      <input [value]="state().text" (input)="setText($event)" />
    </label>
    <label>
      <input type="checkbox" [checked]="state().enabled"
        (change)="setEnabled($event)" />
      Enabled
    </label>
    <p>{{ uppercase() }} ({{ state().characterCount }} characters)</p>
    <ul>
      @for (item of state().items; track item.id) {
        <li>{{ item.label }}</li>
      }
    </ul>
  `,
})
export class FormComponent {
  readonly state = injectStore(formStore);
  readonly uppercase = computed(() => this.state().text.toUpperCase());

  setText(event: Event) {
    formStore.setText((event.target as HTMLInputElement).value);
  }

  setEnabled(event: Event) {
    formStore.enabled = (event.target as HTMLInputElement).checked;
  }
}
```

Snapshots are immutable. Do not bind `[(ngModel)]` to a snapshot field or try to
call `.set()` on the returned signal. Using stable, unique IDs in `@for` preserves
retained rows when arrays are reordered or replaced. Nested edits, insertions,
and removals through the store also update the snapshot.

## Timing and zoneless rendering

Store notifications update the Angular signal synchronously. Immediately after
an action, reading `state()` or a dependent `computed()` returns current values.
Angular still schedules and coalesces effects and DOM rendering. Multiple writes
are not a transaction: imperative reads between writes can see intermediate state.
Ordinary `subscribe(store, listener)` callbacks still batch in a microtask.

Angular 22 uses zoneless rendering by default. Bootstrap the standalone component
with `bootstrapApplication(FormComponent)` from `@angular/platform-browser`;
Zone.js is unnecessary. Signals read by a template notify Angular even when a
store changes from an external timer. The adapter does not force change detection.
When testing scheduled rendering, wait for `ApplicationRef.whenStable()` or
`ComponentFixture.whenStable()` instead of masking scheduling with manual
`detectChanges()` calls.

## Cleanup and migration

The subscription belongs to the injected `DestroyRef`. A component-scoped call
unsubscribes when that component is destroyed; a service or provider factory
uses its injector's lifetime. A root-provided service therefore keeps its
subscription until the application is destroyed. Separate calls subscribe
independently. Remounting reads the store's current state.

Calls outside an injection context or after its destruction throw without
registering a listener. Destroyed consumers ignore pending notifications,
including destruction during an in-progress store notification.

To migrate, update your Angular packages to the same stable Angular 22 release
and use its compatible TypeScript toolchain. The `injectStore(store)` signature and `/angular` import
path are unchanged. Signal reads now update immediately rather than waiting for
the core subscription microtask. There is no adapter timing option.

See the [Angular example](https://github.com/codeBelt/classy-store/tree/main/examples/angular)
for a zoneless application with inputs, a class getter, Angular computed state,
and keyed lists. Angular documents the
[zoneless scheduler](https://angular.dev/guide/zoneless) and
[DestroyRef lifecycle](https://angular.dev/api/core/DestroyRef).
