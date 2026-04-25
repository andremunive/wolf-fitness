import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { Client } from '../../models/client.model';

@Component({
  selector: 'app-clients-table',
  templateUrl: './clients-table.component.html',
  styleUrls: ['./clients-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientsTableComponent {
  @Input() clients: Client[] = [];
  @Output() editRequested = new EventEmitter<Client>();
  @Output() deactivateRequested = new EventEmitter<Client>();

  getStatusLabel(status: Client['status']): string {
    switch (status) {
      case 'active': return 'Activo';
      case 'inactive': return 'Inactivo';
    }
  }

  getStatusClass(status: Client['status']): string {
    switch (status) {
      case 'active': return 'status--active';
      case 'inactive': return 'status--inactive';
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
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  formatPlanLabel(client: Client): string {
    if (client.planAmountCop !== null) {
      const formatted = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
      }).format(client.planAmountCop);
      return `${client.planName} · ${formatted}`;
    }
    return client.planName;
  }

  trackByClientId(_index: number, client: Client): string {
    return client.id;
  }
}
