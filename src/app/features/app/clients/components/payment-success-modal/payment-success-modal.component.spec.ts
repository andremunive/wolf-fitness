import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { PaymentsService } from '../../services/payments.service';
import { SendReceiptSuccess } from '../../models/payment.model';
import {
  PaymentSuccessModalComponent,
  PaymentSuccessData
} from './payment-success-modal.component';

describe('PaymentSuccessModalComponent — idempotencia de reintento', () => {
  let component: PaymentSuccessModalComponent;
  let paymentsServiceSpy: jasmine.SpyObj<PaymentsService>;
  let cdrSpy: jasmine.SpyObj<ChangeDetectorRef>;

  beforeEach(() => {
    paymentsServiceSpy = jasmine.createSpyObj<PaymentsService>('PaymentsService', [
      'sendReceipt'
    ]);
    cdrSpy = jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', [
      'markForCheck'
    ]);

    TestBed.configureTestingModule({
      providers: [
        PaymentSuccessModalComponent,
        { provide: PaymentsService, useValue: paymentsServiceSpy },
        { provide: ChangeDetectorRef, useValue: cdrSpy }
      ]
    });

    component = TestBed.inject(PaymentSuccessModalComponent);

    // Datos mínimos: pago en error para que el botón Reintentar esté habilitado.
    const data: PaymentSuccessData = {
      type: 'payment',
      clientName: 'Test Client',
      paymentResponse: {
        id: 'payment-uuid-1',
        client_id: 'client-uuid-1',
        period_start: '2025-01-01',
        period_end: '2025-01-31',
        plan_total_cop: 200000,
        discount_amount_cop: 0,
        balance_cop: 0,
        status: 'paid',
        reception_date: '2025-01-01'
      },
      receiptStatus: {
        state: 'error',
        clientEmail: 'test@example.com',
        paymentId: 'payment-uuid-1'
      }
    };
    component.data = data;
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('debe llamar a sendReceipt exactamente una vez aunque se invoque onRetryReceipt dos veces seguidas', () => {
    // Subject no completado para mantener el observable "en vuelo" durante el test.
    const inFlight$ = new Subject<SendReceiptSuccess>();
    paymentsServiceSpy.sendReceipt.and.returnValue(inFlight$.asObservable());

    // Doble click en el mismo tick.
    component.onRetryReceipt();
    component.onRetryReceipt();

    // El guard isResendingReceipt debe haber bloqueado la segunda llamada.
    expect(paymentsServiceSpy.sendReceipt).toHaveBeenCalledTimes(1);
  });

  it('debe liberar isResendingReceipt después de que el observable complete', () => {
    const inFlight$ = new Subject<SendReceiptSuccess>();
    paymentsServiceSpy.sendReceipt.and.returnValue(inFlight$.asObservable());

    component.onRetryReceipt();
    expect(component.isResendingReceipt).toBeTrue();

    // Completar el observable (finalize libera el flag).
    const successResponse: SendReceiptSuccess = { status: 'sent', receipt_email_id: 'resend-id-1' };
    inFlight$.next(successResponse);
    inFlight$.complete();

    expect(component.isResendingReceipt).toBeFalse();
  });
});
