import { NgModule } from '@angular/core';
import { NgChartsModule } from 'ng2-charts';

import { SharedModule } from 'src/app/shared/shared.module';

import { EstadisticasRoutingModule } from './estadisticas-routing.module';
import { ClientesDashboardComponent } from './clientes/pages/clientes-dashboard/clientes-dashboard.component';
import { FinanzasDashboardComponent } from './finanzas/pages/finanzas-dashboard/finanzas-dashboard.component';

@NgModule({
  declarations: [ClientesDashboardComponent, FinanzasDashboardComponent],
  imports: [SharedModule, EstadisticasRoutingModule, NgChartsModule]
})
export class EstadisticasModule {}
