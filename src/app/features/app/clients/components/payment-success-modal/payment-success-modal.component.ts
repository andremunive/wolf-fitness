import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output
} from '@angular/core';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import {
  RegisterPaymentResponse,
  RegisterInstallmentResponse,
  PAYMENT_STATUS_LABELS,
  SendReceiptSuccess,
  EdgeFunctionError,
  mapReceiptErrorToMessage
} from '../../models/payment.model';
import { PaymentsService } from '../../services/payments.service';
import { formatDateOnly } from 'src/app/shared/utils/date.utils';

export type PaymentSuccessType = 'payment' | 'installment';

/** Possible states of the email receipt send flow. */
export type ReceiptEmailState = 'idle' | 'sending' | 'sent' | 'already_sent' | 'error';

export interface ReceiptEmailStatus {
  state: ReceiptEmailState;
  /** Email address the receipt was (or will be) sent to. Used in display copy. */
  clientEmail: string;
  /** Payment ID needed for resend calls. */
  paymentId: string;
  /** Set on 'error' state: human-readable message. */
  errorMessage?: string;
  /** Set on 'sent' / 'already_sent': Resend email ID for audit trail. */
  receiptEmailId?: string | null;
  /** Total attempts tracked after EF responds (from RESEND_ERROR details). */
  sendAttempts?: number;
}

export interface PaymentSuccessData {
  type: PaymentSuccessType;
  clientName: string;
  /** Present when type = 'payment' */
  paymentResponse?: RegisterPaymentResponse;
  /** Present when type = 'installment' */
  installmentResponse?: RegisterInstallmentResponse;
  /**
   * Present only when type = 'payment' and the resulting status = 'paid'.
   * Starts as 'sending' immediately after the payment is registered.
   * Undefined means no receipt applies (partial / installment).
   */
  receiptStatus?: ReceiptEmailStatus;
}

@Component({
  selector: 'app-payment-success-modal',
  templateUrl: './payment-success-modal.component.html',
  styleUrls: ['./payment-success-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentSuccessModalComponent implements OnDestroy {
  @Input() data!: PaymentSuccessData;
  @Output() dismissed = new EventEmitter<void>();

  /**
   * Guards against double-click on Retry / Resend buttons.
   * Set to true at the start of each resend call; cleared in finalize().
   */
  isResendingReceipt = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  // ─── Existing computed getters ────────────────────────────────────────────────

  get title(): string {
    return this.data.type === 'payment' ? 'Pago registrado' : 'Abono registrado';
  }

  get subtitle(): string {
    return this.data.type === 'payment'
      ? `El pago de ${this.data.clientName} fue registrado correctamente.`
      : `El abono de ${this.data.clientName} fue registrado correctamente.`;
  }

  get newStatusLabel(): string {
    if (this.data.type === 'payment' && this.data.paymentResponse) {
      return PAYMENT_STATUS_LABELS[this.data.paymentResponse.status];
    }
    if (this.data.type === 'installment' && this.data.installmentResponse) {
      return PAYMENT_STATUS_LABELS[this.data.installmentResponse.nuevo_status];
    }
    return '';
  }

  get newBalanceCop(): number {
    if (this.data.type === 'payment' && this.data.paymentResponse) {
      return this.data.paymentResponse.balance_cop;
    }
    if (this.data.type === 'installment' && this.data.installmentResponse) {
      return this.data.installmentResponse.nuevo_balance;
    }
    return 0;
  }

  get periodLabel(): string {
    if (this.data.type === 'payment' && this.data.paymentResponse) {
      return `${this.formatDate(this.data.paymentResponse.period_start)} → ${this.formatDate(this.data.paymentResponse.period_end)}`;
    }
    return '';
  }

  get statusClass(): string {
    const status =
      this.data.type === 'payment'
        ? this.data.paymentResponse?.status
        : this.data.installmentResponse?.nuevo_status;

    switch (status) {
      case 'paid': return 'status--paid';
      case 'partial': return 'status--partial';
      case 'pending': return 'status--pending';
      default: return '';
    }
  }

  // ─── Receipt email state helpers ──────────────────────────────────────────────

  get receiptStatus(): ReceiptEmailStatus | undefined {
    return this.data.receiptStatus;
  }

  /**
   * Whether to show the high-attempts warning band.
   * Shown when sendAttempts is known and >= 3.
   */
  get showHighAttemptsWarning(): boolean {
    const attempts = this.data.receiptStatus?.sendAttempts;
    return typeof attempts === 'number' && attempts >= 3;
  }

  // ─── Receipt resend actions ───────────────────────────────────────────────────

  /**
   * Called by the "Reintentar" button in 'error' state.
   * Uses force_resend: false — a clean retry after a failed attempt.
   */
  onRetryReceipt(): void {
    this.callSendReceipt(false);
  }

  /**
   * Called by the "Reenviar" button in 'already_sent' state.
   * Uses force_resend: true — the admin explicitly wants to re-send.
   */
  onForceResendReceipt(): void {
    this.callSendReceipt(true);
  }

  private callSendReceipt(forceResend: boolean): void {
    // Anti-double-click guard.
    if (this.isResendingReceipt) return;
    if (!this.data.receiptStatus) return;

    this.isResendingReceipt = true;
    this.data.receiptStatus.state = 'sending';
    this.cdr.markForCheck();

    this.paymentsService
      .sendReceipt(this.data.receiptStatus.paymentId, forceResend)
      .pipe(
        finalize(() => {
          this.isResendingReceipt = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response: SendReceiptSuccess) => {
          this.applyReceiptSuccess(response);
        },
        error: (err: unknown) => {
          this.applyReceiptError(err);
        }
      });
  }

  /** Mutates the receiptStatus object in-place after a successful EF response. */
  applyReceiptSuccess(response: SendReceiptSuccess): void {
    if (!this.data.receiptStatus) return;
    this.data.receiptStatus.state = response.status; // 'sent' | 'already_sent'
    this.data.receiptStatus.receiptEmailId = response.receipt_email_id ?? null;
    this.data.receiptStatus.errorMessage = undefined;
    this.cdr.markForCheck();
  }

  /** Mutates the receiptStatus object in-place after an EF error. */
  applyReceiptError(err: unknown): void {
    if (!this.data.receiptStatus) return;
    this.data.receiptStatus.state = 'error';

    const efErr = err as EdgeFunctionError;
    const code = efErr?.code ?? 'INTERNAL_ERROR';
    const fallback = efErr?.message;
    this.data.receiptStatus.errorMessage = mapReceiptErrorToMessage(code, fallback);

    // Capture attempt count from RESEND_ERROR details for the warning band.
    if (code === 'RESEND_ERROR' && efErr?.details) {
      const attempts = efErr.details['current_attempts'];
      if (typeof attempts === 'number') {
        this.data.receiptStatus.sendAttempts = attempts;
      }
    }

    this.cdr.markForCheck();
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────

  formatCop(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount);
  }

  private formatDate(dateStr: string): string {
    return formatDateOnly(dateStr);
  }

  dismiss(): void {
    this.dismissed.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
