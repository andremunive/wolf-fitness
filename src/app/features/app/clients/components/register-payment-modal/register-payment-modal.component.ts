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
import { Observable, Subject } from 'rxjs';
import { finalize, shareReplay, takeUntil } from 'rxjs/operators';

import { LoaderService } from 'src/app/core/services/loader.service';
import { Client } from '../../models/client.model';
import {
  Discount,
  PaymentMethod,
  RegisterPaymentResponse,
  PAYMENT_METHOD_LABELS,
  mapPaymentErrorToMessage,
  EdgeFunctionError
} from '../../models/payment.model';
import { parseDateOnly } from 'src/app/shared/utils/date.utils';
import { PaymentsService } from '../../services/payments.service';

export interface RegisterPaymentSuccess {
  response: RegisterPaymentResponse;
  clientName: string;
  clientEmail: string;
}

@Component({
  selector: 'app-register-payment-modal',
  templateUrl: './register-payment-modal.component.html',
  styleUrls: ['./register-payment-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterPaymentModalComponent implements OnInit, OnDestroy {
  @Input() client!: Client;
  /**
   * The suggested period_start coming from get-next-period-start.
   * null when it's the first payment.
   */
  @Input() suggestedPeriodStart: string | null = null;
  @Input() isFirstPayment = false;

  @Output() closed = new EventEmitter<void>();
  @Output() paymentRegistered = new EventEmitter<RegisterPaymentSuccess>();

  private readonly destroy$ = new Subject<void>();

  readonly form: FormGroup;
  isSaving = false;
  saveError: string | null = null;

  /** Formatted display value for the amount input (es-CO thousands separators). */
  amountDisplay = '';

  readonly paymentMethodOptions: Array<{ value: PaymentMethod; label: string }> = [
    { value: 'cash', label: PAYMENT_METHOD_LABELS.cash },
    { value: 'transfer', label: PAYMENT_METHOD_LABELS.transfer },
    { value: 'nequi', label: PAYMENT_METHOD_LABELS.nequi },
    { value: 'other', label: PAYMENT_METHOD_LABELS.other }
  ];

  readonly discounts$: Observable<Discount[]>;

  /** Selected discount object (drives the computed fields below). */
  selectedDiscount: Discount | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly paymentsService: PaymentsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly loader: LoaderService
  ) {
    this.form = this.fb.group({
      period_start: ['', [Validators.required]],
      reception_date: ['', [Validators.required]],
      amount_received_cop: [null, [Validators.required, Validators.min(0)]],
      payment_method: [{ value: '', disabled: true }],
      discount_code: [''],
      notes: ['']
    });

    this.discounts$ = this.paymentsService.getActiveDiscounts().pipe(shareReplay(1));
  }

  ngOnInit(): void {
    // Preload period_start if suggestion available.
    if (this.suggestedPeriodStart) {
      this.form.get('period_start')!.setValue(this.suggestedPeriodStart);
    }

    // Default reception_date to today.
    this.form.get('reception_date')!.setValue(this.todayIso());

    // Enable/disable payment_method based on amount.
    this.form.get('amount_received_cop')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((amount) => {
        const methodCtrl = this.form.get('payment_method')!;
        if (amount > 0) {
          methodCtrl.enable({ emitEvent: false });
        } else {
          methodCtrl.setValue('', { emitEvent: false });
          methodCtrl.disable({ emitEvent: false });
        }
        this.cdr.markForCheck();
      });

  }

  // ─── Computed values for the summary panel ───────────────────────────────────

  get planTotalCop(): number {
    return this.client.planAmountCop ?? 0;
  }

  get discountAmountCop(): number {
    if (!this.selectedDiscount) return 0;
    return Math.round(this.planTotalCop * (this.selectedDiscount.percentage / 100));
  }

  get totalToPayCop(): number {
    return this.planTotalCop - this.discountAmountCop;
  }

  get projectedBalance(): number {
    const received = Number(this.form.get('amount_received_cop')!.value) || 0;
    return Math.max(0, this.totalToPayCop - received);
  }

  get projectedStatus(): string {
    const received = Number(this.form.get('amount_received_cop')!.value) || 0;
    if (received === 0) return 'Pendiente';
    if (received >= this.totalToPayCop) return 'Al día';
    return 'Pago parcial';
  }

  get projectedStatusClass(): string {
    const received = Number(this.form.get('amount_received_cop')!.value) || 0;
    if (received === 0) return 'status--pending';
    if (received >= this.totalToPayCop) return 'status--paid';
    return 'status--partial';
  }

  get isPaymentMethodDisabled(): boolean {
    return this.form.get('payment_method')!.disabled;
  }

  get avatarInitials(): string {
    return this.client.fullName
      .split(' ')
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  /**
   * Pre-parsed local Date for joinedAt so the Angular date pipe does not
   * re-parse the YYYY-MM-DD string as UTC midnight (which shifts the day
   * back by one in UTC-5 Colombia).
   */
  get joinedAtDate(): Date | null {
    return this.client.joinedAt ? parseDateOnly(this.client.joinedAt) : null;
  }

  formatCop(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount);
  }

  onDiscountSelected(discount: Discount | null): void {
    this.selectedDiscount = discount;
    this.form.get('discount_code')!.setValue(discount?.code ?? '', { emitEvent: false });
    this.cdr.markForCheck();
  }

  /** Called when the discount select changes — resolves the full Discount object. */
  onDiscountCodeChange(discounts: Discount[]): void {
    const code = this.form.get('discount_code')!.value as string;
    this.selectedDiscount = discounts.find((d) => d.code === code) ?? null;
    this.cdr.markForCheck();
  }

  /**
   * Handles input on the amount field: strips non-digits, formats with es-CO
   * thousands separators, and writes the numeric value back to the form control.
   * Cursor is restored to the equivalent digit position after re-formatting.
   */
  onAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const oldValue = input.value;
    const oldCursor = input.selectionStart ?? oldValue.length;
    const digitsBeforeCursor = oldValue.slice(0, oldCursor).replace(/\D/g, '').length;

    const digits = oldValue.replace(/\D/g, '');
    const amountCtrl = this.form.get('amount_received_cop')!;

    if (digits === '') {
      this.amountDisplay = '';
      input.value = '';
      amountCtrl.setValue(null);
      this.cdr.markForCheck();
      return;
    }

    const num = Number(digits);
    const formatted = new Intl.NumberFormat('es-CO').format(num);
    this.amountDisplay = formatted;
    input.value = formatted;
    amountCtrl.setValue(num);

    let newCursor = 0;
    let counted = 0;
    while (counted < digitsBeforeCursor && newCursor < formatted.length) {
      if (/\d/.test(formatted[newCursor])) counted++;
      newCursor++;
    }
    input.setSelectionRange(newCursor, newCursor);
    this.cdr.markForCheck();
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isSaving) return;

    const amount = Number(this.form.get('amount_received_cop')!.value) || 0;
    const method = amount > 0
      ? (this.form.get('payment_method')!.value as PaymentMethod)
      : null;

    if (amount > 0 && !method) {
      this.saveError = 'Debes seleccionar un método de pago.';
      this.cdr.markForCheck();
      return;
    }

    const discountCode = this.form.get('discount_code')!.value?.trim() || null;
    const notes = this.form.get('notes')!.value?.trim() || null;

    this.isSaving = true;
    this.saveError = null;
    this.loader.show();
    this.cdr.markForCheck();

    this.paymentsService
      .registerPayment({
        client_id: this.client.id,
        period_start: this.form.get('period_start')!.value,
        reception_date: this.form.get('reception_date')!.value,
        amount_received_cop: amount,
        payment_method: method,
        discount_code: discountCode,
        notes
      })
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.loader.hide();
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          this.paymentRegistered.emit({
            response,
            clientName: this.client.fullName,
            clientEmail: this.client.email
          });
        },
        error: (err: EdgeFunctionError | unknown) => {
          const efErr = err as EdgeFunctionError;
          this.saveError = efErr?.code
            ? mapPaymentErrorToMessage(efErr.code, efErr.details ?? {})
            : 'Ocurrió un error inesperado. Intenta de nuevo.';
        }
      });
  }

  close(): void {
    this.closed.emit();
  }

  trackByDiscountId(_index: number, d: Discount): string {
    return d.id;
  }

  trackByMethodValue(_index: number, m: { value: string }): string {
    return m.value;
  }

  private todayIso(): string {
    return new Date().toISOString().split('T')[0];
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
