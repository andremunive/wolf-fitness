import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { VentasComponent } from './pages/ventas/ventas.component';
import { CatalogoComponent } from './pages/catalogo/catalogo.component';
import { InsumosComponent } from './pages/insumos/insumos.component';
import { CierresComponent } from './pages/cierres/cierres.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'ventas' },
  { path: 'ventas', component: VentasComponent },
  { path: 'catalogo', component: CatalogoComponent },
  { path: 'insumos', component: InsumosComponent },
  { path: 'cierres', component: CierresComponent },
  { path: 'dashboard', component: DashboardComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CafeteriaRoutingModule {}
