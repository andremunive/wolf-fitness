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

import { LoaderService } from 'src/app/core/services/loader.service';
import { Client } from '../../models/client.model';
import {
  OpenPaymentInfo,
  PaymentMethod,
  RegisterInstallmentResponse,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  mapPaymentErrorToMessage,
  EdgeFunctionError
} from '../../models/payment.model';
import { formatDateOnly } from 'src/app/shared/utils/date.utils';
import { PaymentsService } from '../../services/payments.service';

export interface RegisterInstallmentSuccess {
  response: RegisterInstallmentResponse;
  clientName: string;
}

@Component({
  selector: 'app-register-installment-modal',
  templateUrl: './register-installment-modal.component.html',
  styleUrls: ['./register-installment-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterInstallmentModalComponent implements OnInit, OnDestroy {
  @Input() client!: Client;
  @Input() openPayment!: OpenPaymentInfo;

  @Output() closed = new EventEmitter<void>();
  @Output() installmentRegistered = new EventEmitter<RegisterInstallmentSuccess>();

  private readonly destroy$ = new Subject<void>();

  readonly form: FormGroup;
  isSaving = false;
  saveError: string | null = null;

  readonly paymentMethodOptions: Array<{ value: PaymentMethod; label: string }> = [
    { value: 'cash', label: PAYMENT_METHOD_LABELS.cash },
    { value: 'transfer', label: PAYMENT_METHOD_LABELS.transfer },
    { value: 'nequi', label: PAYMENT_METHOD_LABELS.nequi },
    { value: 'other', label: PAYMENT_METHOD_LABELS.other }
  ];

  constructor(
    private readonly fb: FormBuilder,
    private readonly paymentsService: PaymentsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly loader: LoaderService
  ) {
    this.form = this.fb.group({
      amount_cop: [null, [Validators.required, Validators.min(1)]],
      reception_date: ['', [Validators.required]],
      payment_method: ['', [Validators.required]],
      notes: ['']
    });
  }

  ngOnInit(): void {
    this.form.get('reception_date')!.setValue(this.todayIso());
  }

  // ─── Computed values ──────────────────────────────────────────────────────────

  get totalToPayCop(): number {
    return this.openPayment.plan_total_cop - this.openPayment.discount_amount_cop;
  }

  get currentBalanceCop(): number {
    return this.openPayment.balance_cop;
  }

  get projectedNewBalance(): number {
    const amount = Number(this.form.get('amount_cop')!.value) || 0;
    return Math.max(0, this.currentBalanceCop - amount);
  }

  get projectedStatusLabel(): string {
    return this.projectedNewBalance === 0 ? 'Quedará al día' : 'Quedará en pago parcial';
  }

  get projectedStatusClass(): string {
    return this.projectedNewBalance === 0 ? 'status--paid' : 'status--partial';
  }

  get openPaymentStatusLabel(): string {
    return PAYMENT_STATUS_LABELS[this.openPayment.status] ?? this.openPayment.status;
  }

  get avatarInitials(): string {
    return this.client.fullName
      .split(' ')
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  formatCop(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount);
  }

  formatDate(dateStr: string): string {
    return formatDateOnly(dateStr);
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isSaving) return;

    const amount = Number(this.form.get('amount_cop')!.value);

    if (amount > this.currentBalanceCop) {
      this.saveError = mapPaymentErrorToMessage('AMOUNT_EXCEEDS_BALANCE', {
        amount_cop: amount,
        balance_cop: this.currentBalanceCop
      });
      this.cdr.markForCheck();
      return;
    }

    this.isSaving = true;
    this.saveError = null;
    this.loader.show();
    this.cdr.markForCheck();

    const notes = this.form.get('notes')!.value?.trim() || null;

    this.paymentsService
      .registerInstallment({
        payment_id: this.openPayment.id,
        reception_date: this.form.get('reception_date')!.value,
        amount_cop: amount,
        payment_method: this.form.get('payment_method')!.value as PaymentMethod,
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
          this.installmentRegistered.emit({ response, clientName: this.client.fullName });
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
