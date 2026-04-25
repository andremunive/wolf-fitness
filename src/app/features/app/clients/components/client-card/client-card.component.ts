import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { Client } from '../../models/client.model';

@Component({
  selector: 'app-client-card',
  templateUrl: './client-card.component.html',
  styleUrls: ['./client-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientCardComponent {
  @Input() client!: Client;

  get initials(): string {
    return this.client.fullName
      .split(' ')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  get statusLabel(): string {
    switch (this.client.status) {
      case 'active': return 'Activo';
      case 'inactive': return 'Inactivo';
      case 'suspended': return 'Suspendido';
    }
  }

  get statusClass(): string {
    switch (this.client.status) {
      case 'active': return 'status--active';
      case 'inactive': return 'status--inactive';
      case 'suspended': return 'status--suspended';
    }
  }

  get formattedLastPayment(): string {
    if (!this.client.lastPaymentDate) {
      return 'Sin pagos';
    }
    return this.client.lastPaymentDate.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  get formattedStartDate(): string {
    return this.client.startDate.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }
}
