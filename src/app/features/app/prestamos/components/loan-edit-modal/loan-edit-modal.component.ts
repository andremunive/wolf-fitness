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
import { BeneficiaryType, Loan, UpdateLoanInput } from '../../models/prestamo.model';
import { PrestamosService } from '../../services/prestamos.service';

type TrainerOption = { id: string; full_name: string };
type ProviderOption = { id: string; name: string };

/**
 * Container modal for editing an active loan.
 * Pre-populates all editable fields from the current loan state.
 * Mirrors the pattern of NewLoanModalComponent for beneficiary selection,
 * autocomplete, and amount formatting.
 */
@Component({
  selector: 'app-loan-edit-modal',
  templateUrl: './loan-edit-modal.component.html',
  styleUrls: ['./loan-edit-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoanEditModalComponent implements OnInit, OnDestroy {
  @Input() loan!: Loan;

  @Output() closed      = new EventEmitter<void>();
  @Output() loanUpdated = new EventEmitter<Loan>();

  private readonly destroy$ = new Subject<void>();

  form!: FormGroup;

  readonly today = new Date().toISOString().slice(0, 10);

  // Loaded options
  trainers: TrainerOption[] = [];
  providers: ProviderOption[] = [];
  isLoadingTrainers = false;
  isLoadingProviders = false;

  // Autocomplete filter state
  trainerQuery = '';
  providerQuery = '';
  isTrainerDropdownOpen = false;
  isProviderDropdownOpen = false;
  selectedTrainer: TrainerOption | null = null;
  selectedProvider: ProviderOption | null = null;

  // Amount display (formatted with thousands separator)
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
    this.loadTrainers();
    this.loadProviders();

    // Pre-format the amount display from the loan's current value
    if (this.loan.amount_cop > 0) {
      this.amountDisplay = new Intl.NumberFormat('es-CO').format(this.loan.amount_cop);
    }

    // React to beneficiary_type changes to update conditional validators
    this.form.get('beneficiary_type')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.updateConditionalValidators());
  }

  private buildForm(): void {
    this.form = this.fb.group({
      beneficiary_type: [this.loan.beneficiary_type, Validators.required],
      trainer_id:       [this.loan.trainer_id ?? null],
      provider_id:      [this.loan.provider_id ?? null],
      third_party_name: [this.loan.third_party_name ?? ''],
      amount_cop:       [this.loan.amount_cop, [Validators.required, Validators.min(1)]],
      loan_date:        [this.loan.loan_date, Validators.required],
      notes:            [this.loan.notes ?? '']
    });

    // Run validators immediately for the initial beneficiary type
    this.updateConditionalValidators();
  }

  // ─── Conditional validators (same logic as new-loan-modal) ────────────────

  private updateConditionalValidators(): void {
    const type: BeneficiaryType | '' = this.form.get('beneficiary_type')!.value;

    const trainerCtrl  = this.form.get('trainer_id')!;
    const providerCtrl = this.form.get('provider_id')!;
    const thirdCtrl    = this.form.get('third_party_name')!;

    trainerCtrl.clearValidators();
    providerCtrl.clearValidators();
    thirdCtrl.clearValidators();

    if (type === 'trainer') {
      trainerCtrl.setValidators(Validators.required);
    } else if (type === 'provider') {
      providerCtrl.setValidators(Validators.required);
    } else if (type === 'third_party') {
      thirdCtrl.setValidators([Validators.required, Validators.maxLength(100)]);
    }

    trainerCtrl.updateValueAndValidity();
    providerCtrl.updateValueAndValidity();
    thirdCtrl.updateValueAndValidity();
    this.cdr.markForCheck();
  }

  // ─── Loaders ──────────────────────────────────────────────────────────────

  private loadTrainers(): void {
    this.isLoadingTrainers = true;
    this.cdr.markForCheck();

    this.prestamosService.getTrainers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (trainers) => {
          this.trainers = trainers;
          this.isLoadingTrainers = false;

          // Restore current trainer selection if type didn't change
          if (this.loan.beneficiary_type === 'trainer' && this.loan.trainer_id) {
            const match = trainers.find((t) => t.id === this.loan.trainer_id);
            if (match) {
              this.selectedTrainer = match;
              this.trainerQuery = match.full_name;
            }
          }

          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingTrainers = false;
          this.cdr.markForCheck();
        }
      });
  }

  private loadProviders(): void {
    this.isLoadingProviders = true;
    this.cdr.markForCheck();

    this.prestamosService.getProviders()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (providers) => {
          this.providers = providers;
          this.isLoadingProviders = false;

          // Restore current provider selection if type didn't change
          if (this.loan.beneficiary_type === 'provider' && this.loan.provider_id) {
            const match = providers.find((p) => p.id === this.loan.provider_id);
            if (match) {
              this.selectedProvider = match;
              this.providerQuery = match.name;
            }
          }

          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingProviders = false;
          this.cdr.markForCheck();
        }
      });
  }

  // ─── Beneficiary type selection ────────────────────────────────────────────

  selectBeneficiaryType(type: BeneficiaryType): void {
    this.form.get('beneficiary_type')!.setValue(type);
    this.form.patchValue({ trainer_id: null, provider_id: null, third_party_name: '' });
    this.selectedTrainer = null;
    this.selectedProvider = null;
    this.trainerQuery = '';
    this.providerQuery = '';
    this.isTrainerDropdownOpen = false;
    this.isProviderDropdownOpen = false;
    this.cdr.markForCheck();
  }

  get selectedBeneficiaryType(): BeneficiaryType | '' {
    return this.form.get('beneficiary_type')!.value;
  }

  // ─── Trainer autocomplete (mirrors new-loan-modal) ─────────────────────────

  get filteredTrainers(): TrainerOption[] {
    const q = this.trainerQuery.trim().toLowerCase();
    return q
      ? this.trainers.filter((t) => t.full_name.toLowerCase().includes(q))
      : this.trainers;
  }

  onTrainerQueryInput(event: Event): void {
    this.trainerQuery = (event.target as HTMLInputElement).value;
    this.isTrainerDropdownOpen = true;
    this.cdr.markForCheck();
  }

  onTrainerFocus(): void {
    this.isTrainerDropdownOpen = true;
    this.cdr.markForCheck();
  }

  onTrainerBlur(): void {
    setTimeout(() => {
      this.isTrainerDropdownOpen = false;
      this.trainerQuery = this.selectedTrainer?.full_name ?? '';
      this.cdr.markForCheck();
    }, 200);
  }

  selectTrainer(trainer: TrainerOption): void {
    this.selectedTrainer = trainer;
    this.trainerQuery = trainer.full_name;
    this.form.get('trainer_id')!.setValue(trainer.id);
    this.isTrainerDropdownOpen = false;
    this.cdr.markForCheck();
  }

  clearTrainer(): void {
    this.selectedTrainer = null;
    this.trainerQuery = '';
    this.form.get('trainer_id')!.setValue(null);
    this.isTrainerDropdownOpen = false;
    this.cdr.markForCheck();
  }

  trackByTrainerId(_i: number, t: TrainerOption): string { return t.id; }

  // ─── Provider autocomplete (mirrors new-loan-modal) ────────────────────────

  get filteredProviders(): ProviderOption[] {
    const q = this.providerQuery.trim().toLowerCase();
    return q
      ? this.providers.filter((p) => p.name.toLowerCase().includes(q))
      : this.providers;
  }

  onProviderQueryInput(event: Event): void {
    this.providerQuery = (event.target as HTMLInputElement).value;
    this.isProviderDropdownOpen = true;
    this.cdr.markForCheck();
  }

  onProviderFocus(): void {
    this.isProviderDropdownOpen = true;
    this.cdr.markForCheck();
  }

  onProviderBlur(): void {
    setTimeout(() => {
      this.isProviderDropdownOpen = false;
      this.providerQuery = this.selectedProvider?.name ?? '';
      this.cdr.markForCheck();
    }, 200);
  }

  selectProvider(provider: ProviderOption): void {
    this.selectedProvider = provider;
    this.providerQuery = provider.name;
    this.form.get('provider_id')!.setValue(provider.id);
    this.isProviderDropdownOpen = false;
    this.cdr.markForCheck();
  }

  clearProvider(): void {
    this.selectedProvider = null;
    this.providerQuery = '';
    this.form.get('provider_id')!.setValue(null);
    this.isProviderDropdownOpen = false;
    this.cdr.markForCheck();
  }

  trackByProviderId(_i: number, p: ProviderOption): string { return p.id; }

  // ─── Amount formatting (mirrors new-loan-modal) ────────────────────────────

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

  // ─── Informative warning when amount is less than total paid ──────────────

  get showLessThanPaidWarning(): boolean {
    const amount = this.form.get('amount_cop')!.value;
    return typeof amount === 'number' && amount > 0 && amount < this.loan.total_paid_cop;
  }

  formatAmount(amount: number): string {
    return formatAmountCop(amount);
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isLoading) return;

    const { beneficiary_type, trainer_id, provider_id, third_party_name, amount_cop, loan_date, notes } = this.form.value;

    const payload: UpdateLoanInput = {
      beneficiary_type,
      trainer_id:       beneficiary_type === 'trainer'     ? trainer_id      : null,
      provider_id:      beneficiary_type === 'provider'    ? provider_id     : null,
      third_party_name: beneficiary_type === 'third_party' ? (third_party_name || null) : null,
      amount_cop,
      loan_date,
      notes: notes || null
    };

    this.isLoading = true;
    this.cdr.markForCheck();

    this.prestamosService.updateLoan(this.loan.id, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.isLoading = false;
          this.toast.success('Préstamo actualizado correctamente.');
          this.loanUpdated.emit(updated);
          this.closed.emit();
          this.cdr.markForCheck();
        },
        error: (err: unknown) => {
          this.isLoading = false;
          const msg = err instanceof Error ? err.message : 'Error al actualizar el préstamo.';
          this.toast.error(msg);
          this.cdr.markForCheck();
        }
      });
  }

  close(): void {
    this.closed.emit();
  }

  isFieldInvalid(name: string): boolean {
    const ctrl = this.form.get(name);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
