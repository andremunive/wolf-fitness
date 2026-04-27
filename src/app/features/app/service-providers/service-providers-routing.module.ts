import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ServiceProvidersListPageComponent } from './pages/service-providers-list/service-providers-list-page.component';

const routes: Routes = [
  {
    path: '',
    component: ServiceProvidersListPageComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ServiceProvidersRoutingModule {}
