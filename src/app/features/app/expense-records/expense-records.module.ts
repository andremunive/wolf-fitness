import { NgModule } from '@angular/core';

import { SharedModule } from 'src/app/shared/shared.module';

import { ExpenseRecordsRoutingModule } from './expense-records-routing.module';
import { ExpenseRecordsListPageComponent } from './pages/expense-records-list/expense-records-list-page.component';
import { NewExpenseRecordModalComponent } from './components/new-expense-record-modal/new-expense-record-modal.component';
import { EditExpenseRecordModalComponent } from './components/edit-expense-record-modal/edit-expense-record-modal.component';
import { ExpenseCategoryAutocompleteComponent } from './components/expense-category-autocomplete/expense-category-autocomplete.component';
import { ExpenseProviderAutocompleteComponent } from './components/expense-provider-autocomplete/expense-provider-autocomplete.component';
import { NewExpenseCategoryModalComponent } from './components/new-expense-category-modal/new-expense-category-modal.component';
import { ManageExpenseCategoriesModalComponent } from './components/manage-expense-categories-modal/manage-expense-categories-modal.component';
import { ExpensesSummaryCardComponent } from './components/expenses-summary-card/expenses-summary-card.component';
import { ExpensesSummaryChartComponent } from './components/expenses-summary-chart/expenses-summary-chart.component';
import { ExpenseRecordsTableComponent } from './components/expense-records-table/expense-records-table.component';
import { ExpenseRecordDetailModalComponent } from './components/expense-record-detail-modal/expense-record-detail-modal.component';

@NgModule({
  declarations: [
    ExpenseRecordsListPageComponent,
    NewExpenseRecordModalComponent,
    EditExpenseRecordModalComponent,
    ExpenseCategoryAutocompleteComponent,
    ExpenseProviderAutocompleteComponent,
    NewExpenseCategoryModalComponent,
    ManageExpenseCategoriesModalComponent,
    ExpensesSummaryCardComponent,
    ExpensesSummaryChartComponent,
    ExpenseRecordsTableComponent,
    ExpenseRecordDetailModalComponent
  ],
  imports: [
    SharedModule,
    ExpenseRecordsRoutingModule
  ]
})
export class ExpenseRecordsModule {}
