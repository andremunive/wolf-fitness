import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import {
  ExpenseCategoryViewModel,
  ExpenseRecordViewModel,
  PAYMENT_METHOD_LABELS,
  formatAmountCop
} from '../../models/expense-record.model';

@Component({
  selector: 'app-expense-records-table',
  templateUrl: './expense-records-table.component.html',
  styleUrls: ['./expense-records-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseRecordsTableComponent {
  @Input() records: ExpenseRecordViewModel[] = [];
  @Input() totalCount = 0;
  @Input() currentPage = 1;
  @Input() pageSize = 10;
  @Input() isLoading = false;
  @Input() categories: ExpenseCategoryViewModel[] = [];
  @Input() selectedCategoryId: string | null = null;

  @Output() pageChange = new EventEmitter<number>();
  @Output() categoryFilterChange = new EventEmitter<string | null>();
  @Output() editRequested = new EventEmitter<ExpenseRecordViewModel>();
  @Output() detailRequested = new EventEmitter<ExpenseRecordViewModel>();

  readonly paymentMethodLabels = PAYMENT_METHOD_LABELS;

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalCount / this.pageSize));
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  formatAmount(amount: number): string {
    return formatAmountCop(amount);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }

  getPaymentMethodLabel(method: string): string {
    return this.paymentMethodLabels[method] ?? method;
  }

  onCategoryFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.categoryFilterChange.emit(value || null);
  }

  trackByRecordId(_index: number, record: ExpenseRecordViewModel): string {
    return record.id;
  }

  trackByCategoryId = (_: number, c: ExpenseCategoryViewModel): string => c.id;
  trackByPage = (_: number, p: number): number => p;
}
