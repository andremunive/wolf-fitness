import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { GlobalLoaderComponent } from './components/global-loader/global-loader.component';
import { FocusTrapDirective } from './directives/focus-trap.directive';

@NgModule({
  declarations: [GlobalLoaderComponent, FocusTrapDirective],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    GlobalLoaderComponent,
    FocusTrapDirective
  ]
})
export class SharedModule {}
