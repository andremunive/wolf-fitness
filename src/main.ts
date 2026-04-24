import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { isSilenceableError } from './app/core/errors/is-silenceable-error';

// Install noise filters BEFORE Angular bootstraps so the browser's own
// console output for third-party / gotrue-js auto-refresh rejections is
// suppressed (Zone.js + ErrorHandler run too late to hide them).
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (isSilenceableError(event.reason)) {
      event.preventDefault();
    }
  });

  window.addEventListener('error', (event) => {
    if (isSilenceableError(event.error ?? event.message)) {
      event.preventDefault();
    }
  });
}

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch((err) => console.error(err));
