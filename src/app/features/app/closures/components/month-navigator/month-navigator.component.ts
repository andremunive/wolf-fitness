import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output
} from '@angular/core';

import { MonthYear, MONTH_NAMES_ES } from '../../models/closure.model';

@Component({
  selector: 'app-month-navigator',
  templateUrl: './month-navigator.component.html',
  styleUrls: ['./month-navigator.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthNavigatorComponent implements OnChanges {
  @Input() current!: MonthYear;
  /** When true, the "next month" button is disabled and a tooltip explains why. */
  @Input() nextBlocked = false;

  @Output() monthChange = new EventEmitter<MonthYear>();

  label = '';

  ngOnChanges(): void {
    if (this.current) {
      this.label = `${MONTH_NAMES_ES[this.current.month - 1]} ${this.current.year}`;
    }
  }

  goToPrevious(): void {
    const { year, month } = this.current;
    const isJanuary = month === 1;
    this.monthChange.emit({
      year: isJanuary ? year - 1 : year,
      month: isJanuary ? 12 : month - 1
    });
  }

  goToNext(): void {
    if (this.nextBlocked) return;
    const { year, month } = this.current;
    const isDecember = month === 12;
    this.monthChange.emit({
      year: isDecember ? year + 1 : year,
      month: isDecember ? 1 : month + 1
    });
  }
}
