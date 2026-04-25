import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { TrainersListPageComponent } from './pages/trainers-list/trainers-list-page.component';

const routes: Routes = [
  {
    path: '',
    component: TrainersListPageComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TrainersRoutingModule {}
