import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { roleGuard } from 'src/app/core/guards/role.guard';
import { ClientesDashboardComponent } from './clientes/pages/clientes-dashboard/clientes-dashboard.component';
import { FinanzasDashboardComponent } from './finanzas/pages/finanzas-dashboard/finanzas-dashboard.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'clientes' },
  { path: 'clientes', component: ClientesDashboardComponent },
  {
    path: 'finanzas',
    component: FinanzasDashboardComponent,
    canActivate: [roleGuard(['admin', 'trainer'])]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class EstadisticasRoutingModule {}
