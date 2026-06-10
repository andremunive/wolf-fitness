import { NgModule } from '@angular/core';

import { SharedModule } from 'src/app/shared/shared.module';

import { ContabilidadRoutingModule } from './contabilidad-routing.module';
import { EstadoResultadosComponent } from './pages/estado-resultados/estado-resultados.component';
import { FlujoCajaComponent } from './pages/flujo-caja/flujo-caja.component';

@NgModule({
  declarations: [EstadoResultadosComponent, FlujoCajaComponent],
  imports: [SharedModule, ContabilidadRoutingModule]
})
export class ContabilidadModule {}
