import {ChangeDetectionStrategy, Component, signal} from '@angular/core';
import {AngularForm} from '../angularForm/AngularForm';

@Component({
  selector: 'angular-root',
  imports: [AngularForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (id of consumers(); track id) { <section [attr.data-consumer]="id"><angular-form /></section> }`,
})
export class AngularRoot {
  readonly consumers = signal([1]);
}
