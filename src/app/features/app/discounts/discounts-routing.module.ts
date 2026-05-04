import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { DiscountsListPageComponent } from './pages/discounts-list/discounts-list-page.component';

const routes: Routes = [
  {
    path: '',
    component: DiscountsListPageComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DiscountsRoutingModule {}
