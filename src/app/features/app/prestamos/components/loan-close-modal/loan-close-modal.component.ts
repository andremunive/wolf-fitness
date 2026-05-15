import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { formatAmountCop } from 'src/app/features/app/expense-records/models/expense-record.model';
import { ToastService } from 'src/app/shared/services/toast.service';
import { Loan } from '../../models/prestamo.model';
import { PrestamosService } from '../../services/prestamos.service';

/**
 * Container modal to confirm closing an active loan.
 *
 * Closure type is derived automatically:
 *  - saldo_cop <= 0 → 'normal'  (green UI, no confirmation input)
 *  - saldo_cop > 0  → 'forced'  (amber/red UI, must type CONFIRMAR)
 */
@Component({
  selector: 'app-loan-close-modal',
  templateUrl: './loan-close-modal.component.html',
  styleUrls: ['./loan-close-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoanCloseModalComponent implements OnDestroy {
  @Input() loan!: Loan;

  @Output() closed     = new EventEmitter<void>();
  @Output() loanClosed = new EventEmitter<Loan>();

  private readonly destroy$ = new Subject<void>();

  /** Typed confirmation control — only used in 'forced' case. */
  readonly confirmation = new FormControl('');

  isLoading = false;

  constructor(
    private readonly prestamosService: PrestamosService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  // ─── Derived state ────────────────────────────────────────────────────────

  get closureType(): 'normal' | 'forced' {
    return this.loan.saldo_cop <= 0 ? 'normal' : 'forced';
  }

  get isNormal(): boolean { return this.closureType === 'normal'; }

  get profit(): number {
    return Math.max(0, this.loan.total_paid_cop - this.loan.amount_cop);
  }

  /** Only meaningful in the forced case — what gets logged as loss. */
  get loss(): number {
    return Math.max(0, this.loan.amount_cop - this.loan.total_paid_cop);
  }

  /** True only when the user typed CONFIRMAR exactly. */
  get confirmationValid(): boolean {
    return this.confirmation.value === 'CONFIRMAR';
  }

  get canClose(): boolean {
    if (this.isLoading) return false;
    if (this.closureType === 'forced') return this.confirmationValid;
    return true;
  }

  // ─── Formatting ───────────────────────────────────────────────────────────

  formatAmount(amount: number): string {
    return formatAmountCop(amount);
  }

  // ─── Action ───────────────────────────────────────────────────────────────

  onConfirmClose(): void {
    if (!this.canClose) return;

    this.isLoading = true;
    this.cdr.markForCheck();

    this.prestamosService.closeLoan(this.loan.id, this.closureType)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.isLoading = false;
          const msg = this.closureType === 'forced'
            ? `Préstamo cerrado con pérdida de ${formatAmountCop(updated.loss_cop ?? 0)}.`
            : 'Préstamo cerrado correctamente.';
          this.toast.success(msg);
          this.loanClosed.emit(updated);
          this.closed.emit();
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoading = false;
          this.toast.error('No se pudo cerrar el préstamo.');
          this.cdr.markForCheck();
        }
      });
  }

  close(): void {
    this.closed.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
