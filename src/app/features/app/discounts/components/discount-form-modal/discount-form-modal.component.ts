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
import { finalize, takeUntil } from 'rxjs/operators';

import {
  Discount,
  DiscountInsert,
  DiscountUpdate,
  formatCopPlain,
  mapDiscountErrorToMessage
} from '../../models/discount.model';
import { DiscountsService } from '../../services/discounts.service';

export type DiscountFormMode = 'create' | 'edit';

@Component({
  selector: 'app-discount-form-modal',
  templateUrl: './discount-form-modal.component.html',
  styleUrls: ['./discount-form-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DiscountFormModalComponent implements OnInit, OnDestroy {
  @Input() mode: DiscountFormMode = 'create';
  @Input() initialDiscount?: Discount;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Discount>();

  private readonly destroy$ = new Subject<void>();

  readonly form: FormGroup;

  isSaving = false;
  isLoadingPaymentCount = false;
  saveError: string | null = null;

  /**
   * True when the discount being edited already has referenced payments.
   * Disables the five immutable fields (code, type, value_type, percentage/amount_cop).
   */
  hasReferencedPayments = false;

  /** Display value for the numeric input (es-CO formatted). */
  valueDisplay = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly discountsService: DiscountsService,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      code: ['', [Validators.required, Validators.minLength(2)]],
      description: [''],
      type: ['promocion', Validators.required],
      value_type: ['percentage', Validators.required],
      value: [null, [Validators.required, Validators.min(0.01)]],
      is_active: [true]
    });
  }

  ngOnInit(): void {
    if (this.mode === 'edit' && this.initialDiscount) {
      this.populateForm(this.initialDiscount);
      this.checkReferencingPayments(this.initialDiscount.id);
    }

    // Re-apply value validator when value_type changes.
    this.form.get('value_type')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.rebuildValueValidator();
        this.valueDisplay = '';
        this.form.get('value')!.reset(null);
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Computed helpers ──────────────────────────────────────────────────────

  get isPercentage(): boolean {
    return this.form.get('value_type')!.value === 'percentage';
  }

  get isFixed(): boolean {
    return this.form.get('value_type')!.value === 'fixed';
  }

  get modalTitle(): string {
    return this.mode === 'create' ? 'Nuevo descuento' : 'Editar descuento';
  }

  get saveLabel(): string {
    return this.mode === 'create' ? 'Crear descuento' : 'Guardar cambios';
  }

  // ─── Form population ───────────────────────────────────────────────────────

  private populateForm(discount: Discount): void {
    const rawValue = discount.value_type === 'percentage'
      ? discount.percentage
      : discount.amount_cop;

    this.form.patchValue({
      code: discount.code,
      description: discount.description ?? '',
      type: discount.type,
      value_type: discount.value_type,
      value: rawValue,
      is_active: discount.is_active
    });

    this.valueDisplay = rawValue != null ? formatCopPlain(rawValue) : '';
    this.rebuildValueValidator();
  }

  // ─── Payment count check ───────────────────────────────────────────────────

  private checkReferencingPayments(discountId: string): void {
    this.isLoadingPaymentCount = true;
    this.discountsService
      .countReferencingPayments(discountId)
      .pipe(
        finalize(() => {
          this.isLoadingPaymentCount = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (count) => {
          this.hasReferencedPayments = count > 0;
          if (this.hasReferencedPayments) {
            this.disableImmutableFields();
          }
        },
        error: () => {
          // On error, conservatively treat as referenced to avoid accidental
          // mutation of potentially protected fields.
          this.hasReferencedPayments = true;
          this.disableImmutableFields();
        }
      });
  }

  private disableImmutableFields(): void {
    ['code', 'type', 'value_type', 'value'].forEach((field) => {
      this.form.get(field)!.disable({ emitEvent: false });
    });
    this.cdr.markForCheck();
  }

  // ─── Validators ────────────────────────────────────────────────────────────

  private rebuildValueValidator(): void {
    const valueCtrl = this.form.get('value')!;
    if (this.isPercentage) {
      valueCtrl.setValidators([
        Validators.required,
        Validators.min(0.01),
        Validators.max(99.99)
      ]);
    } else {
      valueCtrl.setValidators([
        Validators.required,
        Validators.min(0.01),
        Validators.max(200000)
      ]);
    }
    valueCtrl.updateValueAndValidity({ emitEvent: false });
  }

  // ─── Input handling ────────────────────────────────────────────────────────

  onCodeBlur(): void {
    const ctrl = this.form.get('code')!;
    const trimmed = (ctrl.value as string ?? '').trim().toUpperCase();
    ctrl.setValue(trimmed, { emitEvent: false });
  }

  onValueInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/\D/g, '');

    if (raw === '') {
      this.valueDisplay = '';
      input.value = '';
      this.form.get('value')!.setValue(null);
      this.cdr.markForCheck();
      return;
    }

    const num = Number(raw);

    if (this.isPercentage) {
      // Allow up to 2 decimal places — strip non-digit then treat as int for display.
      this.valueDisplay = raw;
      input.value = raw;
      this.form.get('value')!.setValue(num);
    } else {
      // Fixed: format with thousands separators.
      const formatted = new Intl.NumberFormat('es-CO').format(num);
      this.valueDisplay = formatted;
      input.value = formatted;
      this.form.get('value')!.setValue(num);
    }

    this.cdr.markForCheck();
  }

  // ─── Submit ────────────────────────────────────────────────────────────────

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isSaving) return;

    const raw = this.form.getRawValue();

    this.isSaving = true;
    this.saveError = null;
    this.cdr.markForCheck();

    if (this.mode === 'create') {
      this.createDiscount(raw);
    } else {
      this.updateDiscount(raw);
    }
  }

  private createDiscount(raw: Record<string, unknown>): void {
    const payload = this.buildInsertPayload(raw);
    this.discountsService
      .create(payload)
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (discount) => this.saved.emit(discount),
        error: (err) => {
          this.saveError = mapDiscountErrorToMessage(err);
        }
      });
  }

  private updateDiscount(raw: Record<string, unknown>): void {
    const patch = this.buildUpdatePatch(raw);
    this.discountsService
      .update(this.initialDiscount!.id, patch)
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (discount) => this.saved.emit(discount),
        error: (err) => {
          this.saveError = mapDiscountErrorToMessage(err);
        }
      });
  }

  /** Builds the full INSERT payload, mapping `value` → `percentage` or `amount_cop`. */
  private buildInsertPayload(raw: Record<string, unknown>): DiscountInsert {
    const valueType = raw['value_type'] as string;
    const numericValue = raw['value'] as number;

    return {
      code: (raw['code'] as string).trim().toUpperCase(),
      description: (raw['description'] as string)?.trim() || null,
      type: raw['type'] as DiscountInsert['type'],
      value_type: valueType as DiscountInsert['value_type'],
      percentage: valueType === 'percentage' ? numericValue : null,
      amount_cop: valueType === 'fixed' ? numericValue : null,
      is_active: raw['is_active'] as boolean
    };
  }

  /**
   * Builds the UPDATE patch. When the discount has referenced payments,
   * only description and is_active are sent — immutable fields are disabled
   * in the form and would not appear in getRawValue() unless explicitly included.
   *
   * For safety, always limit the patch to what we intend to change.
   */
  private buildUpdatePatch(raw: Record<string, unknown>): DiscountUpdate {
    if (this.hasReferencedPayments) {
      // Only editable fields when referenced.
      return {
        description: (raw['description'] as string)?.trim() || null,
        is_active: raw['is_active'] as boolean
      };
    }

    const valueType = raw['value_type'] as string;
    const numericValue = raw['value'] as number;

    return {
      code: (raw['code'] as string).trim().toUpperCase(),
      description: (raw['description'] as string)?.trim() || null,
      type: raw['type'] as DiscountUpdate['type'],
      value_type: valueType as DiscountUpdate['value_type'],
      percentage: valueType === 'percentage' ? numericValue : null,
      amount_cop: valueType === 'fixed' ? numericValue : null,
      is_active: raw['is_active'] as boolean
    };
  }

  close(): void {
    this.closed.emit();
  }
}
