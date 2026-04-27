import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { Trainer, TrainerQuincenaPlanCounts } from '../../models/trainer.model';

export interface QuincenaBadge {
  planCode: string;
  abbr: string;
  count: number;
}

const PLAN_CODE_ABBREVIATION: Record<string, string> = {
  plan_6d: 'P6D',
  plan_3d: 'P3D'
};

const PLAN_CODE_DISPLAY_ORDER: Record<string, number> = {
  plan_6d: 0,
  plan_3d: 1
};

export function toQuincenaBadges(counts: TrainerQuincenaPlanCounts): QuincenaBadge[] {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([planCode, count]) => ({
      planCode,
      abbr: PLAN_CODE_ABBREVIATION[planCode] ?? planCode.replace(/^plan_/, 'P').toUpperCase(),
      count
    }))
    .sort(
      (a, b) =>
        (PLAN_CODE_DISPLAY_ORDER[a.planCode] ?? 99) -
        (PLAN_CODE_DISPLAY_ORDER[b.planCode] ?? 99)
    );
}

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

  getQ1Badges(trainer: Trainer): QuincenaBadge[] {
    return toQuincenaBadges(trainer.quincenaCounts.q1);
  }

  getQ2Badges(trainer: Trainer): QuincenaBadge[] {
    return toQuincenaBadges(trainer.quincenaCounts.q2);
  }

  trackByPlanCode(_index: number, badge: QuincenaBadge): string {
    return badge.planCode;
  }

  getInitials(fullName: string): string {
    return fullName
      .split(' ')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  getDocumentNumber(trainer: Trainer): string {
    return trainer.details?.documentNumber ?? '—';
  }

  getDocumentType(trainer: Trainer): string {
    return trainer.details ? trainer.details.documentType.toUpperCase() : '';
  }

  getAccountNumber(trainer: Trainer): string {
    return trainer.bankAccount?.accountNumber ?? '—';
  }

  getBankName(trainer: Trainer): string {
    if (!trainer.bankAccount) return '';
    const names: Record<string, string> = { bancolombia: 'Bancolombia', nequi: 'Nequi' };
    return names[trainer.bankAccount.bank] ?? trainer.bankAccount.bank;
  }

  trackByTrainerId(_index: number, trainer: Trainer): string {
    return trainer.id;
  }
}
