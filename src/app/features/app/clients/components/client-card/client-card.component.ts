import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { Client, ClientPaymentStatusDisplay } from '../../models/client.model';
import { formatDateOnly } from 'src/app/shared/utils/date.utils';

@Component({
  selector: 'app-client-card',
  templateUrl: './client-card.component.html',
  styleUrls: ['./client-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientCardComponent {
  @Input() client!: Client;
  @Input() isAdmin = false;
  @Output() editRequested = new EventEmitter<Client>();
  @Output() deactivateRequested = new EventEmitter<Client>();
  @Output() registerPaymentRequested = new EventEmitter<Client>();

  get initials(): string {
    return this.client.fullName
      .split(' ')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  get statusLabel(): string {
    switch (this.client.status) {
      case 'active':    return 'Activo';
      case 'inactive':  return 'Inactivo';
      case 'suspended': return 'Suspendido';
      case 'overdue':   return 'Moroso';
      default:          return this.client.status;
    }
  }

  get statusClass(): string {
    switch (this.client.status) {
      case 'active':    return 'status--active';
      case 'inactive':  return 'status--inactive';
      case 'suspended': return 'status--suspended';
      case 'overdue':   return 'status--overdue';
      default:          return 'status--inactive';
    }
  }

  get paymentStatusLabel(): string {
    return this.resolvePaymentStatusLabel(this.client.lastPaymentStatus);
  }

  get paymentStatusClass(): string {
    return this.resolvePaymentStatusClass(this.client.lastPaymentStatus);
  }

  /** True solo cuando hay saldo real a cobrar (evita mostrar "$0"). */
  get hasBalance(): boolean {
    return this.client.lastPaymentBalanceCop !== null &&
           this.client.lastPaymentBalanceCop > 0;
  }

  get formattedBalance(): string {
    return this.formatCop(this.client.lastPaymentBalanceCop);
  }

  get formattedLastEventDate(): string {
    return this.formatDate(this.client.lastEventDate);
  }

  get formattedLastEventAmount(): string {
    return this.formatCop(this.client.lastEventAmountCop);
  }

  get formattedPeriodEnd(): string {
    return this.formatDate(this.client.lastPaymentPeriodEnd);
  }

  get formattedJoinedAt(): string {
    return this.formatDate(this.client.joinedAt);
  }

  get planLabel(): string {
    if (this.client.planAmountCop !== null) {
      return `${this.client.planName} · ${this.formatCop(this.client.planAmountCop)}`;
    }
    return this.client.planName;
  }

  private resolvePaymentStatusLabel(status: ClientPaymentStatusDisplay): string {
    switch (status) {
      case 'paid':        return 'Al día';
      case 'partial':     return 'Pago parcial';
      case 'pending':     return 'Pendiente';
      case 'voided':      return 'Anulado';
      case 'no_payments': return 'Sin pagos';
    }
  }

  private resolvePaymentStatusClass(status: ClientPaymentStatusDisplay): string {
    switch (status) {
      case 'paid':        return 'payment-badge--paid';
      case 'partial':     return 'payment-badge--partial';
      case 'pending':     return 'payment-badge--pending';
      case 'voided':      return 'payment-badge--voided';
      case 'no_payments': return 'payment-badge--no-payments';
    }
  }

  private formatDate(dateStr: string | null): string {
    return formatDateOnly(dateStr);
  }

  private formatCop(amount: number | null): string {
    if (amount === null || amount === undefined) return '—';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount);
  }
}
