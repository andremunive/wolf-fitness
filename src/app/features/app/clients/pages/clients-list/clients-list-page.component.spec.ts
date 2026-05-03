import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';

import { ClientsListPageComponent } from './clients-list-page.component';
import { ClientsService } from '../../services/clients.service';
import { PaymentsService } from '../../services/payments.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { LoaderService } from 'src/app/core/services/loader.service';
import { mapReceiptErrorToMessage, RegisterPaymentResponse } from '../../models/payment.model';
import { ClientsPage } from '../../models/client.model';

describe('ClientsListPageComponent — error path del envío de recibo', () => {
  let component: ClientsListPageComponent;
  let paymentsServiceSpy: jasmine.SpyObj<PaymentsService>;
  let clientsServiceSpy: jasmine.SpyObj<ClientsService>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let toastServiceSpy: jasmine.SpyObj<ToastService>;
  let loaderServiceSpy: jasmine.SpyObj<LoaderService>;
  let cdrSpy: jasmine.SpyObj<ChangeDetectorRef>;

  const fakePaymentId = 'payment-uuid-test';

  const fakePaymentResponse: RegisterPaymentResponse = {
    id: fakePaymentId,
    client_id: 'client-uuid-test',
    period_start: '2025-01-01',
    period_end: '2025-01-31',
    plan_total_cop: 200000,
    discount_amount_cop: 0,
    balance_cop: 0,
    status: 'paid',
    reception_date: '2025-01-01'
  };

  const emptyClientsPage: ClientsPage = { items: [], total: 0 };

  beforeEach(() => {
    paymentsServiceSpy = jasmine.createSpyObj<PaymentsService>('PaymentsService', [
      'sendReceipt',
      'resolvePaymentFlow',
      'registerPayment',
      'registerInstallment',
      'getNextPeriodStart',
      'getOpenPayment',
      'getActiveDiscounts'
    ]);

    clientsServiceSpy = jasmine.createSpyObj<ClientsService>('ClientsService', [
      'getClients',
      'getClientById',
      'createClient',
      'deactivateClient',
      'updateClient',
      'getActivePlans',
      'getActiveTrainers',
      'searchActiveClients'
    ]);

    // getClients se invoca desde el stream viewState$ al inicializar el componente.
    clientsServiceSpy.getClients.and.returnValue(of(emptyClientsPage));

    authServiceSpy = jasmine.createSpyObj<AuthService>('AuthService', [], {
      profile$: of(null)
    });

    toastServiceSpy = jasmine.createSpyObj<ToastService>('ToastService', [
      'success',
      'error'
    ]);

    loaderServiceSpy = jasmine.createSpyObj<LoaderService>('LoaderService', [
      'show',
      'hide',
      'bindToRouter',
      'reset'
    ]);

    cdrSpy = jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', [
      'markForCheck'
    ]);

    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      declarations: [ClientsListPageComponent],
      providers: [
        { provide: ClientsService, useValue: clientsServiceSpy },
        { provide: PaymentsService, useValue: paymentsServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: ToastService, useValue: toastServiceSpy },
        { provide: LoaderService, useValue: loaderServiceSpy },
        { provide: ChangeDetectorRef, useValue: cdrSpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });

    const fixture = TestBed.createComponent(ClientsListPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('debe mantener el modal abierto y marcar receiptStatus como error cuando send-payment-receipt falla', () => {
    // sendReceipt devuelve el error estructurado de la EF.
    const receiptError = { code: 'RESEND_ERROR', message: 'Resend down', details: {} };
    paymentsServiceSpy.sendReceipt.and.returnValue(throwError(() => receiptError));

    // Establecemos paymentSuccessData como lo haría onPaymentRegistered antes de
    // llamar a dispatchReceiptEmail: pago registrado, recibo en estado 'sending'.
    component.paymentSuccessData = {
      type: 'payment',
      clientName: 'Test Client',
      paymentResponse: fakePaymentResponse,
      receiptStatus: {
        state: 'sending',
        clientEmail: 'test@example.com',
        paymentId: fakePaymentId
      }
    };

    // Invocamos el método privado como está autorizado en el spec.
    (component as any).dispatchReceiptEmail(fakePaymentId);

    // 1. El modal debe seguir visible (paymentSuccessData no es null).
    expect(component.paymentSuccessData).not.toBeNull();

    // 2. El estado del recibo debe quedar en 'error'.
    expect(component.paymentSuccessData!.receiptStatus!.state).toBe('error');

    // 3. El mensaje de error debe ser el mapeado para 'RESEND_ERROR'.
    const expectedMessage = mapReceiptErrorToMessage('RESEND_ERROR');
    expect(component.paymentSuccessData!.receiptStatus!.errorMessage).toBe(expectedMessage);

    // 4. El ID del pago no debe haberse alterado (el pago fue registrado correctamente).
    expect(component.paymentSuccessData!.paymentResponse!.id).toBe(fakePaymentId);
  });
});
