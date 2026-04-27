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
  selector: 'app-service-providers-table',
  templateUrl: './service-providers-table.component.html',
  styleUrls: ['./service-providers-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceProvidersTableComponent {
  @Input() providers: ServiceProviderViewModel[] = [];
  @Output() editRequested = new EventEmitter<ServiceProviderViewModel>();
  @Output() manageBankAccountsRequested = new EventEmitter<ServiceProviderViewModel>();
  @Output() softDeleteRequested = new EventEmitter<ServiceProviderViewModel>();
  @Output() restoreRequested = new EventEmitter<ServiceProviderViewModel>();

  getInitials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  getDocumentLabel(provider: ServiceProviderViewModel): string {
    const docType = DOCUMENT_TYPE_LABELS[provider.documentType] ?? provider.documentType.toUpperCase();
    return `${docType} ${provider.documentNumber}`;
  }

  getEntityTypeLabel(provider: ServiceProviderViewModel): string {
    return ENTITY_TYPE_LABELS[provider.entityType] ?? provider.entityType;
  }

  getPrimaryBankLabel(provider: ServiceProviderViewModel): string {
    const account = provider.primaryBankAccount;
    if (!account) return '—';
    return BANK_LABELS[account.bank] ?? account.bank;
  }

  getPrimaryAccountNumber(provider: ServiceProviderViewModel): string {
    return provider.primaryBankAccount?.accountNumber ?? '—';
  }

  trackByProviderId(_index: number, provider: ServiceProviderViewModel): string {
    return provider.id;
  }
}
