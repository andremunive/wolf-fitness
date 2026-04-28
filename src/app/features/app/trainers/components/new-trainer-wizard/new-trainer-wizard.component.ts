import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnDestroy,
  Output
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { LoaderService } from 'src/app/core/services/loader.service';
import { TrainersService } from '../../services/trainers.service';
import {
  Bank,
  BankAccountType,
  CreateTrainerPayload,
  CreateTrainerResult,
  DocumentType
} from '../../models/trainer.model';

export interface WizardSuccessEvent {
  result: CreateTrainerResult;
}

// Valida que si bank === 'nequi', account_number tenga exactamente 10 dígitos.
function nequiAccountValidator(group: AbstractControl): ValidationErrors | null {
  const bank = group.get('bank')?.value as Bank | null;
  const accountNumber = (group.get('account_number')?.value ?? '') as string;

  if (bank === 'nequi' && !/^\d{10}$/.test(accountNumber)) {
    return { nequiMustBe10Digits: true };
  }
  return null;
}

@Component({
  selector: 'app-new-trainer-wizard',
  templateUrl: './new-trainer-wizard.component.html',
  styleUrls: ['./new-trainer-wizard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NewTrainerWizardComponent implements OnDestroy {
  @Output() closed = new EventEmitter<void>();
  @Output() trainerCreated = new EventEmitter<WizardSuccessEvent>();

  private readonly destroy$ = new Subject<void>();

  currentStep = 1;
  readonly totalSteps = 4;
  isSubmitting = false;
  submitError: string | null = null;

  readonly stepTitles: Record<number, string> = {
    1: 'Datos personales',
    2: 'Residencia',
    3: 'Documento',
    4: 'Cuenta bancaria'
  };

  readonly documentTypeOptions: Array<{ value: DocumentType; label: string }> = [
    { value: 'cc', label: 'Cédula de ciudadanía' },
    { value: 'ce', label: 'Cédula de extranjería' },
    { value: 'ti', label: 'Tarjeta de identidad' },
    { value: 'pa', label: 'Pasaporte' },
    { value: 'nit', label: 'NIT' }
  ];

  readonly bankOptions: Array<{ value: Bank; label: string }> = [
    { value: 'bancolombia', label: 'Bancolombia' },
    { value: 'nequi', label: 'Nequi' }
  ];

  readonly accountTypeOptions: Array<{ value: BankAccountType; label: string }> = [
    { value: 'ahorros', label: 'Ahorros' },
    { value: 'corriente', label: 'Corriente' }
  ];

  // ─── Steps como FormGroups independientes ──────────────────────────────────

  readonly step1: FormGroup = this.fb.group({
    full_name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(/^\d{7,15}$/)]],
    birth_date: ['', [Validators.required, this.birthDateNotFutureValidator]],
    gender: ['']
  });

  readonly step2: FormGroup = this.fb.group({
    address: ['', [Validators.required, Validators.minLength(5)]],
    neighborhood: ['', [Validators.required]]
  });

  readonly step3: FormGroup = this.fb.group({
    document_type: ['', [Validators.required]],
    document_number: ['', [Validators.required, Validators.minLength(4)]]
  });

  readonly step4: FormGroup = this.fb.group(
    {
      bank: ['', [Validators.required]],
      account_type: ['', [Validators.required]],
      account_number: [
        '',
        [Validators.required, Validators.pattern(/^\d{7,20}$/)]
      ]
    },
    { validators: nequiAccountValidator }
  );

  constructor(
    private readonly fb: FormBuilder,
    private readonly trainersService: TrainersService,
    private readonly cdr: ChangeDetectorRef,
    private readonly loader: LoaderService
  ) {
    // Cuando bank cambia a nequi, forzar account_type = 'ahorros'.
    this.step4
      .get('bank')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((bank: Bank) => {
        if (bank === 'nequi') {
          this.step4.get('account_type')!.setValue('ahorros');
        }
        // Revalida account_number al cambiar bank (por la regla de 10 dígitos).
        this.step4.get('account_number')!.updateValueAndValidity();
        this.cdr.markForCheck();
      });
  }

  get currentStepTitle(): string {
    return this.stepTitles[this.currentStep] ?? '';
  }

  get currentStepGroup(): FormGroup {
    const map: Record<number, FormGroup> = {
      1: this.step1,
      2: this.step2,
      3: this.step3,
      4: this.step4
    };
    return map[this.currentStep];
  }

  get isCurrentStepValid(): boolean {
    return this.currentStepGroup.valid;
  }

  get isNequiSelected(): boolean {
    return this.step4.get('bank')?.value === 'nequi';
  }

  get nequiAccountError(): boolean {
    return this.step4.hasError('nequiMustBe10Digits') &&
      (this.step4.get('account_number')?.dirty ?? false);
  }

  goToNextStep(): void {
    if (this.currentStep < this.totalSteps && this.isCurrentStepValid) {
      this.submitError = null;
      this.currentStep++;
      this.cdr.markForCheck();
    }
  }

  goToPreviousStep(): void {
    if (this.currentStep > 1) {
      this.submitError = null;
      this.currentStep--;
      this.cdr.markForCheck();
    }
  }

  submit(): void {
    if (!this.step4.valid || this.isSubmitting) return;

    this.isSubmitting = true;
    this.submitError = null;
    this.loader.show();
    this.cdr.markForCheck();

    const payload = this.buildPayload();

    this.trainersService
      .createTrainer(payload)
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.loader.hide();
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.trainerCreated.emit({ result });
        },
        error: (err) => {
          this.handleSubmitError(err);
        }
      });
  }

  /**
   * Called when the user clicks the backdrop or presses Escape.
   * If the user has already entered data (step > 1 or any field touched),
   * we ask for confirmation before discarding.
   */
  onBackdropClick(): void {
    const hasData = this.currentStep > 1 || this.isAnyStepDirty();
    if (hasData) {
      const confirmed = window.confirm(
        '¿Descartar los datos ingresados? Los cambios no se guardarán.'
      );
      if (!confirmed) return;
    }
    this.closed.emit();
  }

  close(): void {
    this.onBackdropClick();
  }

  private isAnyStepDirty(): boolean {
    return (
      this.step1.dirty ||
      this.step2.dirty ||
      this.step3.dirty ||
      this.step4.dirty
    );
  }

  private buildPayload(): CreateTrainerPayload {
    const s1 = this.step1.value;
    const s2 = this.step2.value;
    const s3 = this.step3.value;
    const s4 = this.step4.value;

    const payload: CreateTrainerPayload = {
      full_name: s1.full_name,
      email: s1.email,
      phone: s1.phone,
      birth_date: s1.birth_date,
      neighborhood: s2.neighborhood,
      address: s2.address,
      document_type: s3.document_type,
      document_number: s3.document_number,
      bank: s4.bank,
      account_type: s4.account_type,
      account_number: s4.account_number
    };

    if (s1.gender) {
      payload.gender = s1.gender;
    }

    return payload;
  }

  private handleSubmitError(err: unknown): void {
    const message = this.extractErrorMessage(err);

    // 422 = email duplicado → volver al step 1 y marcar campo.
    if (this.isEmailDuplicateError(err)) {
      this.currentStep = 1;
      this.step1.get('email')!.setErrors({ emailTaken: true });
      this.submitError = null;
    } else {
      this.submitError = message;
    }
  }

  private isEmailDuplicateError(err: unknown): boolean {
    if (err && typeof err === 'object') {
      const anyErr = err as Record<string, unknown>;
      // La Edge Function devuelve status 422 cuando auth.createUser falla por email duplicado.
      if (anyErr['status'] === 422 || anyErr['code'] === 422) return true;
      const msg = String(anyErr['message'] ?? '').toLowerCase();
      if (msg.includes('already registered') || msg.includes('email')) return true;
    }
    return false;
  }

  private extractErrorMessage(err: unknown): string {
    if (err && typeof err === 'object') {
      const anyErr = err as Record<string, unknown>;
      if (typeof anyErr['message'] === 'string') return anyErr['message'];
    }
    return 'Ocurrió un error inesperado. Intenta de nuevo.';
  }

  private birthDateNotFutureValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value) return null;
    const entered = new Date(control.value);
    if (entered >= new Date()) {
      return { birthDateFuture: true };
    }
    return null;
  }

  trackByValue(_index: number, item: { value: string; label: string }): string {
    return item.value;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
