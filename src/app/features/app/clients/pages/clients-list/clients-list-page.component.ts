import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { FormControl } from '@angular/forms';
import {
  BehaviorSubject,
  Observable,
  Subject,
  combineLatest,
  of
} from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  map,
  shareReplay,
  startWith,
  switchMap,
  takeUntil
} from 'rxjs/operators';

import { Client, ClientDetailFull, ClientsPage } from '../../models/client.model';
import { MeasurementAction } from '../../measurements/components/measurements-hub-modal/measurements-hub-modal.component';
import { ClientsService } from '../../services/clients.service';
import { PaymentsService } from '../../services/payments.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { LoaderService } from 'src/app/core/services/loader.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { ClientFiltersValue } from '../../components/clients-filters/clients-filters.component';
import { PaginationState } from '../../components/clients-pagination/clients-pagination.component';
import { CreateClientResult } from '../../models/client.model';
import { OpenPaymentInfo, mapPaymentErrorToMessage, mapReceiptErrorToMessage } from '../../models/payment.model';
import { RegisterPaymentSuccess } from '../../components/register-payment-modal/register-payment-modal.component';
import { RegisterInstallmentSuccess } from '../../components/register-installment-modal/register-installment-modal.component';
import {
  PaymentSuccessData,
  ReceiptEmailStatus
} from '../../components/payment-success-modal/payment-success-modal.component';

interface PageState {
  page: number;
  pageSize: number;
}

export interface ViewState {
  clients: Client[];
  total: number;
  loading: boolean;
  error: boolean;
  paginationState: PaginationState;
}

const LOADING_STATE: ViewState = {
  clients: [],
  total: 0,
  loading: true,
  error: false,
  paginationState: { page: 1, pageSize: 10, total: 0 }
};

@Component({
  selector: 'app-clients-list-page',
  templateUrl: './clients-list-page.component.html',
  styleUrls: ['./clients-list-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientsListPageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly searchControl = new FormControl<string>('');

  private readonly filtersSubject = new BehaviorSubject<ClientFiltersValue>({
    activeFilter: 'active'
  });

  private readonly pageSubject = new BehaviorSubject<PageState>({
    page: 1,
    pageSize: 10
  });

  // Dispara refresh después de crear/editar/desactivar/registrar pago.
  private readonly refreshTrigger$ = new BehaviorSubject<void>(undefined);

  readonly filters$ = this.filtersSubject.asObservable();

  // ─── Auth state ──────────────────────────────────────────────────────────────

  isAdmin = false;

  // ─── Modales existentes ──────────────────────────────────────────────────────

  isWizardOpen = false;
  wizardResult: CreateClientResult | null = null;

  editingClient: ClientDetailFull | null = null;
  isLoadingEditClient = false;

  // ─── Modal de medidas ────────────────────────────────────────────────────────

  /** Client whose hub is open (uses base Client, no full detail needed for hub). */
  measurementsHubClient: Client | null = null;
  /** Full detail fetched on demand for the register form (needs birthDate/gender). */
  measurementsRegisterClient: ClientDetailFull | null = null;
  /** Base client retained for view/compare modals (no full detail needed). */
  measurementsBaseClient: Client | null = null;
  /** Active modal within the measurements flow. */
  measurementsAction: MeasurementAction | null = null;
  isLoadingMeasurementsClient = false;

  // ─── Modales de pago ─────────────────────────────────────────────────────────

  /** Client selected for payment flow — triggers the flow detection. */
  paymentFlowClient: Client | null = null;
  isResolvingPaymentFlow = false;
  paymentFlowError: string | null = null;

  /**
   * Handle for the auto-dismiss timer of the payment-flow error toast.
   * Kept to allow cancellation when the user dismisses manually or a new error arrives.
   */
  private toastDismissTimer: ReturnType<typeof setTimeout> | null = null;

  /** Set when new-payment modal should be shown. */
  registerPaymentClient: Client | null = null;
  suggestedPeriodStart: string | null = null;
  isFirstPayment = false;

  /** Set when installment modal should be shown. */
  registerInstallmentClient: Client | null = null;
  openPaymentForInstallment: OpenPaymentInfo | null = null;

  /** Set when success modal should be shown. */
  paymentSuccessData: PaymentSuccessData | null = null;

  // ─── Stream principal de la vista ──────────────────────────────────────────

  readonly viewState$: Observable<ViewState> = combineLatest([
    this.searchControl.valueChanges.pipe(
      startWith(''),
      map((v): string => v ?? ''),
      debounceTime(300),
      distinctUntilChanged()
    ),
    this.filtersSubject,
    this.pageSubject,
    this.refreshTrigger$
  ]).pipe(
    switchMap(([search, filters, pageState]) => {
      const loadingState: ViewState = {
        ...LOADING_STATE,
        paginationState: { page: pageState.page, pageSize: pageState.pageSize, total: 0 }
      };

      const result$: Observable<ViewState> = this.clientsService
        .getClients({
          search,
          activeFilter: filters.activeFilter,
          page: pageState.page,
          pageSize: pageState.pageSize
        })
        .pipe(
          map(
            (result: ClientsPage): ViewState => ({
              clients: result.items,
              total: result.total,
              loading: false,
              error: false,
              paginationState: {
                page: pageState.page,
                pageSize: pageState.pageSize,
                total: result.total
              }
            })
          ),
          catchError(
            (): Observable<ViewState> =>
              of({
                clients: [],
                total: 0,
                loading: false,
                error: true,
                paginationState: {
                  page: pageState.page,
                  pageSize: pageState.pageSize,
                  total: 0
                }
              })
          )
        );

      return result$.pipe(startWith(loadingState));
    }),
    shareReplay(1)
  );

  constructor(
    private readonly clientsService: ClientsService,
    private readonly paymentsService: PaymentsService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef,
    private readonly loader: LoaderService
  ) {}

  ngOnInit(): void {
    // Resetea a página 1 cuando cambian criterios de búsqueda o filtros.
    combineLatest([
      this.searchControl.valueChanges.pipe(debounceTime(300), distinctUntilChanged()),
      this.filtersSubject
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const current = this.pageSubject.value;
        if (current.page !== 1) {
          this.pageSubject.next({ ...current, page: 1 });
        }
      });

    // Determine admin role for showing the "Registrar pago" action.
    this.authService.profile$
      .pipe(takeUntil(this.destroy$))
      .subscribe((profile) => {
        this.isAdmin = profile?.role === 'admin';
        this.cdr.markForCheck();
      });
  }

  // ─── Búsqueda y filtros ─────────────────────────────────────────────────────

  onSearchChange(search: string): void {
    this.searchControl.setValue(search);
  }

  onFiltersChange(filters: ClientFiltersValue): void {
    this.filtersSubject.next(filters);
  }

  onFiltersClear(): void {
    this.filtersSubject.next({ activeFilter: 'active' });
  }

  get currentFilters(): ClientFiltersValue {
    return this.filtersSubject.value;
  }

  // ─── Paginación ─────────────────────────────────────────────────────────────

  onPageChange(page: number): void {
    this.pageSubject.next({ ...this.pageSubject.value, page });
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSubject.next({ page: 1, pageSize });
  }

  // ─── Wizard nuevo cliente ───────────────────────────────────────────────────

  openWizard(): void {
    this.isWizardOpen = true;
    this.cdr.markForCheck();
  }

  closeWizard(): void {
    this.isWizardOpen = false;
    this.cdr.markForCheck();
  }

  onClientCreated(result: CreateClientResult): void {
    this.isWizardOpen = false;
    this.wizardResult = result;
    this.refreshTrigger$.next();
    this.cdr.markForCheck();
  }

  dismissSuccessModal(): void {
    this.wizardResult = null;
    this.cdr.markForCheck();
  }

  // ─── Editar cliente ─────────────────────────────────────────────────────────

  onEditRequested(client: Client): void {
    this.isLoadingEditClient = true;
    this.loader.show();
    this.cdr.markForCheck();

    this.clientsService
      .getClientById(client.id)
      .pipe(
        finalize(() => {
          this.isLoadingEditClient = false;
          this.loader.hide();
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (full) => {
          this.editingClient = full;
        },
        error: () => {}
      });
  }

  closeEditModal(): void {
    this.editingClient = null;
    this.cdr.markForCheck();
  }

  onClientUpdated(): void {
    this.refreshTrigger$.next();
  }

  // ─── Desactivar cliente ─────────────────────────────────────────────────────

  onDeactivateRequested(client: Client): void {
    this.clientsService
      .deactivateClient(client.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.refreshTrigger$.next();
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('[ClientsListPage] Error al desactivar cliente:', err);
          this.cdr.markForCheck();
        }
      });
  }

  // ─── Registrar pago (detección automática de flujo) ─────────────────────────

  /**
   * Entry point for the payment flow. Calls get-next-period-start to decide
   * whether to open the new-payment modal or the installment modal.
   * The system decides — the admin does not choose.
   */
  onRegisterPaymentRequested(client: Client): void {
    this.paymentFlowClient = client;
    this.isResolvingPaymentFlow = true;
    this.paymentFlowError = null;
    this.loader.show();
    this.cdr.markForCheck();

    this.paymentsService
      .resolvePaymentFlow(client.id)
      .pipe(
        finalize(() => {
          this.isResolvingPaymentFlow = false;
          this.loader.hide();
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          if (result.flow === 'new_payment') {
            this.suggestedPeriodStart = result.suggestedPeriodStart;
            this.isFirstPayment = result.isFirstPayment;
            this.registerPaymentClient = client;
          } else {
            this.openPaymentForInstallment = result.openPayment;
            this.registerInstallmentClient = client;
          }
        },
        error: (err) => {
          console.error('[ClientsListPage] Error al resolver flujo de pago:', err);
          this.showPaymentFlowError(this.extractErrorMessage(err));
        }
      });
  }

  // ─── Modal de pago nuevo ────────────────────────────────────────────────────

  closeRegisterPaymentModal(): void {
    this.registerPaymentClient = null;
    this.paymentFlowClient = null;
    this.cdr.markForCheck();
  }

  onPaymentRegistered(result: RegisterPaymentSuccess): void {
    this.registerPaymentClient = null;
    this.paymentFlowClient = null;

    const isPaid = result.response.status === 'paid';

    // Build receiptStatus only for paid payments (D2).
    const receiptStatus: ReceiptEmailStatus | undefined = isPaid
      ? {
          state: 'sending',
          clientEmail: result.clientEmail,
          paymentId: result.response.id
        }
      : undefined;

    this.paymentSuccessData = {
      type: 'payment',
      clientName: result.clientName,
      paymentResponse: result.response,
      receiptStatus
    };

    this.refreshTrigger$.next();
    this.cdr.markForCheck();

    // Fire the receipt EF only when the payment is fully paid (D2, D6).
    if (isPaid) {
      this.dispatchReceiptEmail(result.response.id);
    }
  }

  /**
   * Calls send-payment-receipt and updates paymentSuccessData with a new object
   * reference so OnPush detection fires on the modal's @Input.
   */
  private dispatchReceiptEmail(paymentId: string): void {
    this.paymentsService
      .sendReceipt(paymentId, false)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (!this.paymentSuccessData?.receiptStatus) return;
          this.paymentSuccessData = {
            ...this.paymentSuccessData,
            receiptStatus: {
              ...this.paymentSuccessData.receiptStatus,
              state: response.status,
              receiptEmailId: response.receipt_email_id ?? null,
              errorMessage: undefined
            }
          };
          this.cdr.markForCheck();
        },
        error: (err: unknown) => {
          if (!this.paymentSuccessData?.receiptStatus) return;
          const anyErr = err as { code?: string; message?: string; details?: Record<string, unknown> };
          const code = anyErr?.code ?? 'INTERNAL_ERROR';
          const errorMessage = mapReceiptErrorToMessage(code, anyErr?.message);

          let sendAttempts = this.paymentSuccessData.receiptStatus.sendAttempts;
          if (code === 'RESEND_ERROR' && typeof anyErr?.details?.['current_attempts'] === 'number') {
            sendAttempts = anyErr.details['current_attempts'] as number;
          }

          this.paymentSuccessData = {
            ...this.paymentSuccessData,
            receiptStatus: {
              ...this.paymentSuccessData.receiptStatus,
              state: 'error',
              errorMessage,
              sendAttempts
            }
          };
          this.cdr.markForCheck();
        }
      });
  }

  // ─── Modal de abono ─────────────────────────────────────────────────────────

  closeRegisterInstallmentModal(): void {
    this.registerInstallmentClient = null;
    this.openPaymentForInstallment = null;
    this.paymentFlowClient = null;
    this.cdr.markForCheck();
  }

  onInstallmentRegistered(result: RegisterInstallmentSuccess): void {
    this.registerInstallmentClient = null;
    this.openPaymentForInstallment = null;
    this.paymentFlowClient = null;
    this.paymentSuccessData = {
      type: 'installment',
      clientName: result.clientName,
      installmentResponse: result.response
    };
    this.refreshTrigger$.next();
    this.cdr.markForCheck();
  }

  // ─── Modal de éxito de pago ─────────────────────────────────────────────────

  dismissPaymentSuccessModal(): void {
    this.paymentSuccessData = null;
    this.cdr.markForCheck();
  }

  retry(): void {
    this.refreshTrigger$.next();
  }

  // ─── Medidas ─────────────────────────────────────────────────────────────────

  onMeasurementsRequested(client: Client): void {
    this.measurementsHubClient = client;
    this.measurementsAction = null;
    this.cdr.markForCheck();
  }

  onMeasurementsHubClosed(): void {
    this.measurementsHubClient = null;
    this.measurementsBaseClient = null;
    this.measurementsAction = null;
    this.measurementsRegisterClient = null;
    this.cdr.markForCheck();
  }

  onMeasurementsActionSelected(action: MeasurementAction): void {
    const baseClient = this.measurementsHubClient!;
    // Close the hub immediately regardless of action so the UX is snappy and
    // the loader covers the page while the fetch is in flight.
    this.measurementsHubClient = null;
    this.cdr.markForCheck();

    if (action === 'register') {
      // The register modal needs birthDate + gender, so fetch the full detail first.
      this.isLoadingMeasurementsClient = true;
      this.loader.show();
      this.cdr.markForCheck();

      this.clientsService
        .getClientById(baseClient.id)
        .pipe(
          finalize(() => {
            this.isLoadingMeasurementsClient = false;
            this.loader.hide();
            this.cdr.markForCheck();
          }),
          takeUntil(this.destroy$)
        )
        .subscribe({
          next: (full) => {
            this.measurementsRegisterClient = full;
            this.measurementsAction = 'register';
          },
          error: () => {
            // Hub is already closed — show error toast instead of re-opening.
            this.toastService.error('No se pudo cargar el detalle del cliente. Intenta de nuevo.');
          }
        });
    } else {
      // View and compare only need the base Client.
      this.measurementsBaseClient = baseClient;
      this.measurementsAction = action;
      this.cdr.markForCheck();
    }
  }

  closeMeasurementsModal(): void {
    this.measurementsAction = null;
    this.measurementsRegisterClient = null;
    this.measurementsBaseClient = null;
    this.cdr.markForCheck();
  }

  onMeasurementRegistered(clientName: string): void {
    this.toastService.success('Medida guardada para ' + clientName);
    this.closeMeasurementsModal();
  }

  // ─── Utilidades ─────────────────────────────────────────────────────────────

  trackByClientId(_index: number, client: Client): string {
    return client.id;
  }

  /**
   * Shows the payment-flow error toast with a 5-second auto-dismiss.
   * Cancels any in-flight timer before scheduling a new one so multiple
   * rapid errors never leave orphaned timers.
   */
  private showPaymentFlowError(message: string): void {
    if (this.toastDismissTimer !== null) {
      clearTimeout(this.toastDismissTimer);
    }
    this.paymentFlowError = message;
    this.toastDismissTimer = setTimeout(() => {
      this.paymentFlowError = null;
      this.toastDismissTimer = null;
      this.cdr.markForCheck();
    }, 5000);
  }

  /** Called by the template "×" button — cancels auto-dismiss before clearing. */
  dismissPaymentFlowError(): void {
    if (this.toastDismissTimer !== null) {
      clearTimeout(this.toastDismissTimer);
      this.toastDismissTimer = null;
    }
    this.paymentFlowError = null;
    this.cdr.markForCheck();
  }

  private extractErrorMessage(err: unknown): string {
    if (err && typeof err === 'object') {
      const anyErr = err as Record<string, unknown>;
      if (typeof anyErr['code'] === 'string') {
        return mapPaymentErrorToMessage(
          anyErr['code'],
          (anyErr['details'] ?? {}) as Record<string, unknown>
        );
      }
      if (typeof anyErr['message'] === 'string') return anyErr['message'];
    }
    return 'Ocurrió un error inesperado. Intenta de nuevo.';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.toastDismissTimer !== null) {
      clearTimeout(this.toastDismissTimer);
    }
  }
}
