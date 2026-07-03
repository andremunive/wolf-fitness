import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { GlobalLoaderComponent } from './components/global-loader/global-loader.component';
import { ToastHostComponent } from './components/toast-host/toast-host.component';
import { FocusTrapDirective } from './directives/focus-trap.directive';
import { ExpenseTypeLabelPipe } from './pipes/expense-type-label.pipe';
import { CopCurrencyPipe } from './pipes/cop-currency.pipe';
import { VisibleCopPipe } from './pipes/visible-cop.pipe';
import { LocalDatePipe } from './pipes/local-date.pipe';
import { StatusLabelPipe } from './pipes/status-label.pipe';
import { PaymentMethodLabelPipe } from './pipes/payment-method-label.pipe';
import { DeltaClassPipe } from './pipes/delta-class.pipe';
import { DeltaArrowPipe } from './pipes/delta-arrow.pipe';
import { ShortMonthPipe } from './pipes/short-month.pipe';

@NgModule({
  declarations: [
    GlobalLoaderComponent,
    ToastHostComponent,
    FocusTrapDirective,
    ExpenseTypeLabelPipe,
    CopCurrencyPipe,
    VisibleCopPipe,
    LocalDatePipe,
    StatusLabelPipe,
    PaymentMethodLabelPipe,
    DeltaClassPipe,
    DeltaArrowPipe,
    ShortMonthPipe
  ],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    GlobalLoaderComponent,
    ToastHostComponent,
    FocusTrapDirective,
    ExpenseTypeLabelPipe,
    CopCurrencyPipe,
    VisibleCopPipe,
    LocalDatePipe,
    StatusLabelPipe,
    PaymentMethodLabelPipe,
    DeltaClassPipe,
    DeltaArrowPipe,
    ShortMonthPipe
  ]
})
export class SharedModule {}
