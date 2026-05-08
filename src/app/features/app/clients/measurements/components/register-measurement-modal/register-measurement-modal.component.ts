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
  ValidatorFn,
  Validators
} from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { ToastService } from 'src/app/shared/services/toast.service';

import { ClientDetailFull } from 'src/app/features/app/clients/models/client.model';
import { ClientMeasurementInsert } from 'src/app/core/types/supabase';
import { MeasurementsService } from '../../services/measurements.service';
import {
  JacksonPollock9Calculator,
  Skinfolds
} from '../../utils/jackson-pollock9.calculator';

/** Names of the 9 skinfold fields in the form (matches DB column suffix). */
const SKINFOLD_FIELDS = [
  'skinfold_chest_mm',
  'skinfold_axilla_mm',
  'skinfold_subscapular_mm',
  'skinfold_biceps_mm',
  'skinfold_triceps_mm',
  'skinfold_abdomen_mm',
  'skinfold_suprailiac_mm',
  'skinfold_thigh_mm',
  'skinfold_calf_mm'
] as const;

/** Names of the 9 circumference fields in the form. */
const CIRCUMFERENCE_FIELDS = [
  'calf_left_cm',
  'calf_right_cm',
  'thigh_left_cm',
  'thigh_right_cm',
  'hip_cm',
  'abdomen_cm',
  'chest_cm',
  'arm_left_cm',
  'arm_right_cm'
] as const;

/** Max values per circumference field (cm). */
const CIRCUMFERENCE_MAX: Record<string, number> = {
  calf_left_cm: 150,
  calf_right_cm: 150,
  thigh_left_cm: 120,
  thigh_right_cm: 120,
  hip_cm: 200,
  abdomen_cm: 200,
  chest_cm: 200,
  arm_left_cm: 100,
  arm_right_cm: 100
};

/** Human-readable labels for every numeric field. */
export const FIELD_LABELS: Record<string, string> = {
  weight_kg: 'Peso',
  calf_left_cm: 'Pantorrilla izquierda',
  calf_right_cm: 'Pantorrilla derecha',
  thigh_left_cm: 'Muslo izquierdo',
  thigh_right_cm: 'Muslo derecho',
  hip_cm: 'Glúteos',
  abdomen_cm: 'Abdomen',
  chest_cm: 'Pecho',
  arm_left_cm: 'Brazo izquierdo',
  arm_right_cm: 'Brazo derecho',
  skinfold_chest_mm: 'Pectoral',
  skinfold_axilla_mm: 'Midaxilar',
  skinfold_subscapular_mm: 'Subescapular',
  skinfold_biceps_mm: 'Bicipital',
  skinfold_triceps_mm: 'Tricipital',
  skinfold_abdomen_mm: 'Abdominal',
  skinfold_suprailiac_mm: 'Suprailíaco',
  skinfold_thigh_mm: 'Cuadricipital',
  skinfold_calf_mm: 'Pantorrilla (peroneal)',
  body_fat_pct: '% Grasa'
};

export const FIELD_UNITS: Record<string, string> = {
  weight_kg: 'kg',
  calf_left_cm: 'cm',
  calf_right_cm: 'cm',
  thigh_left_cm: 'cm',
  thigh_right_cm: 'cm',
  hip_cm: 'cm',
  abdomen_cm: 'cm',
  chest_cm: 'cm',
  arm_left_cm: 'cm',
  arm_right_cm: 'cm',
  skinfold_chest_mm: 'mm',
  skinfold_axilla_mm: 'mm',
  skinfold_subscapular_mm: 'mm',
  skinfold_biceps_mm: 'mm',
  skinfold_triceps_mm: 'mm',
  skinfold_abdomen_mm: 'mm',
  skinfold_suprailiac_mm: 'mm',
  skinfold_thigh_mm: 'mm',
  skinfold_calf_mm: 'mm',
  body_fat_pct: '%'
};

/** Validator: at least one block toggle must be active. */
function atLeastOneBlockActiveValidator(): ValidatorFn {
  return (group: AbstractControl) => {
    const fg = group as FormGroup;
    const bodyActive = fg.get('includeBodyMeasurements')?.value;
    const fatActive = fg.get('includeBodyFat')?.value;
    if (!bodyActive && !fatActive) {
      return { noBlockActive: true };
    }
    return null;
  };
}

@Component({
  selector: 'app-register-measurement-modal',
  templateUrl: './register-measurement-modal.component.html',
  styleUrls: ['./register-measurement-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterMeasurementModalComponent implements OnInit, OnDestroy {
  @Input() client!: ClientDetailFull;

  @Output() closed = new EventEmitter<void>();
  /**
   * Emits the client's full name after a successful save.
   * The parent uses this to show a success toast.
   */
  @Output() measurementRegistered = new EventEmitter<string>();

  private readonly destroy$ = new Subject<void>();

  readonly form: FormGroup;

  isSaving = false;
  saveError: string | null = null;

  /** Last-known values from the RPC — keyed by column name. */
  lastValues: Record<string, number | null> = {};
  isLoadingLastValues = false;

  /** The field name whose tooltip is currently visible. null = none. */
  activeTooltipField: string | null = null;

  // Expose arrays to the template
  readonly circumferenceFields = CIRCUMFERENCE_FIELDS;
  readonly skinfoldFields = SKINFOLD_FIELDS;
  readonly fieldLabels = FIELD_LABELS;
  readonly fieldUnits = FIELD_UNITS;

  get todayIso(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  get includeBodyMeasurements(): boolean {
    return this.form.get('includeBodyMeasurements')?.value ?? false;
  }

  get includeBodyFat(): boolean {
    return this.form.get('includeBodyFat')?.value ?? false;
  }

  get calculatedBodyFat(): number | null {
    return this.form.get('body_fat_pct')?.value ?? null;
  }

  get initials(): string {
    return this.client.fullName
      .split(' ')
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  constructor(
    private readonly fb: FormBuilder,
    private readonly measurementsService: MeasurementsService,
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.form = this.buildForm();
  }

  ngOnInit(): void {
    this.loadLastValues();
    this.watchTogglesToUpdateValidators();
    this.watchSkinfoldsTocalculateBodyFat();
  }

  // ─── Form building ────────────────────────────────────────────────────────────

  private buildForm(): FormGroup {
    const today = this.todayIso;

    return this.fb.group(
      {
        measured_at: [today, [Validators.required, this.notFutureDateValidator()]],
        includeBodyMeasurements: [true],
        includeBodyFat: [false],
        weight_kg: [null, [Validators.required, Validators.min(0.1), Validators.max(300)]],
        // Circumferences
        calf_left_cm: [null],
        calf_right_cm: [null],
        thigh_left_cm: [null],
        thigh_right_cm: [null],
        hip_cm: [null],
        abdomen_cm: [null],
        chest_cm: [null],
        arm_left_cm: [null],
        arm_right_cm: [null],
        // Skinfolds (9-site Jackson-Pollock variant)
        skinfold_chest_mm: [null],
        skinfold_axilla_mm: [null],
        skinfold_subscapular_mm: [null],
        skinfold_biceps_mm: [null],
        skinfold_triceps_mm: [null],
        skinfold_abdomen_mm: [null],
        skinfold_suprailiac_mm: [null],
        skinfold_thigh_mm: [null],
        skinfold_calf_mm: [null],
        // Calculated — disabled so the user cannot type in it
        body_fat_pct: [{ value: null, disabled: true }],
        notes: [null, [Validators.maxLength(500)]]
      },
      { validators: atLeastOneBlockActiveValidator() }
    );
  }

  private notFutureDateValidator(): ValidatorFn {
    return (control: AbstractControl) => {
      if (!control.value) return null;
      const today = new Date();
      const [y, m, d] = (control.value as string).split('-').map(Number);
      const selected = new Date(y, m - 1, d);
      return selected > today ? { futureDate: true } : null;
    };
  }

  // ─── Reactive toggle → validators ────────────────────────────────────────────

  private watchTogglesToUpdateValidators(): void {
    this.form
      .get('includeBodyMeasurements')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyCircumferenceValidators();
        this.cdr.markForCheck();
      });

    this.form
      .get('includeBodyFat')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.applySkinfoldValidators();
        this.recalculateBodyFat();
        this.cdr.markForCheck();
      });

    // Apply initial validators based on default toggle state.
    this.applyCircumferenceValidators();
    this.applySkinfoldValidators();
  }

  private applyCircumferenceValidators(): void {
    const active = this.includeBodyMeasurements;
    for (const field of CIRCUMFERENCE_FIELDS) {
      const control = this.form.get(field);
      if (!control) continue;
      if (active) {
        const max = CIRCUMFERENCE_MAX[field];
        control.setValidators([
          Validators.required,
          Validators.min(0.01),
          Validators.max(max)
        ]);
      } else {
        control.clearValidators();
        control.setValue(null, { emitEvent: false });
      }
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  private applySkinfoldValidators(): void {
    const active = this.includeBodyFat;
    for (const field of SKINFOLD_FIELDS) {
      const control = this.form.get(field);
      if (!control) continue;
      if (active) {
        control.setValidators([
          Validators.required,
          Validators.min(0.01),
          Validators.max(100)
        ]);
      } else {
        control.clearValidators();
        control.setValue(null, { emitEvent: false });
      }
      control.updateValueAndValidity({ emitEvent: false });
    }

    if (!active) {
      this.form.get('body_fat_pct')?.setValue(null, { emitEvent: false });
    }
  }

  // ─── Body fat auto-calculation ────────────────────────────────────────────────

  private watchSkinfoldsTocalculateBodyFat(): void {
    const skinfoldControls = SKINFOLD_FIELDS.map((f) => this.form.get(f));

    // Also watch measured_at since age-at-measurement depends on it.
    const watched = [...skinfoldControls, this.form.get('measured_at')];

    for (const ctrl of watched) {
      ctrl?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.recalculateBodyFat();
        this.cdr.markForCheck();
      });
    }
  }

  private recalculateBodyFat(): void {
    if (!this.includeBodyFat) return;

    const vals = SKINFOLD_FIELDS.map((f) => this.form.get(f)?.value as number | null);
    const allValid = vals.every((v) => v !== null && v > 0 && v <= 100);

    // Guard: gender is required for the JP9 formula; block if missing at runtime.
    if (!allValid || !this.client.birthDate || !this.client.gender) {
      this.form.get('body_fat_pct')?.setValue(null, { emitEvent: false });
      return;
    }

    const measuredAt: string = this.form.get('measured_at')?.value ?? this.todayIso;
    const age = JacksonPollock9Calculator.ageAtDate(this.client.birthDate, measuredAt);

    // Order must match SKINFOLD_FIELDS exactly.
    const skinfolds: Skinfolds = {
      chest:       vals[0]!,
      axilla:      vals[1]!,
      subscapular: vals[2]!,
      biceps:      vals[3]!,
      triceps:     vals[4]!,
      abdomen:     vals[5]!,
      suprailiac:  vals[6]!,
      thigh:       vals[7]!,
      calf:        vals[8]!
    };

    const pct = JacksonPollock9Calculator.calculate(skinfolds, age, this.client.gender);
    this.form.get('body_fat_pct')?.setValue(pct, { emitEvent: false });
  }

  // ─── Last values (tooltip data) ───────────────────────────────────────────────

  private loadLastValues(): void {
    this.isLoadingLastValues = true;
    this.measurementsService
      .getLastFieldValues(this.client.id)
      .pipe(
        finalize(() => {
          this.isLoadingLastValues = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (values) => {
          this.lastValues = values;
        },
        error: () => {
          // Non-fatal: tooltip just won't show.
          this.lastValues = {};
        }
      });
  }

  // ─── Tooltip interactions ────────────────────────────────────────────────────

  onFieldFocus(fieldName: string): void {
    const hasValue = this.lastValues[fieldName] !== null &&
                     this.lastValues[fieldName] !== undefined;
    this.activeTooltipField = hasValue ? fieldName : null;
    this.cdr.markForCheck();
  }

  dismissTooltip(): void {
    this.activeTooltipField = null;
    this.cdr.markForCheck();
  }

  getLastValue(fieldName: string): number | null {
    return this.lastValues[fieldName] ?? null;
  }

  // ─── Save ────────────────────────────────────────────────────────────────────

  save(): void {
    if (this.form.invalid || this.isSaving) return;

    this.isSaving = true;
    this.saveError = null;
    this.activeTooltipField = null;
    this.cdr.markForCheck();

    const raw = { ...this.form.getRawValue() };

    const payload: ClientMeasurementInsert = {
      client_id: this.client.id,
      measured_at: raw.measured_at,
      weight_kg: raw.weight_kg
    };

    if (this.includeBodyMeasurements) {
      payload.calf_left_cm = raw.calf_left_cm;
      payload.calf_right_cm = raw.calf_right_cm;
      payload.thigh_left_cm = raw.thigh_left_cm;
      payload.thigh_right_cm = raw.thigh_right_cm;
      payload.hip_cm = raw.hip_cm;
      payload.abdomen_cm = raw.abdomen_cm;
      payload.chest_cm = raw.chest_cm;
      payload.arm_left_cm = raw.arm_left_cm;
      payload.arm_right_cm = raw.arm_right_cm;
    }

    if (this.includeBodyFat) {
      payload.skinfold_chest_mm = raw.skinfold_chest_mm;
      payload.skinfold_axilla_mm = raw.skinfold_axilla_mm;
      payload.skinfold_subscapular_mm = raw.skinfold_subscapular_mm;
      payload.skinfold_biceps_mm = raw.skinfold_biceps_mm;
      payload.skinfold_triceps_mm = raw.skinfold_triceps_mm;
      payload.skinfold_abdomen_mm = raw.skinfold_abdomen_mm;
      payload.skinfold_suprailiac_mm = raw.skinfold_suprailiac_mm;
      payload.skinfold_thigh_mm = raw.skinfold_thigh_mm;
      payload.skinfold_calf_mm = raw.skinfold_calf_mm;
      payload.body_fat_pct = raw.body_fat_pct ?? null;
    }

    if (raw.notes) {
      payload.notes = raw.notes;
    }

    this.measurementsService
      .register(payload)
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.measurementRegistered.emit(this.client.fullName);
          this.closed.emit();
        },
        error: (err) => {
          console.error('[RegisterMeasurementModal] save error:', err);
          this.saveError = 'No se pudo guardar la medida. Intenta de nuevo.';
        }
      });
  }

  trackByField(_index: number, field: string): string {
    return field;
  }

  close(): void {
    this.closed.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
