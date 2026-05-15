import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges
} from '@angular/core';
import { Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';

import { formatAmountCop } from 'src/app/features/app/expense-records/models/expense-record.model';
import { Loan, LoanPayment, PaymentMethod } from '../../models/prestamo.model';
import { PrestamosService } from '../../services/prestamos.service';

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash:     '💵 Efectivo',
  transfer: '🏦 Transferencia',
  nequi:    '📱 Nequi',
  other:    '🔹 Otro'
};

/**
 * Container modal that shows full loan detail + payment history.
 * Reloads payments whenever the `loan` input changes (ngOnChanges),
 * which happens after a successful payment from the parent.
 */
@Component({
  selector: 'app-loan-detail-modal',
  templateUrl: './loan-detail-modal.component.html',
  styleUrls: ['./loan-detail-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoanDetailModalComponent implements OnInit, OnChanges, OnDestroy {
  @Input() loan!: Loan;

  @Output() closed             = new EventEmitter<void>();
  @Output() paymentRequested   = new EventEmitter<Loan>();

  private readonly destroy$      = new Subject<void>();
  /** Emits the loan id whenever we need to (re)load payments. */
  private readonly loadPayments$ = new Subject<string>();

  payments: LoanPayment[] = [];
  isLoadingPayments = true;

  readonly paymentMethodLabels = PAYMENT_METHOD_LABELS;

  constructor(
    private readonly prestamosService: PrestamosService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Wire the payments stream: switchMap so a new loan id cancels the inflight request.
    this.loadPayments$.pipe(
      switchMap((loanId) => {
        this.isLoadingPayments = true;
        this.cdr.markForCheck();
        return this.prestamosService.getLoanPayments(loanId);
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (payments) => {
        this.payments = payments;
        this.isLoadingPayments = false;
        this.warnIfTotalMismatch();
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('[LoanDetailModal] getLoanPayments error:', err);
        this.isLoadingPayments = false;
        this.cdr.markForCheck();
      }
    });

    this.loadPayments$.next(this.loan.id);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const loanChange = changes['loan'];
    // On subsequent changes (after ngOnInit has run), reload if the loan
    // id changed or total_paid_cop was updated (post-payment refresh).
    if (loanChange && !loanChange.firstChange) {
      this.loadPayments$.next(this.loan.id);
    }
  }

  // ─── Computed helpers ──────────────────────────────────────────────────────

  getProgressPct(): number {
    if (this.loan.amount_cop <= 0) return 0;
    return Math.min(100, Math.round((this.loan.total_paid_cop / this.loan.amount_cop) * 100));
  }

  isPaidOff(): boolean {
    return this.loan.total_paid_cop >= this.loan.amount_cop;
  }

  get clientSideTotal(): number {
    return this.payments.reduce((sum, p) => sum + p.amount_cop, 0);
  }

  get surplusAmount(): number {
    return Math.max(0, this.loan.total_paid_cop - this.loan.amount_cop);
  }

  // ─── Formatting helpers ────────────────────────────────────────────────────

  formatAmount(amount: number): string {
    return formatAmountCop(amount);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  getMethodLabel(method: string): string {
    return this.paymentMethodLabels[method as PaymentMethod] ?? method;
  }

  // ─── Avatar helpers (mirrors prestamos-list, inline to avoid shared util) ──

  getInitials(fullName: string): string {
    return fullName
      .split(' ')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  getAvatarBg(fullName: string): string {
    const colors = [
      '#0891b2', '#0284c7', '#7c3aed', '#db2777',
      '#059669', '#d97706', '#dc2626', '#4f46e5'
    ];
    let hash = 0;
    for (let i = 0; i < fullName.length; i++) {
      hash = (hash * 31 + fullName.charCodeAt(i)) & 0xffffffff;
    }
    return colors[Math.abs(hash) % colors.length];
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  requestPayment(): void {
    this.paymentRequested.emit(this.loan);
  }

  close(): void {
    this.closed.emit();
  }

  // ─── Track-by ─────────────────────────────────────────────────────────────

  trackByPaymentId(_index: number, payment: LoanPayment): string {
    return payment.id;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  private warnIfTotalMismatch(): void {
    if (this.clientSideTotal !== this.loan.total_paid_cop) {
      console.warn(
        `[LoanDetailModal] Total mismatch: client-side sum=${this.clientSideTotal}, ` +
        `DB total_paid_cop=${this.loan.total_paid_cop} for loan ${this.loan.id}`
      );
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
