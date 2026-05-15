import { NgModule } from '@angular/core';

import { SharedModule } from 'src/app/shared/shared.module';

import { PrestamosRoutingModule } from './prestamos-routing.module';
import { PrestamosListComponent } from './pages/prestamos-list/prestamos-list.component';
import { NewLoanModalComponent } from './components/new-loan-modal/new-loan-modal.component';
import { LoanActionsMenuComponent } from './components/loan-actions-menu/loan-actions-menu.component';
import { LoanDetailModalComponent } from './components/loan-detail-modal/loan-detail-modal.component';
import { LoanPaymentModalComponent } from './components/loan-payment-modal/loan-payment-modal.component';
import { LoanEditModalComponent } from './components/loan-edit-modal/loan-edit-modal.component';
import { LoanCloseModalComponent } from './components/loan-close-modal/loan-close-modal.component';

@NgModule({
  declarations: [
    PrestamosListComponent,
    NewLoanModalComponent,
    LoanActionsMenuComponent,
    LoanDetailModalComponent,
    LoanPaymentModalComponent,
    LoanEditModalComponent,
    LoanCloseModalComponent
  ],
  imports: [
    SharedModule,
    PrestamosRoutingModule
  ]
})
export class PrestamosModule {}
