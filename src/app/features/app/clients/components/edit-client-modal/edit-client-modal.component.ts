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
import { Observable, Subject } from 'rxjs';
import { finalize, shareReplay, takeUntil } from 'rxjs/operators';

import { AuthService } from 'src/app/core/services/auth.service';
import { LoaderService } from 'src/app/core/services/loader.service';
import { ClientsService } from '../../services/clients.service';
import {
  ClientDetailFull,
  ClientOrigin,
  Plan,
  TrainerOption,
  UpdateClientPayload
} from '../../models/client.model';
import { ClientSearchResult } from '../client-search-input/client-search-input.component';

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
    { value: 'female', label: 'Femenino' },
    { value: 'other', label: 'Otro' },
    { value: 'prefer_not_to_say', label: 'Prefiero no especificar' }
  ];

  // ─── Form groups por pestaña ───────────────────────────────────────────────

  readonly identityForm: FormGroup = this.fb.group({
    full_name: ['', [Validators.required, Validators.minLength(3)]],
    phone: ['', [Validators.required, Validators.pattern(/^\d{7,15}$/)]],
    birth_date: ['', [Validators.required, this.birthDateValidator]],
    gender: [''],
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

    this.isSaving = true;
    this.saveError = null;
    this.saveSuccess = false;
    this.loader.show();
    this.cdr.markForCheck();

    const payload = this.buildPatchPayload();

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
      if (typeof anyErr['message'] === 'string') return anyErr['message'];
    }
    return 'Ocurrió un error al guardar. Intenta de nuevo.';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
