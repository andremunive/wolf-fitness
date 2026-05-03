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
import { ClientSearchInputComponent } from './components/client-search-input/client-search-input.component';
import { NewClientWizardComponent } from './components/new-client-wizard/new-client-wizard.component';
import { ClientCreatedModalComponent } from './components/client-created-modal/client-created-modal.component';
import { EditClientModalComponent } from './components/edit-client-modal/edit-client-modal.component';
import { RegisterPaymentModalComponent } from './components/register-payment-modal/register-payment-modal.component';
import { RegisterInstallmentModalComponent } from './components/register-installment-modal/register-installment-modal.component';
import { PaymentSuccessModalComponent } from './components/payment-success-modal/payment-success-modal.component';
// Measurements sub-feature
import { MeasurementsHubModalComponent } from './measurements/components/measurements-hub-modal/measurements-hub-modal.component';
import { RegisterMeasurementModalComponent } from './measurements/components/register-measurement-modal/register-measurement-modal.component';
import { ViewMeasurementsModalComponent } from './measurements/components/view-measurements-modal/view-measurements-modal.component';
import { CompareMeasurementsModalComponent } from './measurements/components/compare-measurements-modal/compare-measurements-modal.component';
import { LastValueTooltipComponent } from './measurements/components/last-value-tooltip/last-value-tooltip.component';
import { MeasurementShareModalComponent } from './measurements/components/measurement-share-modal/measurement-share-modal.component';

@NgModule({
  declarations: [
    ClientsListPageComponent,
    ClientsSearchBarComponent,
    ClientsFiltersComponent,
    ClientCardComponent,
    ClientsTableComponent,
    ClientsPaginationComponent,
    ClientActionsMenuComponent,
    ClientSearchInputComponent,
    NewClientWizardComponent,
    ClientCreatedModalComponent,
    EditClientModalComponent,
    RegisterPaymentModalComponent,
    RegisterInstallmentModalComponent,
    PaymentSuccessModalComponent,
    // Measurements
    MeasurementsHubModalComponent,
    RegisterMeasurementModalComponent,
    ViewMeasurementsModalComponent,
    CompareMeasurementsModalComponent,
    LastValueTooltipComponent,
    MeasurementShareModalComponent
  ],
  imports: [
    SharedModule,
    ClientsRoutingModule
  ]
})
export class ClientsModule {}
