import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { PrestamosListComponent } from './pages/prestamos-list/prestamos-list.component';

const routes: Routes = [
  { path: '', component: PrestamosListComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PrestamosRoutingModule {}
