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
import { ServiceProvidersService } from '../../services/service-providers.service';
import {
  Bank,
  BankAccountType,
  DocumentType,
  ProviderEntityType,
  ServiceProviderViewModel,
  ServiceTypeViewModel
} from '../../models/service-provider.model';
import { BANK_LABELS } from '../shared/display-labels';

export interface ServiceProviderCreatedEvent {
  provider: ServiceProviderViewModel;
}

function emailOrEmptyValidator(control: AbstractControl): ValidationErrors | null {
  const v = (control.value ?? '').trim();
  if (!v) return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(v) ? null : { invalidEmail: true };
}

@Component({
  selector: 'app-new-service-provider-wizard',
  templateUrl: './new-service-provider-wizard.component.html',
  styleUrls: ['./new-service-provider-wizard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NewServiceProviderWizardComponent implements OnInit, OnDestroy {
  @Input() serviceTypes: ServiceTypeViewModel[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() providerCreated = new EventEmitter<ServiceProviderCreatedEvent>();

  private readonly destroy$ = new Subject<void>();

  currentStep = 1;
  readonly totalSteps = 3;
  isSubmitting = false;
  submitError: string | null = null;

  readonly stepTitles: Record<number, string> = {
    1: 'Identidad',
    2: 'Contacto',
    3: 'Cuenta bancaria'
  };

  // ─── Options ─────────────────────────────────────────────────────────────────

  readonly documentTypeOptions: Array<{ value: DocumentType; label: string }> = [
    { value: 'cc', label: 'Cédula de ciudadanía (CC)' },
    { value: 'ce', label: 'Cédula de extranjería (CE)' },
    { value: 'ti', label: 'Tarjeta de identidad (TI)' },
    { value: 'pa', label: 'Pasaporte (PA)' },
    { value: 'nit', label: 'NIT' }
  ];

  readonly entityTypeOptions: Array<{ value: ProviderEntityType; label: string }> = [
    { value: 'persona', label: 'Persona natural' },
    { value: 'empresa', label: 'Empresa' }
  ];

  readonly bankOptions: Array<{ value: Bank; label: string }> = Object.entries(BANK_LABELS).map(
    ([value, label]) => ({ value: value as Bank, label })
  );

  readonly accountTypeOptions: Array<{ value: BankAccountType; label: string }> = [
    { value: 'ahorros', label: 'Ahorros' },
    { value: 'corriente', label: 'Corriente' }
  ];

  // ─── Forms ────────────────────────────────────────────────────────────────────

  readonly step1: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    entity_type: ['persona' as ProviderEntityType, [Validators.required]],
    document_type: ['cc' as DocumentType, [Validators.required]],
    document_number: ['', [Validators.required, Validators.minLength(4)]],
    service_type_id: ['', [Validators.required]]
  });

  readonly step2: FormGroup = this.fb.group({
    phone: ['', [Validators.pattern(/^\d{7,15}$/)]],
    email: ['', [emailOrEmptyValidator]],
    description: ['']
  });

  /** Step 3 is optional — the user can skip it without filling any field. */
  readonly step3: FormGroup = this.fb.group({
    bank: [''],
    account_type: [''],
    account_number: [''],
    account_holder_name: ['']
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly serviceProvidersService: ServiceProvidersService,
    private readonly cdr: ChangeDetectorRef,
    private readonly loader: LoaderService
  ) {}

  ngOnInit(): void {
    // When entity_type changes to 'empresa', auto-suggest NIT.
    this.step1
      .get('entity_type')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((entityType: ProviderEntityType) => {
        if (entityType === 'empresa') {
          this.step1.get('document_type')!.setValue('nit');
        } else if (this.step1.get('document_type')!.value === 'nit') {
          this.step1.get('document_type')!.setValue('cc');
        }
        this.cdr.markForCheck();
      });
  }

  get currentStepTitle(): string {
    return this.stepTitles[this.currentStep] ?? '';
  }

  get currentStepGroup(): FormGroup {
    const map: Record<number, FormGroup> = { 1: this.step1, 2: this.step2, 3: this.step3 };
    return map[this.currentStep];
  }

  /** Step 3 is optional — it's always considered valid for navigation purposes. */
  get isCurrentStepValid(): boolean {
    if (this.currentStep === 3) return true;
    return this.currentStepGroup.valid;
  }

  /** True when step 3 has any data entered (bank fields partially filled). */
  get hasBankData(): boolean {
    const v = this.step3.value;
    return !!(v.bank || v.account_number);
  }

  /** True when step 3 has enough data to create a bank account. */
  get isBankDataComplete(): boolean {
    const v = this.step3.value;
    return !!(v.bank && v.account_type && v.account_number?.trim());
  }

  get isLastStep(): boolean {
    return this.currentStep === this.totalSteps;
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

  /** Called both from "Guardar" on step 3 and from a "Omitir y guardar" link. */
  submit(): void {
    if (!this.step1.valid || this.isSubmitting) return;

    // If step 3 is partially filled, validate it before submitting.
    if (this.hasBankData && !this.isBankDataComplete) {
      this.submitError = 'Completa los campos de la cuenta bancaria (banco, tipo y número) o déjalos todos vacíos.';
      this.cdr.markForCheck();
      return;
    }

    this.isSubmitting = true;
    this.submitError = null;
    this.loader.show();
    this.cdr.markForCheck();

    const providerPayload = {
      name: this.step1.value.name,
      entity_type: this.step1.value.entity_type,
      document_type: this.step1.value.document_type,
      document_number: this.step1.value.document_number,
      service_type_id: this.step1.value.service_type_id,
      phone: this.step2.value.phone?.trim() || null,
      email: this.step2.value.email?.trim() || null,
      description: this.step2.value.description?.trim() || null
    };

    const bankPayload = this.isBankDataComplete
      ? {
          bank: this.step3.value.bank,
          account_type: this.step3.value.account_type,
          account_number: this.step3.value.account_number,
          account_holder_name: this.step3.value.account_holder_name?.trim() || null,
          is_primary: true
        }
      : undefined;

    this.serviceProvidersService
      .create(providerPayload, bankPayload)
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.loader.hide();
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (provider) => {
          this.providerCreated.emit({ provider });
        },
        error: (err) => {
          this.submitError = this.extractErrorMessage(err);
        }
      });
  }

  onBackdropClick(): void {
    const hasData = this.currentStep > 1 || this.step1.dirty || this.step2.dirty;
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

  trackByValue(_index: number, item: { value: string; label: string }): string {
    return item.value;
  }

  trackByTypeId(_index: number, item: ServiceTypeViewModel): string {
    return item.id;
  }

  private extractErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object') {
      const anyErr = err as Record<string, unknown>;
      if (typeof anyErr['message'] === 'string') return anyErr['message'];
    }
    return 'Ocurrió un error inesperado. Intenta de nuevo.';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
