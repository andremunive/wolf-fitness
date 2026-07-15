import { NgModule } from '@angular/core';

import { SharedModule } from 'src/app/shared/shared.module';

import { CafeteriaRoutingModule } from './cafeteria-routing.module';
import { VentasComponent } from './pages/ventas/ventas.component';
import { CatalogoComponent } from './pages/catalogo/catalogo.component';
import { InsumosComponent } from './pages/insumos/insumos.component';
import { CierresComponent } from './pages/cierres/cierres.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { CatalogoActionsMenuComponent } from './components/catalogo-actions-menu/catalogo-actions-menu.component';
import { CatalogoCombosActionsMenuComponent } from './components/catalogo-combos-actions-menu/catalogo-combos-actions-menu.component';
import { VentasActionsMenuComponent } from './components/ventas-actions-menu/ventas-actions-menu.component';
import { VentasCombosActionsMenuComponent } from './components/ventas-combos-actions-menu/ventas-combos-actions-menu.component';
import { InsumosActionsMenuComponent } from './components/insumos-actions-menu/insumos-actions-menu.component';
import { VentasPaginationComponent } from './components/ventas-pagination/ventas-pagination.component';

@NgModule({
  declarations: [
    VentasComponent,
    CatalogoComponent,
    InsumosComponent,
    CierresComponent,
    DashboardComponent,
    CatalogoActionsMenuComponent,
    CatalogoCombosActionsMenuComponent,
    VentasActionsMenuComponent,
    VentasCombosActionsMenuComponent,
    InsumosActionsMenuComponent,
    VentasPaginationComponent
  ],
  imports: [SharedModule, CafeteriaRoutingModule]
})
export class CafeteriaModule {}
