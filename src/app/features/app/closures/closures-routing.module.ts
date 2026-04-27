import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ClosuresListPageComponent } from './pages/closures-list/closures-list-page.component';

const routes: Routes = [
  {
    path: '',
    component: ClosuresListPageComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ClosuresRoutingModule {}
