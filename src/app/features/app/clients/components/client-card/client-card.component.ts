import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { Client, ClientPaymentStatusDisplay, MembershipStatus } from '../../models/client.model';
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
  /** Cuando es true, el usuario es CSM (solo lectura) — oculta acciones de escritura. */
  @Input() isCsm = false;
  @Output() editRequested = new EventEmitter<Client>();
  @Output() deactivateRequested = new EventEmitter<Client>();
  @Output() registerPaymentRequested = new EventEmitter<Client>();
  @Output() measurementsRequested = new EventEmitter<Client>();

  get initials(): string {
    return this.client.fullName
      .split(' ')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  get membershipStatusLabel(): string {
    return this.resolveMembershipStatusLabel(this.client.membershipStatus);
  }

  get membershipStatusClass(): string {
    return this.resolveMembershipStatusClass(this.client.membershipStatus);
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

  private resolveMembershipStatusLabel(status: MembershipStatus): string {
    switch (status) {
      case 'active':     return 'Al día';
      case 'partial':    return 'Parcial';
      case 'pending':    return 'Pendiente';
      case 'expired':    return 'Vencido';
      case 'no_payment': return 'Sin pago';
    }
  }

  private resolveMembershipStatusClass(status: MembershipStatus): string {
    switch (status) {
      case 'active':     return 'membership-badge--active';
      case 'partial':    return 'membership-badge--partial';
      case 'pending':    return 'membership-badge--pending';
      case 'expired':    return 'membership-badge--expired';
      case 'no_payment': return 'membership-badge--no-payment';
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
