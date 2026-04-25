import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { Client } from '../../models/client.model';

@Component({
  selector: 'app-clients-table',
  templateUrl: './clients-table.component.html',
  styleUrls: ['./clients-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientsTableComponent {
  @Input() clients: Client[] = [];

  get statusLabel(): (status: Client['status']) => string {
    return (status) => {
      switch (status) {
        case 'active': return 'Activo';
        case 'inactive': return 'Inactivo';
        case 'suspended': return 'Suspendido';
      }
    };
  }

  getStatusClass(status: Client['status']): string {
    switch (status) {
      case 'active': return 'status--active';
      case 'inactive': return 'status--inactive';
      case 'suspended': return 'status--suspended';
    }
  }

  getInitials(fullName: string): string {
    return fullName
      .split(' ')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  formatDate(date: Date | null): string {
    if (!date) return '—';
    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  trackByClientId(_index: number, client: Client): string {
    return client.id;
  }
}
