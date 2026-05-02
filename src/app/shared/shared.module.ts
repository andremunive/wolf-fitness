import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { GlobalLoaderComponent } from './components/global-loader/global-loader.component';
import { ToastHostComponent } from './components/toast-host/toast-host.component';
import { FocusTrapDirective } from './directives/focus-trap.directive';

@NgModule({
  declarations: [GlobalLoaderComponent, ToastHostComponent, FocusTrapDirective],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    GlobalLoaderComponent,
    ToastHostComponent,
    FocusTrapDirective
  ]
})
export class SharedModule {}
