import { enableProdMode } from '@angular/core';
import { platformBrowser } from '@angular/platform-browser';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

platformBrowser().bootstrapModule(AppModule, { ngZone: 'zone.js' })
  .catch(err => console.log(err));
