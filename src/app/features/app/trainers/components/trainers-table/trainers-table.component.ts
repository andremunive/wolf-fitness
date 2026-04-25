import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { Trainer } from '../../models/trainer.model';

@Component({
  selector: 'app-trainers-table',
  templateUrl: './trainers-table.component.html',
  styleUrls: ['./trainers-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TrainersTableComponent {
  @Input() trainers: Trainer[] = [];
  @Output() editRequested = new EventEmitter<Trainer>();
  @Output() toggleActiveRequested = new EventEmitter<{ trainer: Trainer; isActive: boolean }>();

  getInitials(fullName: string): string {
    return fullName
      .split(' ')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  getDocumentLabel(trainer: Trainer): string {
    if (!trainer.details) return '—';
    return `${trainer.details.documentType.toUpperCase()} ${trainer.details.documentNumber}`;
  }

  getBankLabel(trainer: Trainer): string {
    if (!trainer.bankAccount) return '—';
    const names: Record<string, string> = { bancolombia: 'Bancolombia', nequi: 'Nequi' };
    return names[trainer.bankAccount.bank] ?? trainer.bankAccount.bank;
  }

  trackByTrainerId(_index: number, trainer: Trainer): string {
    return trainer.id;
  }
}
