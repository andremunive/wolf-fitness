import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { TrainersService } from '../../services/trainers.service';
import {
  Bank,
  BankAccountType,
  DocumentType,
  TrainerDetailFull,
  UpdateTrainerPayload
} from '../../models/trainer.model';

function nequiAccountValidator(group: AbstractControl): ValidationErrors | null {
  const bank = group.get('bank')?.value as Bank | null;
  const accountNumber = (group.get('account_number')?.value ?? '') as string;
  if (bank === 'nequi' && !/^\d{10}$/.test(accountNumber)) {
    return { nequiMustBe10Digits: true };
  }
  return null;
}

@Component({
  selector: 'app-edit-trainer-modal',
  templateUrl: './edit-trainer-modal.component.html',
  styleUrls: ['./edit-trainer-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditTrainerModalComponent implements OnChanges, OnDestroy {
  @Input() trainer!: TrainerDetailFull;
  @Output() closed = new EventEmitter<void>();
  @Output() trainerUpdated = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  currentTab: 'identity' | 'address' | 'document' | 'bank' = 'identity';
  isSaving = false;
  saveError: string | null = null;
  saveSuccess = false;

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

  readonly tabs: Array<{ id: 'identity' | 'address' | 'document' | 'bank'; label: string }> = [
    { id: 'identity', label: 'Identidad' },
    { id: 'address', label: 'Residencia' },
    { id: 'document', label: 'Documento' },
    { id: 'bank', label: 'Banco' }
  ];

  // ─── Form groups por sección ───────────────────────────────────────────────

  readonly identityForm: FormGroup = this.fb.group({
    full_name: ['', [Validators.required, Validators.minLength(3)]],
    phone: ['', [Validators.required, Validators.pattern(/^\d{7,15}$/)]],
    birth_date: ['', [Validators.required, this.birthDateValidator]],
    gender: ['']
  });

  readonly addressForm: FormGroup = this.fb.group({
    address: ['', [Validators.required, Validators.minLength(5)]],
    neighborhood: ['', [Validators.required]]
  });

  readonly documentForm: FormGroup = this.fb.group({
    document_type: ['', [Validators.required]],
    document_number: ['', [Validators.required, Validators.minLength(4)]]
  });

  readonly bankForm: FormGroup = this.fb.group(
    {
      bank: ['', [Validators.required]],
      account_type: ['', [Validators.required]],
      account_number: ['', [Validators.required, Validators.pattern(/^\d{7,20}$/)]]
    },
    { validators: nequiAccountValidator }
  );

  // Snapshot del valor original para comparación de dirty-check.
  private originalValues!: ReturnType<typeof this.captureValues>;

  constructor(
    private readonly fb: FormBuilder,
    private readonly trainersService: TrainersService,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.bankForm
      .get('bank')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((bank: Bank) => {
        if (bank === 'nequi') {
          this.bankForm.get('account_type')!.setValue('ahorros');
        }
        this.bankForm.get('account_number')!.updateValueAndValidity();
        this.cdr.markForCheck();
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['trainer'] && this.trainer) {
      this.patchForms();
    }
  }

  get avatarInitials(): string {
    return this.trainer.fullName
      .split(' ')
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  get isNequiSelected(): boolean {
    return this.bankForm.get('bank')?.value === 'nequi';
  }

  get nequiAccountError(): boolean {
    return this.bankForm.hasError('nequiMustBe10Digits') &&
      (this.bankForm.get('account_number')?.dirty ?? false);
  }

  get hasChanges(): boolean {
    const current = this.captureValues();
    return JSON.stringify(current) !== JSON.stringify(this.originalValues);
  }

  get isCurrentFormValid(): boolean {
    return this.activeForm.valid;
  }

  get activeForm(): FormGroup {
    const map: Record<string, FormGroup> = {
      identity: this.identityForm,
      address: this.addressForm,
      document: this.documentForm,
      bank: this.bankForm
    };
    return map[this.currentTab];
  }

  switchTab(tab: typeof this.currentTab): void {
    this.currentTab = tab;
    this.saveError = null;
    this.cdr.markForCheck();
  }

  save(): void {
    if (!this.hasChanges || this.isSaving) return;

    this.isSaving = true;
    this.saveError = null;
    this.saveSuccess = false;
    this.cdr.markForCheck();

    const payload = this.buildPatchPayload();

    this.trainersService
      .updateTrainer(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.saveSuccess = true;
          this.originalValues = this.captureValues();
          this.trainerUpdated.emit();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSaving = false;
          this.saveError = this.extractErrorMessage(err);
          this.cdr.markForCheck();
        }
      });
  }

  close(): void {
    this.closed.emit();
  }

  trackByTabId(_index: number, tab: { id: string; label: string }): string {
    return tab.id;
  }

  trackByValue(_index: number, item: { value: string; label: string }): string {
    return item.value;
  }

  private patchForms(): void {
    const t = this.trainer;

    this.identityForm.patchValue({
      full_name: t.fullName,
      phone: t.phone,
      birth_date: t.birthDate,
      gender: t.gender ?? ''
    }, { emitEvent: false });

    this.addressForm.patchValue({
      address: t.details?.address ?? '',
      neighborhood: t.neighborhood
    }, { emitEvent: false });

    this.documentForm.patchValue({
      document_type: t.details?.documentType ?? '',
      document_number: t.details?.documentNumber ?? ''
    }, { emitEvent: false });

    this.bankForm.patchValue({
      bank: t.bankAccount?.bank ?? '',
      account_type: t.bankAccount?.accountType ?? '',
      account_number: t.bankAccount?.accountNumber ?? ''
    }, { emitEvent: false });

    this.originalValues = this.captureValues();
    this.cdr.markForCheck();
  }

  private captureValues() {
    return {
      identity: this.identityForm.value,
      address: this.addressForm.value,
      document: this.documentForm.value,
      bank: this.bankForm.value
    };
  }

  private buildPatchPayload(): UpdateTrainerPayload {
    const original = this.originalValues;
    const current = this.captureValues();

    const payload: UpdateTrainerPayload = { trainer_id: this.trainer.id };

    // Solo incluye campos que cambiaron — PATCH parcial.
    const profileChanges: UpdateTrainerPayload['profile'] = {};
    if (current.identity.full_name !== original.identity.full_name) {
      profileChanges.full_name = current.identity.full_name;
    }
    if (current.identity.phone !== original.identity.phone) {
      profileChanges.phone = current.identity.phone;
    }
    if (current.identity.birth_date !== original.identity.birth_date) {
      profileChanges.birth_date = current.identity.birth_date;
    }
    if (current.identity.gender !== original.identity.gender) {
      profileChanges.gender = current.identity.gender || undefined;
    }
    if (current.address.neighborhood !== original.address.neighborhood) {
      profileChanges.neighborhood = current.address.neighborhood;
    }
    if (Object.keys(profileChanges).length > 0) {
      payload.profile = profileChanges;
    }

    const detailChanges: UpdateTrainerPayload['trainer_details'] = {};
    if (current.address.address !== original.address.address) {
      detailChanges.address = current.address.address;
    }
    if (current.document.document_type !== original.document.document_type) {
      detailChanges.document_type = current.document.document_type;
    }
    if (current.document.document_number !== original.document.document_number) {
      detailChanges.document_number = current.document.document_number;
    }
    if (Object.keys(detailChanges).length > 0) {
      payload.trainer_details = detailChanges;
    }

    const bankChanges: UpdateTrainerPayload['bank_account'] = {};
    if (current.bank.bank !== original.bank.bank) {
      bankChanges.bank = current.bank.bank;
    }
    if (current.bank.account_type !== original.bank.account_type) {
      bankChanges.account_type = current.bank.account_type;
    }
    if (current.bank.account_number !== original.bank.account_number) {
      bankChanges.account_number = current.bank.account_number;
    }
    if (Object.keys(bankChanges).length > 0) {
      payload.bank_account = bankChanges;
    }

    return payload;
  }

  private birthDateValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value) return null;
    const entered = new Date(control.value);
    if (entered >= new Date()) return { birthDateFuture: true };
    return null;
  }

  private extractErrorMessage(err: unknown): string {
    if (err && typeof err === 'object') {
      const anyErr = err as Record<string, unknown>;
      if (typeof anyErr['message'] === 'string') return anyErr['message'];
    }
    return 'Ocurrió un error al guardar. Intenta de nuevo.';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
