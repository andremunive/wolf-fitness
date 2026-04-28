/*
 * Wizard de 3 pasos para registrar un cliente.
 *
 * DECISIÓN de diseño (cantidad de pasos):
 * El trainer wizard tiene 4 pasos porque el paso 2 incluye dirección Y barrio.
 * El cliente solo necesita "barrio" (neighborhood) como dato de residencia,
 * un solo campo que no justifica un paso completo propio.
 * Por eso se fusionó con el paso 1 (Datos personales), resultando en 3 pasos:
 *   1) Datos personales (nombre, email, teléfono, fecha, género, barrio)
 *   2) Origen y referido (origin, referred_by si aplica)
 *   3) Plan y entrenador (plan_id, trainer_id si el invocador es admin)
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
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

/** Retorna la fecha actual en formato YYYY-MM-DD (zona local del dispositivo). */
function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Valida que joined_at no sea una fecha futura.
 * El máximo permitido es hoy; el backend rechaza fechas futuras con 422.
 * Definida fuera de la clase para poder referenciarla en los metadatos del FormGroup.
 */
function joinedAtNotFutureValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  // Comparamos solo la parte de fecha (YYYY-MM-DD) para evitar problemas de zona horaria.
  if (control.value > todayIsoDate()) {
    return { joinedAtFuture: true };
  }
  return null;
}
import { Observable, Subject } from 'rxjs';
import { finalize, shareReplay, takeUntil } from 'rxjs/operators';

import { AuthService } from 'src/app/core/services/auth.service';
import { LoaderService } from 'src/app/core/services/loader.service';
import { ClientsService } from '../../services/clients.service';
import {
  CreateClientPayload,
  CreateClientResult,
  Plan,
  TrainerOption
} from '../../models/client.model';
import { ClientSearchResult } from '../client-search-input/client-search-input.component';

export interface ClientWizardSuccessEvent {
  result: CreateClientResult;
}

@Component({
  selector: 'app-new-client-wizard',
  templateUrl: './new-client-wizard.component.html',
  styleUrls: ['./new-client-wizard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NewClientWizardComponent implements OnInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();
  @Output() clientCreated = new EventEmitter<ClientWizardSuccessEvent>();

  private readonly destroy$ = new Subject<void>();

  currentStep = 1;
  readonly totalSteps = 3;
  isSubmitting = false;
  submitError: string | null = null;

  /** UUID del referidor seleccionado por el search-input. */
  referredById: string | null = null;

  /** Si el rol del usuario es 'admin', se muestra el selector de trainer. */
  isAdmin = false;

  /** Planes y trainers cargados desde BD. */
  readonly plans$: Observable<Plan[]>;
  readonly trainers$: Observable<TrainerOption[]>;

  readonly stepTitles: Record<number, string> = {
    1: 'Datos personales',
    2: 'Origen y referido',
    3: 'Plan y entrenador'
  };

  readonly originOptions: Array<{ value: string; label: string }> = [
    { value: 'referido', label: 'Referido por otro cliente' },
    { value: 'publicidad', label: 'Publicidad' },
    { value: 'llego_solo', label: 'Llegó solo' }
  ];

  readonly genderOptions: Array<{ value: string; label: string }> = [
    { value: 'male', label: 'Masculino' },
    { value: 'female', label: 'Femenino' },
    { value: 'other', label: 'Otro' },
    { value: 'prefer_not_to_say', label: 'Prefiero no especificar' }
  ];

  // ─── Steps como FormGroups independientes ──────────────────────────────────

  readonly step1: FormGroup = this.fb.group({
    full_name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    phone: [
      '',
      [Validators.required, Validators.pattern(/^\d{7,15}$/)]
    ],
    birth_date: ['', [Validators.required, this.birthDateNotFutureValidator]],
    gender: [''],
    neighborhood: ['', [Validators.required]]
  });

  readonly step2: FormGroup = this.fb.group({
    origin: ['', [Validators.required]]
  });

  readonly step3: FormGroup = this.fb.group({
    joined_at: [todayIsoDate(), [Validators.required, joinedAtNotFutureValidator]],
    plan_id: ['', [Validators.required]],
    trainer_id: ['']
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly clientsService: ClientsService,
    private readonly authService: AuthService,
    private readonly cdr: ChangeDetectorRef,
    private readonly loader: LoaderService
  ) {
    this.plans$ = this.clientsService.getActivePlans().pipe(shareReplay(1));
    this.trainers$ = this.clientsService.getActiveTrainers().pipe(shareReplay(1));
  }

  ngOnInit(): void {
    // Detecta el rol del usuario para mostrar/ocultar el selector de trainer.
    this.authService.profile$
      .pipe(takeUntil(this.destroy$))
      .subscribe((profile) => {
        this.isAdmin = profile?.role === 'admin';
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
      3: this.step3
    };
    return map[this.currentStep];
  }

  get isCurrentStepValid(): boolean {
    if (this.currentStep === 2) {
      const origin = this.step2.get('origin')?.value;
      if (origin === 'referido' && !this.referredById) {
        return false;
      }
    }
    return this.currentStepGroup.valid;
  }

  get isReferidoSelected(): boolean {
    return this.step2.get('origin')?.value === 'referido';
  }

  onReferidoSelected(result: ClientSearchResult | null): void {
    this.referredById = result?.id ?? null;
    this.cdr.markForCheck();
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
    if (!this.isCurrentStepValid || this.isSubmitting) return;

    this.isSubmitting = true;
    this.submitError = null;
    this.loader.show();
    this.cdr.markForCheck();

    const payload = this.buildPayload();

    this.clientsService
      .createClient(payload)
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
          this.clientCreated.emit({ result });
        },
        error: (err) => {
          this.handleSubmitError(err);
        }
      });
  }

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
    return this.step1.dirty || this.step2.dirty || this.step3.dirty;
  }

  trackByValue(_index: number, item: { value: string; label: string }): string {
    return item.value;
  }

  trackByPlanId(_index: number, plan: Plan): string {
    return plan.id;
  }

  trackByTrainerId(_index: number, trainer: TrainerOption): string {
    return trainer.id;
  }

  formatCop(amount: number | null): string {
    if (amount === null) return '';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount);
  }

  private buildPayload(): CreateClientPayload {
    const s1 = this.step1.value;
    const s2 = this.step2.value;
    const s3 = this.step3.value;

    const payload: CreateClientPayload = {
      full_name: s1.full_name,
      email: s1.email,
      phone: s1.phone,
      birth_date: s1.birth_date,
      neighborhood: s1.neighborhood,
      origin: s2.origin,
      plan_id: s3.plan_id
    };

    if (s1.gender) {
      payload.gender = s1.gender;
    }

    if (s2.origin === 'referido' && this.referredById) {
      payload.referred_by = this.referredById;
    }

    // Solo admin puede enviar trainer_id.
    if (this.isAdmin && s3.trainer_id) {
      payload.trainer_id = s3.trainer_id;
    }

    return payload;
  }

  private handleSubmitError(err: unknown): void {
    if (this.isEmailDuplicateError(err)) {
      // Email duplicado: volver al paso 1 y marcar el campo.
      this.currentStep = 1;
      this.step1.get('email')!.setErrors({ emailTaken: true });
      this.submitError = null;
    } else {
      this.submitError = this.extractErrorMessage(err);
    }
  }

  private isEmailDuplicateError(err: unknown): boolean {
    if (err && typeof err === 'object') {
      const anyErr = err as Record<string, unknown>;
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

  private birthDateNotFutureValidator(
    control: AbstractControl
  ): ValidationErrors | null {
    if (!control.value) return null;
    const entered = new Date(control.value);
    if (entered >= new Date()) {
      return { birthDateFuture: true };
    }
    return null;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
