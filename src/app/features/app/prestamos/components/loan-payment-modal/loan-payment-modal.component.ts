import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { formatAmountCop } from 'src/app/features/app/expense-records/models/expense-record.model';
import { ToastService } from 'src/app/shared/services/toast.service';
import { CreateLoanPaymentInput, Loan, LoanPayment } from '../../models/prestamo.model';
import { PrestamosService } from '../../services/prestamos.service';

/**
 * Container modal for registering a payment against an active loan.
 * Shows a live preview of the resulting balance while the user fills the form.
 */
@Component({
  selector: 'app-loan-payment-modal',
  templateUrl: './loan-payment-modal.component.html',
  styleUrls: ['./loan-payment-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoanPaymentModalComponent implements OnInit, OnDestroy {
  @Input() loan!: Loan;

  @Output() closed         = new EventEmitter<void>();
  @Output() paymentCreated = new EventEmitter<LoanPayment>();

  private readonly destroy$ = new Subject<void>();

  form!: FormGroup;

  readonly today = new Date().toISOString().slice(0, 10);

  // Amount display (formatted with thousands separator, mirrors new-loan-modal)
  amountDisplay = '';

  isLoading = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly prestamosService: PrestamosService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.buildForm();

    // React to amount changes to update preview and hint notes
    this.form.get('amount_cop')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.cdr.markForCheck());
  }

  private buildForm(): void {
    this.form = this.fb.group({
      amount_cop:     [null, [Validators.required, Validators.min(1)]],
      payment_date:   [this.today, Validators.required],
      payment_method: ['',  Validators.required],
      notes:          ['',  Validators.maxLength(300)]
    });
  }

  // ─── Computed preview values ───────────────────────────────────────────────

  get enteredAmount(): number {
    return this.form.get('amount_cop')!.value ?? 0;
  }

  /** Remaining balance after this payment (floored at 0 for display). */
  get newSaldo(): number {
    return Math.max(0, this.loan.saldo_cop - this.enteredAmount);
  }

  /** Excess amount paid over the outstanding balance (potential profit). */
  get potentialGain(): number {
    return Math.max(0, this.enteredAmount - this.loan.saldo_cop);
  }

  get showPreview(): boolean {
    return this.enteredAmount > 0 && this.form.get('amount_cop')!.valid;
  }

  /**
   * Hint shown under the amount field:
   *  null   → no hint
   * 'exact' → amount pays off the loan exactly
   * 'over'  → amount exceeds outstanding balance
   */
  get amountHint(): 'exact' | 'over' | null {
    if (this.enteredAmount <= 0) return null;
    if (this.enteredAmount === this.loan.saldo_cop) return 'exact';
    if (this.enteredAmount > this.loan.saldo_cop) return 'over';
    return null;
  }

  // ─── Amount input formatting (mirrors new-loan-modal) ─────────────────────

  onAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const oldValue = input.value;
    const oldCursor = input.selectionStart ?? oldValue.length;
    const digitsBeforeCursor = oldValue.slice(0, oldCursor).replace(/\D/g, '').length;

    const digits = oldValue.replace(/\D/g, '');
    const amountCtrl = this.form.get('amount_cop')!;

    if (!digits) {
      this.amountDisplay = '';
      input.value = '';
      amountCtrl.setValue(null);
      this.cdr.markForCheck();
      return;
    }

    const num = parseInt(digits, 10);
    const formatted = new Intl.NumberFormat('es-CO').format(num);
    this.amountDisplay = formatted;
    input.value = formatted;
    amountCtrl.setValue(num);

    // Restore cursor position after formatting
    let newCursor = 0;
    let counted = 0;
    while (counted < digitsBeforeCursor && newCursor < formatted.length) {
      if (/\d/.test(formatted[newCursor])) counted++;
      newCursor++;
    }
    input.setSelectionRange(newCursor, newCursor);
    this.cdr.markForCheck();
  }

  // ─── Formatting helpers ────────────────────────────────────────────────────

  formatAmount(amount: number): string {
    return formatAmountCop(amount);
  }

  isFieldInvalid(name: string): boolean {
    const ctrl = this.form.get(name);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isLoading) return;

    const { amount_cop, payment_date, payment_method, notes } = this.form.value;

    const payload: CreateLoanPaymentInput = {
      amount_cop,
      payment_date,
      payment_method,
      notes: notes || null
    };

    this.isLoading = true;
    this.cdr.markForCheck();

    this.prestamosService.createLoanPayment(this.loan.id, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (newPayment) => {
          this.isLoading = false;
          this.toast.success('Abono registrado correctamente.');
          this.paymentCreated.emit(newPayment);
          this.closed.emit();
          this.cdr.markForCheck();
        },
        error: (err: unknown) => {
          this.isLoading = false;
          const msg = err instanceof Error ? err.message : 'Error al registrar el abono.';
          this.toast.error(msg);
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
