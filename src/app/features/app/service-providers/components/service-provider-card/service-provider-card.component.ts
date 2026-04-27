import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { ServiceProviderViewModel } from '../../models/service-provider.model';
import { BANK_LABELS, DOCUMENT_TYPE_LABELS, ENTITY_TYPE_LABELS } from '../shared/display-labels';

@Component({
  selector: 'app-service-provider-card',
  templateUrl: './service-provider-card.component.html',
  styleUrls: ['./service-provider-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceProviderCardComponent {
  @Input() provider!: ServiceProviderViewModel;
  @Output() editRequested = new EventEmitter<ServiceProviderViewModel>();
  @Output() manageBankAccountsRequested = new EventEmitter<ServiceProviderViewModel>();
  @Output() softDeleteRequested = new EventEmitter<ServiceProviderViewModel>();
  @Output() restoreRequested = new EventEmitter<ServiceProviderViewModel>();

  get initials(): string {
    return this.provider.name
      .split(' ')
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  get documentLabel(): string {
    const docType = DOCUMENT_TYPE_LABELS[this.provider.documentType] ?? this.provider.documentType.toUpperCase();
    return `${docType} ${this.provider.documentNumber}`;
  }

  get entityTypeLabel(): string {
    return ENTITY_TYPE_LABELS[this.provider.entityType] ?? this.provider.entityType;
  }

  get primaryBankLabel(): string {
    const account = this.provider.primaryBankAccount;
    if (!account) return '—';
    const bankLabel = BANK_LABELS[account.bank] ?? account.bank;
    return `${bankLabel} ·· ${account.accountNumber.slice(-4)}`;
  }
}
