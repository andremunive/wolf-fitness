import { APP_INITIALIZER, ErrorHandler, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { CoreModule } from './core/core.module';
import {
  ConfigService,
  configInitializerFactory
} from './core/config/config.service';
import { GlobalErrorHandler } from './core/errors/global-error-handler';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, BrowserAnimationsModule, CoreModule, AppRoutingModule],
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: configInitializerFactory,
      deps: [ConfigService],
      multi: true
    },
    { provide: ErrorHandler, useClass: GlobalErrorHandler }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
