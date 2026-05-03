import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { Trainer } from '../../models/trainer.model';
import {
  QuincenaBadge,
  toQuincenaBadges
} from '../trainers-table/trainers-table.component';

@Component({
  selector: 'app-trainer-card',
  templateUrl: './trainer-card.component.html',
  styleUrls: ['./trainer-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TrainerCardComponent {
  @Input() trainer!: Trainer;
  @Output() editRequested = new EventEmitter<Trainer>();
  @Output() toggleActiveRequested = new EventEmitter<{ trainer: Trainer; isActive: boolean }>();
  @Output() resetPasswordRequested = new EventEmitter<Trainer>();

  get initials(): string {
    return this.trainer.fullName
      .split(' ')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  get formattedAccountNumber(): string {
    return this.trainer.bankAccount
      ? formatAccountNumber(this.trainer.bankAccount.accountNumber)
      : '—';
  }

  get documentLabel(): string {
    if (!this.trainer.details) return '—';
    return `${this.trainer.details.documentType.toUpperCase()} ${this.trainer.details.documentNumber}`;
  }

  get bankLabel(): string {
    if (!this.trainer.bankAccount) return '—';
    const bankNames: Record<string, string> = {
      bancolombia: 'Bancolombia',
      nequi: 'Nequi'
    };
    return bankNames[this.trainer.bankAccount.bank] ?? this.trainer.bankAccount.bank;
  }

  get q1Badges(): QuincenaBadge[] {
    return toQuincenaBadges(this.trainer.quincenaCounts.q1);
  }

  get q2Badges(): QuincenaBadge[] {
    return toQuincenaBadges(this.trainer.quincenaCounts.q2);
  }

  trackByPlanCode(_index: number, badge: QuincenaBadge): string {
    return badge.planCode;
  }
}

/**
 * Formatea un número de cuenta insertando espacios cada 4 dígitos
 * para mejorar la legibilidad (ej. "1234 5678 90").
 */
export function formatAccountNumber(raw: string): string {
  return raw.replace(/(\d{4})(?=\d)/g, '$1 ');
}
