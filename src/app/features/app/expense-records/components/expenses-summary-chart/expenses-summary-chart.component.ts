import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core';

import {
  ExpenseSummaryByCategory,
  PERIOD_FILTERS,
  PeriodFilter,
  PeriodFilterKey,
  formatAmountShort,
  getCategoryColor
} from '../../models/expense-record.model';

export interface ChartBar {
  categoryId: string;
  categoryName: string;
  totalCop: number;
  formattedAmount: string;
  bgColor: string;
  borderColor: string;
  /** Height percentage relative to the tallest bar (0–100). */
  heightPct: number;
}

@Component({
  selector: 'app-expenses-summary-chart',
  templateUrl: './expenses-summary-chart.component.html',
  styleUrls: ['./expenses-summary-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpensesSummaryChartComponent implements OnChanges {
  @Input() summaryData: ExpenseSummaryByCategory[] = [];
  @Input() selectedPeriod: PeriodFilterKey = 1;
  @Input() isLoading = false;

  @Output() periodChange = new EventEmitter<PeriodFilterKey>();

  readonly periodFilters: PeriodFilter[] = PERIOD_FILTERS;

  bars: ChartBar[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['summaryData']) {
      this.buildBars();
    }
  }

  selectPeriod(key: PeriodFilterKey): void {
    this.periodChange.emit(key);
  }

  trackByBarId(_index: number, bar: ChartBar): string {
    return bar.categoryId;
  }

  private buildBars(): void {
    if (!this.summaryData || this.summaryData.length === 0) {
      this.bars = [];
      return;
    }

    const max = Math.max(...this.summaryData.map((d) => d.total_cop));

    this.bars = this.summaryData.map((d) => {
      const colors = getCategoryColor(d.category_id);
      return {
        categoryId: d.category_id,
        categoryName: d.category_name,
        totalCop: d.total_cop,
        formattedAmount: formatAmountShort(d.total_cop),
        bgColor: colors.bg,
        borderColor: colors.border,
        heightPct: max > 0 ? Math.round((d.total_cop / max) * 100) : 0
      };
    });
  }
}
