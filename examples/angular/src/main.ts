import {bootstrapApplication} from '@angular/platform-browser';
import {AppComponent} from './app/app.component';

// Angular 22 is zoneless by default; template signals schedule rendering.
bootstrapApplication(AppComponent).catch((error) => console.error(error));
