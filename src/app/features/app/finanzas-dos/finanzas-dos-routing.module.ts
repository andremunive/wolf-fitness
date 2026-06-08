import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { EstadoResultadosComponent } from './pages/estado-resultados/estado-resultados.component';
import { FlujoCajaComponent } from './pages/flujo-caja/flujo-caja.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'estado-de-resultados' },
  { path: 'estado-de-resultados', component: EstadoResultadosComponent },
  { path: 'flujo-de-caja', component: FlujoCajaComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FinanzasDosRoutingModule {}
