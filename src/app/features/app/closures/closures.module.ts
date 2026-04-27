import { NgModule } from '@angular/core';

import { SharedModule } from 'src/app/shared/shared.module';

import { ClosuresRoutingModule } from './closures-routing.module';
import { ClosuresListPageComponent } from './pages/closures-list/closures-list-page.component';
import { MonthNavigatorComponent } from './components/month-navigator/month-navigator.component';
import { TrainerClosureCardComponent } from './components/trainer-closure-card/trainer-closure-card.component';
import { ClosureDetailModalComponent } from './components/closure-detail-modal/closure-detail-modal.component';
import { ClosureAdjustmentFormComponent } from './components/closure-adjustment-form/closure-adjustment-form.component';
import { ClosuresHistoryTableComponent } from './components/closures-history-table/closures-history-table.component';

@NgModule({
  declarations: [
    ClosuresListPageComponent,
    MonthNavigatorComponent,
    TrainerClosureCardComponent,
    ClosureDetailModalComponent,
    ClosureAdjustmentFormComponent,
    ClosuresHistoryTableComponent
  ],
  imports: [
    SharedModule,
    ClosuresRoutingModule
  ]
})
export class ClosuresModule {}
