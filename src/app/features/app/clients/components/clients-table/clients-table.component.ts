import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { Client, ClientPaymentStatusDisplay, MembershipStatus } from '../../models/client.model';
import { formatDateOnly, parseDateOnly } from 'src/app/shared/utils/date.utils';

@Component({
  selector: 'app-clients-table',
  templateUrl: './clients-table.component.html',
  styleUrls: ['./clients-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientsTableComponent {
  @Input() clients: Client[] = [];
  @Input() isAdmin = false;
  /** Cuando es true, el usuario es CSM (solo lectura) — oculta acciones de escritura. */
  @Input() isCsm = false;
  @Output() editRequested = new EventEmitter<Client>();
  @Output() deactivateRequested = new EventEmitter<Client>();
  @Output() registerPaymentRequested = new EventEmitter<Client>();
  @Output() measurementsRequested = new EventEmitter<Client>();

  getStatusLabel(status: Client['status']): string {
    switch (status) {
      case 'active':    return 'Activo';
      case 'inactive':  return 'Inactivo';
      case 'suspended': return 'Suspendido';
      case 'overdue':   return 'Moroso';
      default:          return status;
    }
  }

  getStatusClass(status: Client['status']): string {
    switch (status) {
      case 'active':    return 'status--active';
      case 'inactive':  return 'status--inactive';
      case 'suspended': return 'status--suspended';
      case 'overdue':   return 'status--overdue';
      default:          return 'status--inactive';
    }
  }

  getPaymentStatusLabel(status: ClientPaymentStatusDisplay): string {
    switch (status) {
      case 'paid':        return 'Al día';
      case 'partial':     return 'Pago parcial';
      case 'pending':     return 'Pendiente';
      case 'voided':      return 'Anulado';
      case 'no_payments': return 'Sin pagos';
    }
  }

  getPaymentStatusClass(status: ClientPaymentStatusDisplay): string {
    switch (status) {
      case 'paid':        return 'payment-badge--paid';
      case 'partial':     return 'payment-badge--partial';
      case 'pending':     return 'payment-badge--pending';
      case 'voided':      return 'payment-badge--voided';
      case 'no_payments': return 'payment-badge--no-payments';
    }
  }

  getMembershipStatusLabel(status: MembershipStatus): string {
    switch (status) {
      case 'active':     return 'Al día';
      case 'partial':    return 'Parcial';
      case 'pending':    return 'Pendiente';
      case 'expired':    return 'Vencido';
      case 'no_payment': return 'Sin pago';
    }
  }

  getMembershipStatusClass(status: MembershipStatus): string {
    switch (status) {
      case 'active':     return 'membership-badge--active';
      case 'partial':    return 'membership-badge--partial';
      case 'pending':    return 'membership-badge--pending';
      case 'expired':    return 'membership-badge--expired';
      case 'no_payment': return 'membership-badge--no-payment';
    }
  }

  /**
   * Devuelve la clase CSS que determina el color del texto de fecha de vencimiento.
   * - Vencida (antes de hoy): danger.
   * - Próxima a vencer (dentro de 7 días desde hoy, inclusive): amber.
   * - Nula: sin clase (se muestra '—' en template).
   * - Vigente (>7 días): sin clase especial (color por defecto de celda).
   */
  getDueDateClass(dateString: string | null): string {
    if (!dateString) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = parseDateOnly(dateString);
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((due.getTime() - today.getTime()) / msPerDay);

    if (diffDays < 0) return 'due-date--expired';
    if (diffDays <= 7) return 'due-date--soon';
    return '';
  }

  getInitials(fullName: string): string {
    return fullName
      .split(' ')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  formatTrainerName(name: string | null): string {
    if (!name) return '—';
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 2) return name;
    return parts.slice(0, 2).join(' ') + '...';
  }

  formatDate(dateStr: string | null): string {
    return formatDateOnly(dateStr);
  }

  formatCop(amount: number | null): string {
    if (amount === null || amount === undefined) return '—';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount);
  }

  trackByClientId(_index: number, client: Client): string {
    return client.id;
  }
}
