import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { GlobalLoaderComponent } from './components/global-loader/global-loader.component';
import { ToastHostComponent } from './components/toast-host/toast-host.component';
import { FocusTrapDirective } from './directives/focus-trap.directive';
import { ExpenseTypeLabelPipe } from './pipes/expense-type-label.pipe';

@NgModule({
  declarations: [
    GlobalLoaderComponent,
    ToastHostComponent,
    FocusTrapDirective,
    ExpenseTypeLabelPipe
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
    ExpenseTypeLabelPipe
  ]
})
export class SharedModule {}
