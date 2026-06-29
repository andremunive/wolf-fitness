import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
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
import { Observable, Subject, combineLatest } from 'rxjs';
import { finalize, map, shareReplay, take, takeUntil } from 'rxjs/operators';

import { AuthService } from 'src/app/core/services/auth.service';
import { LoaderService } from 'src/app/core/services/loader.service';
import { ClientsService } from '../../services/clients.service';
import {
  ActivePaymentSnapshot,
  ClientDetailFull,
  ClientOrigin,
  Plan,
  TrainerOption,
  UpdateClientPayload
} from '../../models/client.model';
import { ClientSearchResult } from '../client-search-input/client-search-input.component';
import { UpgradePlanConfirmResult } from '../upgrade-plan-confirm-modal/upgrade-plan-confirm-modal.component';

type EditTab = 'identity' | 'origin' | 'plan';

@Component({
  selector: 'app-edit-client-modal',
  templateUrl: './edit-client-modal.component.html',
  styleUrls: ['./edit-client-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditClientModalComponent implements OnInit, OnChanges, OnDestroy {
  @Input() client!: ClientDetailFull;
  @Output() closed = new EventEmitter<void>();
  @Output() clientUpdated = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  currentTab: EditTab = 'identity';
  isSaving = false;
  saveError: string | null = null;
  saveSuccess = false;
  isAdmin = false;

  // ─── Estado del modal de confirmación de upgrade ───────────────────────────
  showUpgradeConfirm = false;
  upgradeCurrentPlan: Plan | null = null;
  upgradeNewPlan: Plan | null = null;
  upgradeActivePayment: ActivePaymentSnapshot | null = null;
  /** Payload pendiente de enviar, esperando decisión del usuario en el upgrade modal. */
  private pendingPayload: UpdateClientPayload | null = null;

  /** Referidor actualmente seleccionado (puede cambiar durante edición). */
  selectedReferredBy: ClientSearchResult | null = null;
  /** Nombre del referidor actual para mostrar como valor inicial en el search-input. */
  initialReferredByLabel = '';

  readonly plans$: Observable<Plan[]>;
  readonly trainers$: Observable<TrainerOption[]>;

  readonly tabs: Array<{ id: EditTab; label: string }> = [
    { id: 'identity', label: 'Identidad' },
    { id: 'origin', label: 'Origen' },
    { id: 'plan', label: 'Plan' }
  ];

  readonly originOptions: Array<{ value: string; label: string }> = [
    { value: 'referido', label: 'Referido por otro cliente' },
    { value: 'publicidad', label: 'Publicidad' },
    { value: 'llego_solo', label: 'Llegó solo' }
  ];

  readonly genderOptions: Array<{ value: string; label: string }> = [
    { value: '', label: 'Prefiero no decir' },
    { value: 'male', label: 'Masculino' },
    { value: 'female', label: 'Femenino' }
  ];

  // ─── Form groups por pestaña ───────────────────────────────────────────────

  readonly identityForm: FormGroup = this.fb.group({
    full_name: ['', [Validators.required, Validators.minLength(3)]],
    phone: ['', [Validators.required, Validators.pattern(/^\d{7,15}$/)]],
    birth_date: ['', [Validators.required, this.birthDateValidator]],
    gender: [''],
    height_cm: [null, [Validators.min(50), Validators.max(250)]],
    neighborhood: ['', [Validators.required]]
  });

  readonly originForm: FormGroup = this.fb.group({
    origin: ['', [Validators.required]]
  });

  readonly planForm: FormGroup = this.fb.group({
    plan_id: ['', [Validators.required]],
    trainer_id: ['']
  });

  private originalValues!: ReturnType<typeof this.captureValues>;
  private originalReferredById: string | null = null;

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
    this.authService.profile$
      .pipe(takeUntil(this.destroy$))
      .subscribe((profile) => {
        this.isAdmin = profile?.role === 'admin';
        this.cdr.markForCheck();
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['client'] && this.client) {
      this.patchForms();
    }
  }

  get avatarInitials(): string {
    return this.client.fullName
      .split(' ')
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  get isReferidoSelected(): boolean {
    return this.originForm.get('origin')?.value === 'referido';
  }

  get activeForm(): FormGroup {
    const map: Record<EditTab, FormGroup> = {
      identity: this.identityForm,
      origin: this.originForm,
      plan: this.planForm
    };
    return map[this.currentTab];
  }

  get hasChanges(): boolean {
    const current = this.captureValues();
    const formChanged =
      JSON.stringify(current) !== JSON.stringify(this.originalValues);
    const referredByChanged =
      (this.selectedReferredBy?.id ?? null) !== this.originalReferredById;
    return formChanged || referredByChanged;
  }

  onReferidoSelected(result: ClientSearchResult | null): void {
    this.selectedReferredBy = result;
    this.cdr.markForCheck();
  }

  switchTab(tab: EditTab): void {
    this.currentTab = tab;
    this.saveError = null;
    this.cdr.markForCheck();
  }

  save(): void {
    if (!this.hasChanges || this.isSaving) return;

    const payload = this.buildPatchPayload();

    if (payload.new_plan_id) {
      this.buildUpgradeSnapshot$(payload.new_plan_id).pipe(
        take(1),
        takeUntil(this.destroy$)
      ).subscribe({
        next: (snapshot) => {
          if (snapshot) {
            this.pendingPayload = payload;
            this.upgradeCurrentPlan = snapshot.currentPlan;
            this.upgradeNewPlan = snapshot.newPlan;
            this.upgradeActivePayment = snapshot.activePayment;
            this.showUpgradeConfirm = true;
          } else {
            this.dispatchUpdate(payload);
          }
          this.cdr.markForCheck();
        },
        error: () => {
          // Si falla la consulta del pago activo, ejecutamos el cambio normal sin modal.
          this.dispatchUpdate(payload);
        }
      });
      return;
    }

    this.dispatchUpdate(payload);
  }

  onUpgradeConfirmed(result: UpgradePlanConfirmResult): void {
    this.showUpgradeConfirm = false;

    if (!this.pendingPayload) return;

    const payload: UpdateClientPayload = {
      ...this.pendingPayload,
      apply_plan_change_to_current_payment: result.applyToCurrent
    };
    this.pendingPayload = null;
    this.upgradeCurrentPlan = null;
    this.upgradeNewPlan = null;
    this.upgradeActivePayment = null;

    this.dispatchUpdate(payload);
    this.cdr.markForCheck();
  }

  onUpgradeCancelled(): void {
    this.showUpgradeConfirm = false;
    this.pendingPayload = null;
    this.upgradeCurrentPlan = null;
    this.upgradeNewPlan = null;
    this.upgradeActivePayment = null;
    this.cdr.markForCheck();
  }

  private dispatchUpdate(payload: UpdateClientPayload): void {
    this.isSaving = true;
    this.saveError = null;
    this.saveSuccess = false;
    this.loader.show();
    this.cdr.markForCheck();

    this.clientsService
      .updateClient(payload)
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.loader.hide();
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.saveSuccess = true;
          this.originalValues = this.captureValues();
          this.originalReferredById = this.selectedReferredBy?.id ?? null;
          this.clientUpdated.emit();
        },
        error: (err) => {
          this.saveError = this.extractErrorMessage(err);
        }
      });
  }

  /**
   * Evalúa de forma reactiva si se cumplen las condiciones para mostrar el modal de upgrade.
   * Combina plans$ con una consulta real a Supabase para obtener el pago activo con sus
   * campos exactos (descuento, amount_received), eliminando las estimaciones incorrectas.
   *
   * Condiciones para mostrar el modal:
   * 1. Existe un pago activo vigente (status paid/partial, period_end >= hoy, no anulado).
   * 2. El nuevo plan es más caro que el plan_total_cop del pago activo.
   *
   * Devuelve null si alguna condición no se cumple.
   */
  private buildUpgradeSnapshot$(newPlanId: string): Observable<{
    currentPlan: Plan;
    newPlan: Plan;
    activePayment: ActivePaymentSnapshot;
  } | null> {
    return combineLatest([
      this.plans$,
      this.clientsService.getActivePaymentSnapshot(this.client.id)
    ]).pipe(
      map(([plans, activePayment]) => {
        if (!activePayment) return null;

        const newPlan = plans.find((p) => p.id === newPlanId) ?? null;
        if (!newPlan) return null;

        const newPlanAmountCop = newPlan.amountCop ?? 0;

        // Solo es upgrade si el nuevo plan es estrictamente más caro que el total actual del pago.
        if (newPlanAmountCop <= activePayment.planTotalCop) return null;

        // currentPlan se reconstruye desde los datos del pago activo + la lista de planes.
        // El planId del cliente puede haber cambiado ya en memoria, por eso usamos el
        // plan_total_cop del pago activo para identificar el plan original por precio.
        const currentPlan: Plan = {
          id: this.client.planId,
          name: this.client.planName,
          code: '',
          amountCop: activePayment.planTotalCop
        };

        return { currentPlan, newPlan, activePayment };
      })
    );
  }

  closeWithConfirmation(): void {
    if (this.hasChanges) {
      const confirmed = window.confirm('¿Descartar los cambios sin guardar?');
      if (!confirmed) return;
    }
    this.closed.emit();
  }

  close(): void {
    this.closeWithConfirmation();
  }

  trackByTabId(_index: number, tab: { id: string; label: string }): string {
    return tab.id;
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

  private patchForms(): void {
    const c = this.client;

    this.identityForm.patchValue(
      {
        full_name: c.fullName,
        phone: c.phone,
        birth_date: c.birthDate,
        gender: c.gender ?? '',
        height_cm: c.heightCm ?? null,
        neighborhood: c.neighborhood
      },
      { emitEvent: false }
    );

    this.originForm.patchValue({ origin: c.origin }, { emitEvent: false });

    this.planForm.patchValue(
      {
        plan_id: c.planId,
        trainer_id: c.trainerId ?? ''
      },
      { emitEvent: false }
    );

    // Inicializa el search-input de referidor con el nombre actual.
    this.initialReferredByLabel = c.referredByName ?? '';
    this.originalReferredById = c.referredById;
    if (c.referredById && c.referredByName) {
      this.selectedReferredBy = { id: c.referredById, fullName: c.referredByName };
    } else {
      this.selectedReferredBy = null;
    }

    this.originalValues = this.captureValues();
    this.cdr.markForCheck();
  }

  private captureValues() {
    return {
      identity: this.identityForm.value,
      origin: this.originForm.value,
      plan: this.planForm.value
    };
  }

  private buildPatchPayload(): UpdateClientPayload {
    const original = this.originalValues;
    const current = this.captureValues();

    const payload: UpdateClientPayload = { client_id: this.client.id };

    // ─── Perfil ──────────────────────────────────────────────────────────────
    const profileChanges: UpdateClientPayload['profile'] = {};

    if (current.identity.full_name !== original.identity.full_name) {
      profileChanges.full_name = current.identity.full_name;
    }
    if (current.identity.phone !== original.identity.phone) {
      profileChanges.phone = current.identity.phone;
    }
    if (current.identity.birth_date !== original.identity.birth_date) {
      profileChanges.birth_date = current.identity.birth_date;
    }
    if (current.identity.neighborhood !== original.identity.neighborhood) {
      profileChanges.neighborhood = current.identity.neighborhood;
    }
    if (current.identity.gender !== original.identity.gender) {
      profileChanges.gender = current.identity.gender || null;
    }
    if (current.identity.height_cm !== original.identity.height_cm) {
      profileChanges.height_cm = current.identity.height_cm ?? null;
    }
    if (Object.keys(profileChanges).length > 0) {
      payload.profile = profileChanges;
    }

    // ─── Origen / referido ────────────────────────────────────────────────────
    if (current.origin.origin !== original.origin.origin) {
      payload.origin = current.origin.origin as ClientOrigin;
    }

    const currentReferredById = this.selectedReferredBy?.id ?? null;
    if (currentReferredById !== this.originalReferredById) {
      payload.referred_by = currentReferredById;
    }

    // ─── Plan ─────────────────────────────────────────────────────────────────
    if (current.plan.plan_id !== original.plan.plan_id) {
      payload.new_plan_id = current.plan.plan_id;
    }

    // ─── Trainer (solo admin) ─────────────────────────────────────────────────
    if (this.isAdmin && current.plan.trainer_id !== original.plan.trainer_id) {
      payload.new_trainer_id = current.plan.trainer_id || null;
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
      const code = typeof anyErr['code'] === 'string' ? anyErr['code'] : null;

      switch (code) {
        case '42501':
          return 'No tienes permiso para realizar esta accion.';
        case 'P0001':
          return 'Cliente no encontrado. Recarga la pagina.';
        case 'P0002':
          return 'El plan seleccionado ya no esta disponible.';
        case 'P0003':
          return 'El plan seleccionado no tiene precio configurado.';
        case 'P0005':
          return 'Solo se puede aplicar a la mensualidad actual cuando el nuevo plan es mas caro.';
        case 'P0006':
          return 'El cliente no tiene una mensualidad activa vigente.';
        default:
          break;
      }

      if (typeof anyErr['message'] === 'string') return anyErr['message'];
    }
    return 'Ocurrio un error al guardar. Intenta de nuevo.';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
