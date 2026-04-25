import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { Client } from '../../models/client.model';

@Component({
  selector: 'app-client-card',
  templateUrl: './client-card.component.html',
  styleUrls: ['./client-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientCardComponent {
  @Input() client!: Client;
  @Output() editRequested = new EventEmitter<Client>();
  @Output() deactivateRequested = new EventEmitter<Client>();

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
    }
  }

  get statusClass(): string {
    switch (this.client.status) {
      case 'active': return 'status--active';
      case 'inactive': return 'status--inactive';
    }
  }

  get formattedJoinedAt(): string {
    if (!this.client.joinedAt) return '—';
    return new Date(this.client.joinedAt).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  get planLabel(): string {
    if (this.client.planAmountCop !== null) {
      const formatted = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
      }).format(this.client.planAmountCop);
      return `${this.client.planName} · ${formatted}`;
    }
    return this.client.planName;
  }
}
