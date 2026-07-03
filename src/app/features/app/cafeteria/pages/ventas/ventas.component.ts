import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BehaviorSubject, combineLatest, Subject } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
  takeUntil
} from 'rxjs';

import { ToastService } from 'src/app/shared/services/toast.service';
import { localDateString } from 'src/app/shared/utils/date.utils';
import { parsePriceInput, formatPriceDisplay } from 'src/app/shared/utils/currency.utils';
import { extractErrorMessage } from 'src/app/shared/utils/error.utils';
import { CafeteriaCatalogService } from '../../services/cafeteria-catalog.service';
import { CafeteriaVentasService } from '../../services/cafeteria-ventas.service';
import {
  ActiveClient,
  CafeteriaComboWithProduct,
  CafeteriaInstallment,
  CafeteriaProduct,
  CafeteriaComboPurchase,
  ClientActiveCombo,
  TrainerOption
} from '../../models/cafeteria.model';
import {
  CafeteriaComboPurchaseView,
  CafeteriaCombosResult,
  CafeteriaSalesResult,
  CafeteriaSaleView
} from '../../models/cafeteria-view.models';

export type VentasModal =
  | 'new-sale'
  | 'detail'
  | 'installment'
  | 'combo-detail'
  | 'combo-installment'
  | null;
export type StatusFilter = 'all' | 'paid' | 'partial' | 'pending';
export type BuyerType = 'client' | 'trainer';
export type SaleType = 'individual' | 'combo';
export type TableView = 'individual' | 'combos';

interface SalesSummary {
  total_ingresos_cop: number;
  count: number;
  saldo_pendiente_cop: number;
}

interface CombosSummary {
  total_ingresos_cop: number;
  count: number;
  saldo_pendiente_cop: number;
}

interface VentasSalesState {
  loading: boolean;
  error: string | null;
  sales: CafeteriaSaleView[];
  summary: SalesSummary;
}

interface VentasCombosState {
  loading: boolean;
  error: string | null;
  purchases: CafeteriaComboPurchaseView[];
  summary: CombosSummary;
}

type ComboConsumptionItem = {
  id: string;
  consumed_at: string;
  registered_by: string;
  registered_by_name: string | null;
};

const EMPTY_SALES_SUMMARY: SalesSummary = { total_ingresos_cop: 0, count: 0, saldo_pendiente_cop: 0 };
const EMPTY_COMBOS_SUMMARY: CombosSummary = { total_ingresos_cop: 0, count: 0, saldo_pendiente_cop: 0 };

const LOADING_SALES_STATE: VentasSalesState = { loading: true, error: null, sales: [], summary: EMPTY_SALES_SUMMARY };
const LOADING_COMBOS_STATE: VentasCombosState = { loading: true, error: null, purchases: [], summary: EMPTY_COMBOS_SUMMARY };

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

@Component({
  selector: 'app-cafeteria-ventas',
  templateUrl: './ventas.component.html',
  styleUrls: ['./ventas.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VentasComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly refresh$ = new BehaviorSubject<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1
  });

  // ─── Table view toggle ────────────────────────────────────────────────────────

  tableView: TableView = 'individual';

  // ─── Individual sales state ───────────────────────────────────────────────────

  readonly salesState$ = this.refresh$.pipe(
    switchMap(({ year, month }) =>
      this.ventasService.getSales(year, month).pipe(
        map((result: CafeteriaSalesResult) => ({
          loading: false,
          error: null,
          sales: result.sales,
          summary: result.summary
        } as VentasSalesState)),
        catchError((err) => {
          const msg: string = err?.message ?? 'Error al cargar las ventas.';
          return of({ loading: false, error: msg, sales: [], summary: EMPTY_SALES_SUMMARY } as VentasSalesState);
        }),
        startWith(LOADING_SALES_STATE)
      )
    ),
    shareReplay(1)
  );

  // ─── Combo purchases state ────────────────────────────────────────────────────

  readonly combosState$ = this.refresh$.pipe(
    switchMap(({ year, month }) =>
      this.ventasService.getComboPurchases(year, month).pipe(
        map((result: CafeteriaCombosResult) => ({
          loading: false,
          error: null,
          purchases: result.purchases,
          summary: result.summary
        } as VentasCombosState)),
        catchError((err) => {
          const msg: string = err?.message ?? 'Error al cargar los combos.';
          return of({ loading: false, error: msg, purchases: [], summary: EMPTY_COMBOS_SUMMARY } as VentasCombosState);
        }),
        startWith(LOADING_COMBOS_STATE)
      )
    ),
    shareReplay(1)
  );

  // ─── Month navigation ─────────────────────────────────────────────────────────

  currentYear = new Date().getFullYear();
  currentMonth = new Date().getMonth() + 1;

  // ─── Status filter ────────────────────────────────────────────────────────────

  /** Shared filter for both individual sales and combos. */
  readonly statusFilter$ = new BehaviorSubject<StatusFilter>('all');

  // Expose current value as plain property so filter pills can read [class.active].
  get statusFilter(): StatusFilter {
    return this.statusFilter$.getValue();
  }

  // ─── Filtered lists (derived Observables — no method calls in template) ───────

  readonly filteredSales$ = combineLatest([
    this.salesState$.pipe(map(state => state.sales ?? [])),
    this.statusFilter$
  ]).pipe(
    map(([sales, filter]) =>
      filter === 'all' ? sales : sales.filter(s => s.status === filter)
    )
  );

  readonly filteredPurchases$ = combineLatest([
    this.combosState$.pipe(map(state => state.purchases ?? [])),
    this.statusFilter$
  ]).pipe(
    map(([purchases, filter]) =>
      filter === 'all' ? purchases : purchases.filter(p => p.status === filter)
    )
  );

  // ─── Modal state ──────────────────────────────────────────────────────────────

  activeModal: VentasModal = null;
  selectedSale: CafeteriaSaleView | null = null;
  selectedPurchase: CafeteriaComboPurchaseView | null = null;

  // ─── Individual sale detail data ──────────────────────────────────────────────

  installments: CafeteriaInstallment[] = [];
  isLoadingInstallments = false;

  // ─── Active combos banner (individual sale modal) ─────────────────────────────

  clientActiveCombos: ClientActiveCombo[] = [];
  isLoadingActiveCombos = false;

  // ─── Combo detail data ────────────────────────────────────────────────────────

  comboConsumptions: ComboConsumptionItem[] = [];
  comboInstallments: CafeteriaInstallment[] = [];
  isLoadingComboDetail = false;
  isRegisteringConsumption = false;

  // ─── New sale modal ───────────────────────────────────────────────────────────

  saleType: SaleType = 'individual';
  buyerType: BuyerType = 'client';

  /**
   * WHY BehaviorSubject: `selectedProduct$`, `selectedCombo$`, `formTotal$`,
   * `filteredClients$`, etc. all need to react when these lists are populated
   * asynchronously in openNewSaleModal(). A plain array would be snapshot-only
   * at pipe creation time; BehaviorSubjects stay live.
   */
  private readonly activeProducts$ = new BehaviorSubject<CafeteriaProduct[]>([]);
  private readonly activeCombos$ = new BehaviorSubject<CafeteriaComboWithProduct[]>([]);
  private readonly activeClients$ = new BehaviorSubject<ActiveClient[]>([]);
  private readonly trainers$ = new BehaviorSubject<TrainerOption[]>([]);

  // Kept as plain arrays for submit handlers that read them synchronously.
  get activeProducts(): CafeteriaProduct[] { return this.activeProducts$.getValue(); }
  get activeCombos(): CafeteriaComboWithProduct[] { return this.activeCombos$.getValue(); }
  get activeClients(): ActiveClient[] { return this.activeClients$.getValue(); }
  get trainers(): TrainerOption[] { return this.trainers$.getValue(); }

  isLoadingFormData = false;

  clientQuery = '';
  trainerQuery = '';
  comboClientQuery = '';

  readonly newSaleForm: FormGroup = this.fb.group({
    product_id: [null, [Validators.required]],
    quantity: [1, [Validators.required, Validators.min(1)]],
    sale_date: [localDateString(new Date()), [Validators.required]],
    amount_received_cop: [0],
    payment_method: [null],
    notes: ['', [Validators.maxLength(300)]]
  });

  readonly newComboForm: FormGroup = this.fb.group({
    combo_id: [null, [Validators.required]],
    purchase_date: [localDateString(new Date()), [Validators.required]],
    amount_received_cop: [0],
    payment_method: [null]
  });

  amountReceivedRaw = '0';
  comboAmountReceivedRaw = '0';

  selectedClientId: string | null = null;
  selectedTrainerId: string | null = null;
  comboSelectedClientId: string | null = null;

  showClientDropdown = false;
  showTrainerDropdown = false;
  showComboClientDropdown = false;

  // Combo duplicate-client validation
  comboDuplicateWarning: string | null = null;
  isCheckingComboConflict = false;

  // ─── Form-derived Observables (individual) ────────────────────────────────────

  /** Emits the currently selected product, or null. */
  readonly selectedProduct$ = combineLatest([
    this.newSaleForm.get('product_id')!.valueChanges.pipe(
      startWith(this.newSaleForm.get('product_id')!.value as string | null)
    ),
    this.activeProducts$
  ]).pipe(
    map(([id, products]) => (id ? products.find(p => p.id === id) ?? null : null)),
    distinctUntilChanged((a, b) => a?.id === b?.id)
  );

  /** Emits the current form total (product price × quantity). */
  readonly formTotal$ = combineLatest([
    this.newSaleForm.valueChanges.pipe(startWith(this.newSaleForm.value)),
    this.activeProducts$
  ]).pipe(
    map(([v, products]) => {
      const product = products.find(p => p.id === v['product_id']);
      const qty: number = (v['quantity'] as number) ?? 1;
      return product && qty >= 1 ? product.price_cop * qty : 0;
    })
  );

  /** Emits 'zero' | 'partial' | 'exact' | 'over' based on received vs total. */
  readonly amountHint$ = combineLatest([
    this.newSaleForm.get('amount_received_cop')!.valueChanges.pipe(
      startWith(this.newSaleForm.get('amount_received_cop')!.value as number)
    ),
    this.formTotal$
  ]).pipe(
    map(([received, total]) => {
      const r: number = (received as number) ?? 0;
      if (r === 0 || total === 0) return 'zero' as const;
      if (r > total) return 'over' as const;
      if (r === total) return 'exact' as const;
      return 'partial' as const;
    })
  );

  /** True when the payment method field must be shown. */
  readonly isPaymentMethodRequired$ = this.newSaleForm.get('amount_received_cop')!.valueChanges.pipe(
    startWith(this.newSaleForm.get('amount_received_cop')!.value as number),
    map(received => ((received as number) ?? 0) > 0)
  );

  // ─── Form-derived Observables (combo) ────────────────────────────────────────

  /** Emits the currently selected combo, or null. */
  readonly selectedCombo$ = combineLatest([
    this.newComboForm.get('combo_id')!.valueChanges.pipe(
      startWith(this.newComboForm.get('combo_id')!.value as string | null)
    ),
    this.activeCombos$
  ]).pipe(
    map(([id, combos]) => (id ? combos.find(c => c.id === id) ?? null : null)),
    distinctUntilChanged((a, b) => a?.id === b?.id)
  );

  /** Emits 'zero' | 'partial' | 'exact' | 'over' for the combo form. */
  readonly comboAmountHint$ = combineLatest([
    this.newComboForm.get('amount_received_cop')!.valueChanges.pipe(
      startWith(this.newComboForm.get('amount_received_cop')!.value as number)
    ),
    this.selectedCombo$
  ]).pipe(
    map(([received, combo]) => {
      const r: number = (received as number) ?? 0;
      const total: number = combo?.price_cop ?? 0;
      if (r === 0 || total === 0) return 'zero' as const;
      if (r > total) return 'over' as const;
      if (r === total) return 'exact' as const;
      return 'partial' as const;
    })
  );

  /** True when the combo payment method field must be shown. */
  readonly isComboPaymentMethodRequired$ = this.newComboForm.get('amount_received_cop')!.valueChanges.pipe(
    startWith(this.newComboForm.get('amount_received_cop')!.value as number),
    map(received => ((received as number) ?? 0) > 0)
  );

  // ─── Autocomplete Observables ─────────────────────────────────────────────────

  private readonly clientQuery$ = new BehaviorSubject<string>('');
  private readonly trainerQuery$ = new BehaviorSubject<string>('');
  private readonly comboClientQuery$ = new BehaviorSubject<string>('');

  readonly filteredClients$ = combineLatest([
    this.clientQuery$.pipe(debounceTime(100), distinctUntilChanged()),
    this.activeClients$
  ]).pipe(
    map(([query, clients]) => {
      if (!query.trim()) return clients.slice(0, 8);
      const q = query.toLowerCase();
      return clients.filter(c => c.full_name.toLowerCase().includes(q)).slice(0, 8);
    })
  );

  readonly filteredTrainers$ = combineLatest([
    this.trainerQuery$.pipe(debounceTime(100), distinctUntilChanged()),
    this.trainers$
  ]).pipe(
    map(([query, trainers]) => {
      if (!query.trim()) return trainers;
      const q = query.toLowerCase();
      return trainers.filter(t => t.full_name.toLowerCase().includes(q));
    })
  );

  readonly filteredComboClients$ = combineLatest([
    this.comboClientQuery$.pipe(debounceTime(100), distinctUntilChanged()),
    this.activeClients$
  ]).pipe(
    map(([query, clients]) => {
      if (!query.trim()) return clients.slice(0, 8);
      const q = query.toLowerCase();
      return clients.filter(c => c.full_name.toLowerCase().includes(q)).slice(0, 8);
    })
  );

  // ─── Installment modal (individual) ──────────────────────────────────────────
  // Declared before installmentNewBalance$ so the property initializer can reference this.installmentForm.

  readonly installmentForm: FormGroup = this.fb.group({
    amount_cop: [null, [Validators.required, Validators.min(1)]],
    payment_date: [localDateString(new Date()), [Validators.required]],
    payment_method: ['', [Validators.required]],
    notes: ['', [Validators.maxLength(300)]]
  });

  installmentAmountRaw = '';

  // ─── Installment modal (combo) ────────────────────────────────────────────────
  // Declared before comboInstallmentNewBalance$ for the same reason.

  readonly comboInstallmentForm: FormGroup = this.fb.group({
    amount_cop: [null, [Validators.required, Validators.min(1)]],
    payment_date: [localDateString(new Date()), [Validators.required]],
    payment_method: ['', [Validators.required]],
    notes: ['', [Validators.maxLength(300)]]
  });

  comboInstallmentAmountRaw = '';

  // ─── Installment balance preview Observables ──────────────────────────────────

  /**
   * Emits the projected balance after applying the entered installment amount.
   * Reads selectedSale imperatively — acceptable because the installment modal
   * is only open while selectedSale is non-null and does not change mid-open.
   */
  readonly installmentNewBalance$ = this.installmentForm.get('amount_cop')!.valueChanges.pipe(
    startWith(this.installmentForm.get('amount_cop')!.value as number | null),
    map(amount => {
      if (!this.selectedSale) return 0;
      const a: number = (amount as number) ?? 0;
      return Math.max(0, (this.selectedSale.balance_cop ?? 0) - a);
    })
  );

  readonly comboInstallmentNewBalance$ = this.comboInstallmentForm.get('amount_cop')!.valueChanges.pipe(
    startWith(this.comboInstallmentForm.get('amount_cop')!.value as number | null),
    map(amount => {
      if (!this.selectedPurchase) return 0;
      const a: number = (amount as number) ?? 0;
      return Math.max(0, (this.selectedPurchase.balance_cop ?? 0) - a);
    })
  );

  // ─── Saving flags ─────────────────────────────────────────────────────────────

  isSaving = false;
  saveError: string | null = null;

  skeletonRows = [1, 2, 3, 4, 5];

  readonly today = localDateString(new Date());

  constructor(
    private readonly ventasService: CafeteriaVentasService,
    private readonly catalogService: CafeteriaCatalogService,
    private readonly toastService: ToastService,
    private readonly fb: FormBuilder,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Table view toggle ────────────────────────────────────────────────────────

  setTableView(view: TableView): void {
    this.tableView = view;
    this.statusFilter$.next('all');
    this.cdr.markForCheck();
  }

  // ─── Month navigation ─────────────────────────────────────────────────────────

  get currentMonthLabel(): string {
    return `${MONTH_NAMES[this.currentMonth - 1]} ${this.currentYear}`;
  }

  get isNextMonthBlocked(): boolean {
    const now = new Date();
    return this.currentYear === now.getFullYear() && this.currentMonth === now.getMonth() + 1;
  }

  goToPreviousMonth(): void {
    if (this.currentMonth === 1) {
      this.currentMonth = 12;
      this.currentYear -= 1;
    } else {
      this.currentMonth -= 1;
    }
    this.refresh$.next({ year: this.currentYear, month: this.currentMonth });
    this.cdr.markForCheck();
  }

  goToNextMonth(): void {
    if (this.isNextMonthBlocked) return;
    if (this.currentMonth === 12) {
      this.currentMonth = 1;
      this.currentYear += 1;
    } else {
      this.currentMonth += 1;
    }
    this.refresh$.next({ year: this.currentYear, month: this.currentMonth });
    this.cdr.markForCheck();
  }

  // ─── Status filter ────────────────────────────────────────────────────────────

  setFilter(filter: StatusFilter): void {
    this.statusFilter$.next(filter);
    this.cdr.markForCheck();
  }

  // ─── Modal: New sale (opener) ─────────────────────────────────────────────────

  openNewSaleModal(): void {
    this.saleType = 'individual';
    this.buyerType = 'client';
    this.clientQuery = '';
    this.trainerQuery = '';
    this.comboClientQuery = '';
    this.clientQuery$.next('');
    this.trainerQuery$.next('');
    this.comboClientQuery$.next('');
    this.amountReceivedRaw = '0';
    this.comboAmountReceivedRaw = '0';
    this.saveError = null;
    this.selectedClientId = null;
    this.selectedTrainerId = null;
    this.comboSelectedClientId = null;
    this.comboDuplicateWarning = null;
    this.clientActiveCombos = [];
    this.newSaleForm.reset({
      product_id: null,
      quantity: 1,
      sale_date: localDateString(new Date()),
      amount_received_cop: 0,
      payment_method: null,
      notes: ''
    });
    this.newComboForm.reset({
      combo_id: null,
      purchase_date: localDateString(new Date()),
      amount_received_cop: 0,
      payment_method: null
    });
    this.activeModal = 'new-sale';
    this.cdr.markForCheck();

    this.isLoadingFormData = true;
    this.catalogService
      .getProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (products) => {
          this.activeProducts$.next(products.filter((p) => p.is_active));
          this.isLoadingFormData = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingFormData = false;
          this.cdr.markForCheck();
        }
      });

    this.catalogService
      .getCombos()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (combos) => {
          this.activeCombos$.next(combos.filter((c) => c.is_active));
          this.cdr.markForCheck();
        },
        error: () => {
          this.cdr.markForCheck();
        }
      });

    this.ventasService
      .getActiveClients()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (clients) => {
          this.activeClients$.next(clients);
          this.cdr.markForCheck();
        },
        error: () => {
          this.cdr.markForCheck();
        }
      });

    this.ventasService
      .getTrainers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (trainers) => {
          this.trainers$.next(trainers);
          this.cdr.markForCheck();
        },
        error: () => {
          this.cdr.markForCheck();
        }
      });
  }

  closeNewSaleModal(): void {
    this.activeModal = null;
    this.cdr.markForCheck();
  }

  setSaleType(type: SaleType): void {
    this.saleType = type;
    this.saveError = null;
    this.cdr.markForCheck();
  }

  setBuyerType(type: BuyerType): void {
    this.buyerType = type;
    this.clientQuery = '';
    this.trainerQuery = '';
    this.clientQuery$.next('');
    this.trainerQuery$.next('');
    this.selectedClientId = null;
    this.selectedTrainerId = null;
    this.clientActiveCombos = [];
    this.cdr.markForCheck();
  }

  // ─── Buyer autocomplete (individual) ─────────────────────────────────────────

  onClientQueryInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.clientQuery = value;
    this.clientQuery$.next(value);
    this.selectedClientId = null;
    this.clientActiveCombos = [];
    this.showClientDropdown = true;
    this.cdr.markForCheck();
  }

  selectClient(client: ActiveClient): void {
    this.selectedClientId = client.id;
    this.clientQuery = client.full_name;
    this.clientQuery$.next(client.full_name);
    this.showClientDropdown = false;
    this.clientActiveCombos = [];
    this.cdr.markForCheck();
    this.loadClientActiveCombos(client.id);
  }

  onClientBlur(): void {
    setTimeout(() => {
      this.showClientDropdown = false;
      this.cdr.markForCheck();
    }, 150);
  }

  onTrainerQueryInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.trainerQuery = value;
    this.trainerQuery$.next(value);
    this.selectedTrainerId = null;
    this.showTrainerDropdown = true;
    this.cdr.markForCheck();
  }

  selectTrainer(trainer: TrainerOption): void {
    this.selectedTrainerId = trainer.id;
    this.trainerQuery = trainer.full_name;
    this.trainerQuery$.next(trainer.full_name);
    this.showTrainerDropdown = false;
    this.cdr.markForCheck();
  }

  onTrainerBlur(): void {
    setTimeout(() => {
      this.showTrainerDropdown = false;
      this.cdr.markForCheck();
    }, 150);
  }

  private loadClientActiveCombos(clientId: string): void {
    this.isLoadingActiveCombos = true;
    this.ventasService
      .getClientActiveCombos(clientId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (combos) => {
          this.clientActiveCombos = combos;
          this.isLoadingActiveCombos = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingActiveCombos = false;
          this.cdr.markForCheck();
        }
      });
  }

  // ─── Combo buyer autocomplete ─────────────────────────────────────────────────

  onComboClientQueryInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.comboClientQuery = value;
    this.comboClientQuery$.next(value);
    this.comboSelectedClientId = null;
    this.comboDuplicateWarning = null;
    this.showComboClientDropdown = true;
    this.cdr.markForCheck();
  }

  selectComboClient(client: ActiveClient): void {
    this.comboSelectedClientId = client.id;
    this.comboClientQuery = client.full_name;
    this.comboClientQuery$.next(client.full_name);
    this.showComboClientDropdown = false;
    this.comboDuplicateWarning = null;
    this.cdr.markForCheck();
    this.checkComboDuplicate();
  }

  onComboClientBlur(): void {
    setTimeout(() => {
      this.showComboClientDropdown = false;
      this.cdr.markForCheck();
    }, 150);
  }

  onComboIdChange(): void {
    this.comboDuplicateWarning = null;
    if (this.comboSelectedClientId) {
      this.checkComboDuplicate();
    }
    this.cdr.markForCheck();
  }

  private checkComboDuplicate(): void {
    const comboId = this.newComboForm.get('combo_id')?.value as string | null;
    const clientId = this.comboSelectedClientId;
    if (!comboId || !clientId) return;

    const selectedCombo = this.activeCombos.find((c) => c.id === comboId);
    if (!selectedCombo?.product_id) return;

    this.isCheckingComboConflict = true;
    this.cdr.markForCheck();

    this.ventasService
      .getActiveComboByClient(clientId, selectedCombo.product_id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (existing) => {
          if (existing) {
            const productName = selectedCombo.product?.name ?? 'este producto';
            const remaining = (existing.total_units ?? 0) - (existing.units_consumed ?? 0);
            this.comboDuplicateWarning =
              `Este cliente ya tiene un combo activo de ${productName} con ${remaining} unidades restantes. No puede comprar otro del mismo producto.`;
          } else {
            this.comboDuplicateWarning = null;
          }
          this.isCheckingComboConflict = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isCheckingComboConflict = false;
          this.cdr.markForCheck();
        }
      });
  }

  // ─── Amount received (individual sale) ───────────────────────────────────────

  onAmountReceivedInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.amountReceivedRaw = raw;
    const parsed = parsePriceInput(raw);
    this.newSaleForm.get('amount_received_cop')?.setValue(parsed ?? 0);
    this.cdr.markForCheck();
  }

  onAmountReceivedBlur(): void {
    const parsed = parsePriceInput(this.amountReceivedRaw);
    const val = parsed ?? 0;
    this.newSaleForm.get('amount_received_cop')?.setValue(val);
    this.amountReceivedRaw = val > 0 ? formatPriceDisplay(val) : '0';
    this.cdr.markForCheck();
  }

  // ─── Amount received (combo form) ─────────────────────────────────────────────

  onComboAmountReceivedInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.comboAmountReceivedRaw = raw;
    const parsed = parsePriceInput(raw);
    this.newComboForm.get('amount_received_cop')?.setValue(parsed ?? 0);
    this.cdr.markForCheck();
  }

  onComboAmountReceivedBlur(): void {
    const parsed = parsePriceInput(this.comboAmountReceivedRaw);
    const val = parsed ?? 0;
    this.newComboForm.get('amount_received_cop')?.setValue(val);
    this.comboAmountReceivedRaw = val > 0 ? formatPriceDisplay(val) : '0';
    this.cdr.markForCheck();
  }

  // ─── isComboFormBlocked getter (reads 2 booleans — no costly computation) ────

  get isComboFormBlocked(): boolean {
    return !!this.comboDuplicateWarning || this.isCheckingComboConflict;
  }

  // ─── Submit new sale (individual) ────────────────────────────────────────────

  submitNewSale(): void {
    this.newSaleForm.markAllAsTouched();

    const product = this.activeProducts.find(
      p => p.id === (this.newSaleForm.get('product_id')?.value as string | null)
    );
    if (!product) return;

    const buyerId = this.buyerType === 'client' ? this.selectedClientId : this.selectedTrainerId;
    if (!buyerId) return;

    if (this.newSaleForm.invalid) return;
    if (this.isSaving) return;

    const { quantity, sale_date, amount_received_cop, notes } = this.newSaleForm.value as {
      quantity: number;
      sale_date: string;
      amount_received_cop: number;
      notes: string;
    };

    const received = amount_received_cop ?? 0;
    const paymentMethod = received > 0
      ? (this.newSaleForm.get('payment_method')?.value as 'cash' | 'transfer' | 'nequi' | 'other' | null)
      : null;

    if (received > 0 && !paymentMethod) {
      this.newSaleForm.get('payment_method')?.setErrors({ required: true });
      this.newSaleForm.get('payment_method')?.markAsTouched();
      return;
    }

    this.isSaving = true;
    this.saveError = null;
    this.cdr.markForCheck();

    this.ventasService
      .createSale({
        sale_date,
        product_id: product.id,
        quantity,
        buyer_type: this.buyerType,
        client_id: this.buyerType === 'client' ? (buyerId ?? undefined) : undefined,
        trainer_id: this.buyerType === 'trainer' ? (buyerId ?? undefined) : undefined,
        amount_received_cop: received,
        payment_method: paymentMethod ?? undefined,
        notes: notes?.trim() || undefined
      })
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.activeModal = null;
          this.toastService.success('Venta registrada correctamente.');
          this.refreshCurrentMonth();
        },
        error: (err) => {
          this.saveError = extractErrorMessage(err);
        }
      });
  }

  // ─── Submit new combo purchase ────────────────────────────────────────────────

  submitNewCombo(): void {
    this.newComboForm.markAllAsTouched();

    if (!this.comboSelectedClientId) return;
    if (this.newComboForm.invalid) return;
    if (this.isSaving || this.isComboFormBlocked) return;

    const { combo_id, purchase_date, amount_received_cop } = this.newComboForm.value as {
      combo_id: string;
      purchase_date: string;
      amount_received_cop: number;
    };

    const received = amount_received_cop ?? 0;
    const paymentMethod = received > 0
      ? (this.newComboForm.get('payment_method')?.value as 'cash' | 'transfer' | 'nequi' | 'other' | null)
      : null;

    if (received > 0 && !paymentMethod) {
      this.newComboForm.get('payment_method')?.setErrors({ required: true });
      this.newComboForm.get('payment_method')?.markAsTouched();
      return;
    }

    this.isSaving = true;
    this.saveError = null;
    this.cdr.markForCheck();

    this.ventasService
      .createComboPurchase({
        purchase_date,
        combo_id,
        buyer_type: 'client',
        client_id: this.comboSelectedClientId,
        amount_received_cop: received,
        payment_method: paymentMethod ?? undefined
      })
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.activeModal = null;
          this.toastService.success('Combo registrado correctamente.');
          this.tableView = 'combos';
          this.refreshCurrentMonth();
        },
        error: (err) => {
          this.saveError = extractErrorMessage(err);
        }
      });
  }

  // ─── Modal: Individual sale detail ────────────────────────────────────────────

  openDetailModal(sale: CafeteriaSaleView): void {
    this.selectedSale = sale;
    this.installments = [];
    this.isLoadingInstallments = true;
    this.activeModal = 'detail';
    this.cdr.markForCheck();

    this.ventasService
      .getSaleInstallments(sale.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (items) => {
          this.installments = items;
          this.isLoadingInstallments = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingInstallments = false;
          this.toastService.error('No se pudo cargar el historial de abonos.');
          this.cdr.markForCheck();
        }
      });
  }

  closeDetailModal(): void {
    this.activeModal = null;
    this.selectedSale = null;
    this.installments = [];
    this.cdr.markForCheck();
  }

  get installmentsTotal(): number {
    return this.installments.reduce((acc, i) => acc + (i.amount_cop ?? 0), 0);
  }

  // ─── Modal: Individual installment ────────────────────────────────────────────

  openInstallmentModal(sale: CafeteriaSaleView): void {
    this.selectedSale = sale;
    this.installmentAmountRaw = '';
    this.saveError = null;
    this.installmentForm.reset({
      amount_cop: null,
      payment_date: localDateString(new Date()),
      payment_method: '',
      notes: ''
    });
    this.activeModal = 'installment';
    this.cdr.markForCheck();
  }

  openInstallmentFromDetail(): void {
    if (!this.selectedSale) return;
    this.installmentAmountRaw = '';
    this.saveError = null;
    this.installmentForm.reset({
      amount_cop: null,
      payment_date: localDateString(new Date()),
      payment_method: '',
      notes: ''
    });
    this.activeModal = 'installment';
    this.cdr.markForCheck();
  }

  closeInstallmentModal(): void {
    this.activeModal = 'detail';
    this.saveError = null;
    this.cdr.markForCheck();
  }

  onInstallmentAmountInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.installmentAmountRaw = raw;
    const parsed = parsePriceInput(raw);
    this.installmentForm.get('amount_cop')?.setValue(parsed ?? null);
    this.cdr.markForCheck();
  }

  onInstallmentAmountBlur(): void {
    const parsed = parsePriceInput(this.installmentAmountRaw);
    if (parsed !== null && parsed > 0) {
      this.installmentForm.get('amount_cop')?.setValue(parsed);
      this.installmentAmountRaw = formatPriceDisplay(parsed);
    } else {
      this.installmentForm.get('amount_cop')?.setValue(null);
      this.installmentAmountRaw = '';
    }
    this.cdr.markForCheck();
  }

  submitInstallment(): void {
    this.installmentForm.markAllAsTouched();
    if (this.installmentForm.invalid || this.isSaving || !this.selectedSale) return;

    const { amount_cop, payment_date, payment_method, notes } = this.installmentForm.value as {
      amount_cop: number;
      payment_date: string;
      payment_method: 'cash' | 'transfer' | 'nequi' | 'other';
      notes: string;
    };

    this.isSaving = true;
    this.saveError = null;
    this.cdr.markForCheck();

    const saleId = this.selectedSale.id;

    this.ventasService
      .createInstallment(saleId, {
        amount_cop,
        payment_date,
        payment_method,
        notes: notes?.trim() || undefined
      })
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: ({ installment, sale }) => {
          this.selectedSale = {
            ...this.selectedSale!,
            amount_received_cop: sale.amount_received_cop,
            balance_cop: sale.balance_cop,
            status: sale.status
          };
          this.installments = [...this.installments, installment];
          this.activeModal = 'detail';
          this.saveError = null;
          this.toastService.success('Abono registrado correctamente.');
          this.refreshCurrentMonth();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.saveError = extractErrorMessage(err);
        }
      });
  }

  // ─── Modal: Combo detail ──────────────────────────────────────────────────────

  openComboDetailModal(purchase: CafeteriaComboPurchaseView): void {
    this.selectedPurchase = purchase;
    this.comboConsumptions = [];
    this.comboInstallments = [];
    this.isLoadingComboDetail = true;
    this.activeModal = 'combo-detail';
    this.cdr.markForCheck();

    this.ventasService
      .getComboConsumptions(purchase.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (items) => {
          this.comboConsumptions = items;
          this.isLoadingComboDetail = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingComboDetail = false;
          this.toastService.error('No se pudo cargar el historial de consumos.');
          this.cdr.markForCheck();
        }
      });

    this.ventasService
      .getComboPurchaseInstallments(purchase.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (items) => {
          this.comboInstallments = items;
          this.cdr.markForCheck();
        },
        error: () => {
          this.cdr.markForCheck();
        }
      });
  }

  closeComboDetailModal(): void {
    this.activeModal = null;
    this.selectedPurchase = null;
    this.comboConsumptions = [];
    this.comboInstallments = [];
    this.cdr.markForCheck();
  }

  get comboInstallmentsTotal(): number {
    return this.comboInstallments.reduce((acc, i) => acc + (i.amount_cop ?? 0), 0);
  }

  registerConsumptionFromDetail(): void {
    if (!this.selectedPurchase || this.isRegisteringConsumption) return;
    if (this.selectedPurchase.is_completed) return;

    this.isRegisteringConsumption = true;
    this.cdr.markForCheck();

    const purchaseId = this.selectedPurchase.id;

    // Replaced nested subscribe anti-pattern with switchMap.
    this.ventasService
      .registerComboConsumption(purchaseId)
      .pipe(
        switchMap(updatedPurchase =>
          this.ventasService.getComboConsumptions(purchaseId).pipe(
            map(consumptions => ({ updatedPurchase, consumptions }))
          )
        ),
        finalize(() => {
          this.isRegisteringConsumption = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: ({ updatedPurchase, consumptions }) => {
          const wasCompleted = !this.selectedPurchase?.is_completed && updatedPurchase.is_completed;
          this.selectedPurchase = {
            ...this.selectedPurchase!,
            units_consumed: updatedPurchase.units_consumed,
            is_completed: updatedPurchase.is_completed
          };
          this.comboConsumptions = consumptions;
          this.toastService.success('Consumo registrado.');
          if (wasCompleted) {
            this.toastService.success('¡Combo completado!');
          }
          this.refreshCurrentMonth();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.toastService.error(extractErrorMessage(err));
        }
      });
  }

  openConsumptionFromMenu(purchase: CafeteriaComboPurchaseView): void {
    this.openComboDetailModal(purchase);
  }

  // ─── Modal: Combo installment ─────────────────────────────────────────────────

  openComboInstallmentFromDetail(): void {
    if (!this.selectedPurchase) return;
    this.comboInstallmentAmountRaw = '';
    this.saveError = null;
    this.comboInstallmentForm.reset({
      amount_cop: null,
      payment_date: localDateString(new Date()),
      payment_method: '',
      notes: ''
    });
    this.activeModal = 'combo-installment';
    this.cdr.markForCheck();
  }

  openComboInstallmentFromMenu(purchase: CafeteriaComboPurchaseView): void {
    this.selectedPurchase = purchase;
    this.comboInstallmentAmountRaw = '';
    this.saveError = null;
    this.comboInstallmentForm.reset({
      amount_cop: null,
      payment_date: localDateString(new Date()),
      payment_method: '',
      notes: ''
    });
    this.activeModal = 'combo-installment';
    this.cdr.markForCheck();
  }

  closeComboInstallmentModal(): void {
    if (this.activeModal === 'combo-installment' && this.selectedPurchase) {
      this.activeModal = 'combo-detail';
    } else {
      this.activeModal = null;
    }
    this.saveError = null;
    this.cdr.markForCheck();
  }

  onComboInstallmentAmountInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.comboInstallmentAmountRaw = raw;
    const parsed = parsePriceInput(raw);
    this.comboInstallmentForm.get('amount_cop')?.setValue(parsed ?? null);
    this.cdr.markForCheck();
  }

  onComboInstallmentAmountBlur(): void {
    const parsed = parsePriceInput(this.comboInstallmentAmountRaw);
    if (parsed !== null && parsed > 0) {
      this.comboInstallmentForm.get('amount_cop')?.setValue(parsed);
      this.comboInstallmentAmountRaw = formatPriceDisplay(parsed);
    } else {
      this.comboInstallmentForm.get('amount_cop')?.setValue(null);
      this.comboInstallmentAmountRaw = '';
    }
    this.cdr.markForCheck();
  }

  submitComboInstallment(): void {
    this.comboInstallmentForm.markAllAsTouched();
    if (this.comboInstallmentForm.invalid || this.isSaving || !this.selectedPurchase) return;

    const { amount_cop, payment_date, payment_method, notes } = this.comboInstallmentForm.value as {
      amount_cop: number;
      payment_date: string;
      payment_method: 'cash' | 'transfer' | 'nequi' | 'other';
      notes: string;
    };

    this.isSaving = true;
    this.saveError = null;
    this.cdr.markForCheck();

    const purchaseId = this.selectedPurchase.id;

    this.ventasService
      .createComboPurchaseInstallment(purchaseId, {
        amount_cop,
        payment_date,
        payment_method,
        notes: notes?.trim() || undefined
      })
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: ({ installment, purchase }) => {
          this.selectedPurchase = {
            ...this.selectedPurchase!,
            amount_received_cop: purchase.amount_received_cop,
            balance_cop: purchase.balance_cop,
            status: purchase.status
          };
          this.comboInstallments = [...this.comboInstallments, installment];
          this.activeModal = 'combo-detail';
          this.saveError = null;
          this.toastService.success('Abono registrado correctamente.');
          this.refreshCurrentMonth();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.saveError = extractErrorMessage(err);
        }
      });
  }

  // ─── Active combo banner: jump to detail ─────────────────────────────────────

  openComboDetailFromBanner(activeCombo: ClientActiveCombo): void {
    this.activeModal = null;
    this.cdr.markForCheck();

    const baseClient = this.selectedClientId
      ? { id: this.selectedClientId, full_name: this.clientQuery }
      : null;
    const partialPurchase: CafeteriaComboPurchaseView = {
      ...activeCombo,
      client: baseClient,
      trainer: null,
      buyer_name: baseClient?.full_name ?? '—',
      consumption_percent:
        (activeCombo.total_units ?? 0) > 0
          ? Math.min(
              100,
              Math.round(((activeCombo.units_consumed ?? 0) / (activeCombo.total_units ?? 1)) * 100)
            )
          : 0,
      payment_percent:
        (activeCombo.combo_price_snapshot_cop ?? 0) > 0
          ? Math.min(
              100,
              Math.round(
                ((activeCombo.amount_received_cop ?? 0) / (activeCombo.combo_price_snapshot_cop ?? 1)) * 100
              )
            )
          : 0
    };

    setTimeout(() => {
      this.openComboDetailModal(partialPurchase);
    }, 50);
  }

  // ─── Track by functions ───────────────────────────────────────────────────────

  trackBySaleId(_index: number, sale: CafeteriaSaleView): string {
    return sale.id;
  }

  trackByPurchaseId(_index: number, p: CafeteriaComboPurchaseView): string {
    return p.id;
  }

  trackByInstallmentId(_index: number, inst: CafeteriaInstallment): string {
    return inst.id;
  }

  trackByConsumptionId(_index: number, c: ComboConsumptionItem): string {
    return c.id;
  }

  trackByProductId(_index: number, p: CafeteriaProduct): string {
    return p.id;
  }

  trackByComboId(_index: number, c: CafeteriaComboWithProduct): string {
    return c.id;
  }

  trackByClientId(_index: number, c: ActiveClient): string {
    return c.id;
  }

  trackByTrainerId(_index: number, t: TrainerOption): string {
    return t.id;
  }

  trackByActiveComboId(_index: number, c: ClientActiveCombo): string {
    return c.id;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private refreshCurrentMonth(): void {
    this.refresh$.next({ year: this.currentYear, month: this.currentMonth });
  }
}
