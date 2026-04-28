import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ExpenseRecordsListPageComponent } from './pages/expense-records-list/expense-records-list-page.component';

const routes: Routes = [
  { path: '', component: ExpenseRecordsListPageComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ExpenseRecordsRoutingModule {}
