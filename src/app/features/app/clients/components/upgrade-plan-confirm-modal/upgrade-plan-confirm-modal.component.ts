import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output
} from '@angular/core';

import { ActivePaymentSnapshot, Plan } from '../../models/client.model';

// Re-export so existing importers of this component file don't break.
export type { ActivePaymentSnapshot };

export interface UpgradePlanConfirmResult {
  applyToCurrent: boolean;
}

/**
 * Calcula el preview del pago recalculado si se aplica el upgrade a la mensualidad actual.
 */
export interface UpgradePreview {
  newTotal: number;
  discountAmount: number;
  amountReceived: number;
  newBalance: number;
  previousStatus: 'paid' | 'partial';
}

/**
 * Modal de confirmación para upgrades de plan con mensualidad activa.
 * Componente presentacional: recibe datos por Input, emite decisión por Output.
 */
@Component({
  selector: 'app-upgrade-plan-confirm-modal',
  templateUrl: './upgrade-plan-confirm-modal.component.html',
  styleUrls: ['./upgrade-plan-confirm-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UpgradePlanConfirmModalComponent implements OnInit {
  @Input() currentPlan!: Plan;
  @Input() newPlan!: Plan;
  @Input() activePayment!: ActivePaymentSnapshot;

  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly confirmed = new EventEmitter<UpgradePlanConfirmResult>();

  /** Opción seleccionada por el admin. Default: desde la próxima mensualidad. */
  applyToCurrent = false;

  /** Preview calculado client-side para la opción "a la mensualidad actual". */
  preview!: UpgradePreview;

  ngOnInit(): void {
    this.preview = this.calculatePreview();
  }

  get currentPlanPrice(): number {
    return this.currentPlan.amountCop ?? 0;
  }

  get newPlanPrice(): number {
    return this.newPlan.amountCop ?? 0;
  }

  onOptionChange(applyToCurrent: boolean): void {
    this.applyToCurrent = applyToCurrent;
  }

  cancel(): void {
    this.closed.emit();
  }

  confirm(): void {
    this.confirmed.emit({ applyToCurrent: this.applyToCurrent });
  }

  formatCop(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount);
  }

  /**
   * Replica client-side la lógica del RPC para mostrar el preview antes de confirmar.
   * balance = newTotal - discountAmount - amountReceived
   */
  private calculatePreview(): UpgradePreview {
    const newTotal = this.newPlanPrice;
    const pct = this.activePayment.discountPercentageApplied ?? 0;
    const discountAmount = pct > 0 ? Math.round((newTotal * pct) / 100) : 0;
    const amountReceived = this.activePayment.amountReceivedCop;
    const newBalance = newTotal - discountAmount - amountReceived;

    return {
      newTotal,
      discountAmount,
      amountReceived,
      newBalance,
      previousStatus: this.activePayment.status
    };
  }
}
