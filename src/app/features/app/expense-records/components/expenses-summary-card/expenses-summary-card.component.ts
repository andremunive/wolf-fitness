import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { formatAmountCop } from '../../models/expense-record.model';

@Component({
  selector: 'app-expenses-summary-card',
  templateUrl: './expenses-summary-card.component.html',
  styleUrls: ['./expenses-summary-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpensesSummaryCardComponent {
  @Input() totalCop = 0;
  @Input() periodLabel = 'Último mes';
  @Input() isLoading = false;
  @Input() recordCount = 0;

  get formattedTotal(): string {
    return formatAmountCop(this.totalCop);
  }

  get recordCountLabel(): string {
    return this.recordCount === 1 ? '1 egreso en el período' : `${this.recordCount} egresos en el período`;
  }
}
