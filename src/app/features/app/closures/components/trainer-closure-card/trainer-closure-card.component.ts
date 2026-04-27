import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output
} from '@angular/core';

import {
  MONTH_NAMES_ES,
  PAYMENT_METHOD_LABELS,
  TrainerClosureResult
} from '../../models/closure.model';

@Component({
  selector: 'app-trainer-closure-card',
  templateUrl: './trainer-closure-card.component.html',
  styleUrls: ['./trainer-closure-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TrainerClosureCardComponent implements OnChanges {
  /** The computed closure data for one trainer × quincena. */
  @Input() closure!: TrainerClosureResult;
  /** Full name of the trainer — displayed when isAdmin = true. */
  @Input() trainerName = '';
  /** When true, admin-only action buttons are rendered. */
  @Input() isAdmin = false;

  @Output() viewDetails = new EventEmitter<TrainerClosureResult>();
  @Output() closeQuincena = new EventEmitter<TrainerClosureResult>();
  @Output() reopenQuincena = new EventEmitter<TrainerClosureResult>();
  @Output() markPaid = new EventEmitter<TrainerClosureResult>();
  @Output() addAdjustment = new EventEmitter<TrainerClosureResult>();
  @Output() generatePdf = new EventEmitter<TrainerClosureResult>();

  quincenaLabel = '';
  monthLabel = '';
  statusLabel = '';
  paidOnLabel = '';
  paymentMethodLabel = '';

  get statusClass(): string {
    switch (this.closure?.status) {
      case 'closed': return 'badge--closed';
      case 'paid':   return 'badge--paid';
      default:       return 'badge--open';
    }
  }

  get canGeneratePdf(): boolean {
    return this.closure?.status === 'closed' || this.closure?.status === 'paid';
  }

  get canAddAdjustment(): boolean {
    return this.isAdmin && this.closure?.status !== 'paid';
  }

  ngOnChanges(): void {
    if (!this.closure) return;

    this.quincenaLabel = this.closure.quincena === 'q1' ? 'Q1 · 1–15' : 'Q2 · 16–fin';
    this.monthLabel = `${MONTH_NAMES_ES[this.closure.month - 1]} ${this.closure.year}`;

    switch (this.closure.status) {
      case 'open':   this.statusLabel = 'Abierta'; break;
      case 'closed': this.statusLabel = 'Cerrada'; break;
      case 'paid':   this.statusLabel = 'Pagada';  break;
    }

    if (this.closure.status === 'paid' && this.closure.payment_date) {
      const [y, m, d] = this.closure.payment_date.split('-');
      this.paidOnLabel = `${d}/${m}/${y}`;
      this.paymentMethodLabel = this.closure.payment_method
        ? (PAYMENT_METHOD_LABELS[this.closure.payment_method] ?? this.closure.payment_method)
        : '';
    }
  }

  formatCop(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount);
  }
}
