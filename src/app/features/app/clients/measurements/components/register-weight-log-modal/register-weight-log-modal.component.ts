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

import { Client } from 'src/app/features/app/clients/models/client.model';
import { ClientWeightLogInsert } from 'src/app/core/types/supabase';
import { WeightLogsService, LastWeightEntry } from '../../services/weight-logs.service';
import { formatDateOnly } from 'src/app/shared/utils/date.utils';

/** Rejects dates that are strictly after today in local time. */
function notFutureDateValidator(): ValidatorFn {
  return (control: AbstractControl) => {
    if (!control.value) return null;
    const today = new Date();
    const [y, m, d] = (control.value as string).split('-').map(Number);
    const selected = new Date(y, m - 1, d);
    return selected > today ? { futureDate: true } : null;
  };
}

/**
 * Accepts a positive decimal with up to 2 decimals, using either `.` or `,`
 * as separator (iOS Spanish keyboards emit comma). Validates the parsed value
 * falls within [min, max].
 */
function decimalRangeValidator(min: number, max: number): ValidatorFn {
  const pattern = /^\d+([.,]\d{1,2})?$/;
  return (control: AbstractControl) => {
    const raw = control.value;
    if (raw === null || raw === undefined || raw === '') return null;
    const str = String(raw).trim();
    if (!pattern.test(str)) return { invalidWeight: true };
    const parsed = parseFloat(str.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed < min || parsed > max) {
      return { invalidWeight: true };
    }
    return null;
  };
}

@Component({
  selector: 'app-register-weight-log-modal',
  templateUrl: './register-weight-log-modal.component.html',
  styleUrls: ['./register-weight-log-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterWeightLogModalComponent implements OnInit, OnDestroy {
  @Input() client!: Client;

  @Output() closed = new EventEmitter<void>();
  /**
   * Emits the client's full name after a successful save.
   * The parent shows a success toast.
   */
  @Output() weightLogRegistered = new EventEmitter<string>();

  private readonly destroy$ = new Subject<void>();

  readonly form: FormGroup;

  isSaving = false;
  saveError: string | null = null;

  /** Last registered weight, fetched on init. Null if no prior entries. */
  lastWeight: LastWeightEntry | null = null;
  isWeightTooltipVisible = false;

  get todayIso(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  get initials(): string {
    return this.client.fullName
      .split(' ')
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  get lastWeightLabel(): string {
    if (!this.lastWeight) return '';
    const weightFormatted = this.lastWeight.weight_kg.toFixed(2);
    const dateFormatted = formatDateOnly(this.lastWeight.measured_at);
    return `Último registro: ${weightFormatted} kg (${dateFormatted})`;
  }

  constructor(
    private readonly fb: FormBuilder,
    private readonly weightLogsService: WeightLogsService,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.form = this.buildForm();
  }

  ngOnInit(): void {
    this.loadLastWeight();
  }

  // ─── Form building ────────────────────────────────────────────────────────────

  private buildForm(): FormGroup {
    return this.fb.group({
      measured_at: [this.todayIso, [Validators.required, notFutureDateValidator()]],
      weight_kg: ['', [Validators.required, decimalRangeValidator(0.1, 300)]]
    });
  }

  // ─── Load last weight for tooltip ────────────────────────────────────────────

  private loadLastWeight(): void {
    this.weightLogsService
      .getLastWeight(this.client.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (entry) => {
          this.lastWeight = entry;
          this.cdr.markForCheck();
        },
        error: () => {
          // Non-fatal: tooltip simply won't appear.
          this.lastWeight = null;
        }
      });
  }

  // ─── Tooltip interactions ────────────────────────────────────────────────────

  onWeightFocus(): void {
    this.isWeightTooltipVisible = this.lastWeight !== null;
    this.cdr.markForCheck();
  }

  onWeightBlur(): void {
    this.isWeightTooltipVisible = false;
    this.cdr.markForCheck();
  }

  // ─── Save ────────────────────────────────────────────────────────────────────

  save(): void {
    if (this.form.invalid || this.isSaving) return;

    this.isSaving = true;
    this.saveError = null;
    this.isWeightTooltipVisible = false;
    this.cdr.markForCheck();

    const { measured_at, weight_kg } = this.form.getRawValue() as {
      measured_at: string;
      weight_kg: string;
    };

    const payload: ClientWeightLogInsert = {
      client_id: this.client.id,
      measured_at,
      weight_kg: parseFloat(String(weight_kg).replace(',', '.'))
    };

    this.weightLogsService
      .upsert(payload)
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.weightLogRegistered.emit(this.client.fullName);
          this.closed.emit();
        },
        error: (err) => {
          console.error('[RegisterWeightLogModal] save error:', err);
          this.saveError = 'No se pudo guardar el peso. Intenta de nuevo.';
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
