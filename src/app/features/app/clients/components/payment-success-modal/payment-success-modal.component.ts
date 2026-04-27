import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import {
  RegisterPaymentResponse,
  RegisterInstallmentResponse,
  PAYMENT_STATUS_LABELS
} from '../../models/payment.model';
import { formatDateOnly } from 'src/app/shared/utils/date.utils';

export type PaymentSuccessType = 'payment' | 'installment';

export interface PaymentSuccessData {
  type: PaymentSuccessType;
  clientName: string;
  /** Present when type = 'payment' */
  paymentResponse?: RegisterPaymentResponse;
  /** Present when type = 'installment' */
  installmentResponse?: RegisterInstallmentResponse;
}

@Component({
  selector: 'app-payment-success-modal',
  templateUrl: './payment-success-modal.component.html',
  styleUrls: ['./payment-success-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentSuccessModalComponent {
  @Input() data!: PaymentSuccessData;
  @Output() dismissed = new EventEmitter<void>();

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
}
