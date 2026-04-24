import { NgModule } from '@angular/core';
import { SharedModule } from 'src/app/shared/shared.module';

import { AppFeatureRoutingModule } from './app-feature-routing.module';
import { HomePageComponent } from './pages/home/home-page.component';

@NgModule({
  declarations: [HomePageComponent],
  imports: [SharedModule, AppFeatureRoutingModule]
})
export class AppFeatureModule {}
