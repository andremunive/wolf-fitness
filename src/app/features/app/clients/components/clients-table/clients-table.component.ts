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
  selector: 'app-clients-table',
  templateUrl: './clients-table.component.html',
  styleUrls: ['./clients-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientsTableComponent {
  @Input() clients: Client[] = [];
  @Input() isAdmin = false;
  @Output() editRequested = new EventEmitter<Client>();
  @Output() deactivateRequested = new EventEmitter<Client>();
  @Output() registerPaymentRequested = new EventEmitter<Client>();

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

  getInitials(fullName: string): string {
    return fullName
      .split(' ')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
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
