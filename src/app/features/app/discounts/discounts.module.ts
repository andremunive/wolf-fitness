import { NgModule } from '@angular/core';

import { SharedModule } from 'src/app/shared/shared.module';

import { DiscountsRoutingModule } from './discounts-routing.module';
import { DiscountsListPageComponent } from './pages/discounts-list/discounts-list-page.component';
import { DiscountFormModalComponent } from './components/discount-form-modal/discount-form-modal.component';

@NgModule({
  declarations: [
    DiscountsListPageComponent,
    DiscountFormModalComponent
  ],
  imports: [
    SharedModule,
    DiscountsRoutingModule
  ]
})
export class DiscountsModule {}
