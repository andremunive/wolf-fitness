import { NgModule } from '@angular/core';

import { SharedModule } from 'src/app/shared/shared.module';

import { ServiceProvidersRoutingModule } from './service-providers-routing.module';

// Page
import { ServiceProvidersListPageComponent } from './pages/service-providers-list/service-providers-list-page.component';

// Components
import { ServiceProvidersSearchBarComponent } from './components/service-providers-search-bar/service-providers-search-bar.component';
import { ServiceProvidersFiltersComponent } from './components/service-providers-filters/service-providers-filters.component';
import { ServiceProvidersPaginationComponent } from './components/service-providers-pagination/service-providers-pagination.component';
import { ServiceProviderCardComponent } from './components/service-provider-card/service-provider-card.component';
import { ServiceProvidersTableComponent } from './components/service-providers-table/service-providers-table.component';
import { ServiceProviderActionsMenuComponent } from './components/service-provider-actions-menu/service-provider-actions-menu.component';
import { NewServiceProviderWizardComponent } from './components/new-service-provider-wizard/new-service-provider-wizard.component';
import { ServiceProviderCreatedModalComponent } from './components/service-provider-created-modal/service-provider-created-modal.component';
import { EditServiceProviderModalComponent } from './components/edit-service-provider-modal/edit-service-provider-modal.component';
import { ServiceProviderBankAccountsModalComponent } from './components/service-provider-bank-accounts-modal/service-provider-bank-accounts-modal.component';
import { ServiceTypesManagementModalComponent } from './components/service-types-management-modal/service-types-management-modal.component';

@NgModule({
  declarations: [
    ServiceProvidersListPageComponent,
    ServiceProvidersSearchBarComponent,
    ServiceProvidersFiltersComponent,
    ServiceProvidersPaginationComponent,
    ServiceProviderCardComponent,
    ServiceProvidersTableComponent,
    ServiceProviderActionsMenuComponent,
    NewServiceProviderWizardComponent,
    ServiceProviderCreatedModalComponent,
    EditServiceProviderModalComponent,
    ServiceProviderBankAccountsModalComponent,
    ServiceTypesManagementModalComponent
  ],
  imports: [
    SharedModule,
    ServiceProvidersRoutingModule
  ]
})
export class ServiceProvidersModule {}
