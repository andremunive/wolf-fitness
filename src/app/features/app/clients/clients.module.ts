import { NgModule } from '@angular/core';

import { SharedModule } from 'src/app/shared/shared.module';

import { ClientsRoutingModule } from './clients-routing.module';
import { ClientsListPageComponent } from './pages/clients-list/clients-list-page.component';
import { ClientsSearchBarComponent } from './components/clients-search-bar/clients-search-bar.component';
import { ClientsFiltersComponent } from './components/clients-filters/clients-filters.component';
import { ClientCardComponent } from './components/client-card/client-card.component';
import { ClientsTableComponent } from './components/clients-table/clients-table.component';
import { ClientsPaginationComponent } from './components/clients-pagination/clients-pagination.component';
import { ClientActionsMenuComponent } from './components/client-actions-menu/client-actions-menu.component';

@NgModule({
  declarations: [
    ClientsListPageComponent,
    ClientsSearchBarComponent,
    ClientsFiltersComponent,
    ClientCardComponent,
    ClientsTableComponent,
    ClientsPaginationComponent,
    ClientActionsMenuComponent
  ],
  imports: [
    SharedModule,
    ClientsRoutingModule
  ]
})
export class ClientsModule {}
