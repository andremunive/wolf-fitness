import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BehaviorSubject, Subject } from 'rxjs';
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
import { CafeteriaService } from '../../services/cafeteria.service';
import {
  ActiveClient,
  CafeteriaComboWithProduct,
  CafeteriaInstallment,
  CafeteriaProduct,
  CafeteriaComboPurchase,
  CafeteriaComboPurchaseWithDetails,
  CafeteriaSaleWithDetails,
  ClientActiveCombo,
  TrainerOption
} from '../../models/cafeteria.model';

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

interface VentasSalesState {
  loading: boolean;
  error: string | null;
  sales: CafeteriaSaleWithDetails[];
}

interface VentasCombosState {
  loading: boolean;
  error: string | null;
  purchases: CafeteriaComboPurchaseWithDetails[];
}

type ComboConsumptionItem = {
  id: string;
  consumed_at: string;
  registered_by: string;
  registered_by_name: string | null;
};

const LOADING_SALES_STATE: VentasSalesState = { loading: true, error: null, sales: [] };
const LOADING_COMBOS_STATE: VentasCombosState = { loading: true, error: null, purchases: [] };

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
      this.cafeteriaService.getSales(year, month).pipe(
        map((sales) => ({ loading: false, error: null, sales } as VentasSalesState)),
        catchError((err) => {
          const msg: string = err?.message ?? 'Error al cargar las ventas.';
          return of({ loading: false, error: msg, sales: [] } as VentasSalesState);
        }),
        startWith(LOADING_SALES_STATE)
      )
    ),
    shareReplay(1)
  );

  // ─── Combo purchases state ────────────────────────────────────────────────────

  readonly combosState$ = this.refresh$.pipe(
    switchMap(({ year, month }) =>
      this.cafeteriaService.getComboPurchases(year, month).pipe(
        map((purchases) => ({ loading: false, error: null, purchases } as VentasCombosState)),
        catchError((err) => {
          const msg: string = err?.message ?? 'Error al cargar los combos.';
          return of({ loading: false, error: msg, purchases: [] } as VentasCombosState);
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

  statusFilter: StatusFilter = 'all';

  // ─── Modal state ──────────────────────────────────────────────────────────────

  activeModal: VentasModal = null;
  selectedSale: CafeteriaSaleWithDetails | null = null;
  selectedPurchase: CafeteriaComboPurchaseWithDetails | null = null;

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
  activeProducts: CafeteriaProduct[] = [];
  activeCombos: CafeteriaComboWithProduct[] = [];
  activeClients: ActiveClient[] = [];
  trainers: TrainerOption[] = [];
  isLoadingFormData = false;

  clientQuery = '';
  trainerQuery = '';
  comboClientQuery = '';

  readonly newSaleForm: FormGroup = this.fb.group({
    product_id: [null, [Validators.required]],
    quantity: [1, [Validators.required, Validators.min(1)]],
    sale_date: [this.localDateString(new Date()), [Validators.required]],
    amount_received_cop: [0],
    payment_method: [null],
    notes: ['', [Validators.maxLength(300)]]
  });

  readonly newComboForm: FormGroup = this.fb.group({
    combo_id: [null, [Validators.required]],
    purchase_date: [this.localDateString(new Date()), [Validators.required]],
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

  // ─── Installment modal (individual) ──────────────────────────────────────────

  readonly installmentForm: FormGroup = this.fb.group({
    amount_cop: [null, [Validators.required, Validators.min(1)]],
    payment_date: [this.localDateString(new Date()), [Validators.required]],
    payment_method: ['', [Validators.required]],
    notes: ['', [Validators.maxLength(300)]]
  });

  installmentAmountRaw = '';

  // ─── Installment modal (combo) ────────────────────────────────────────────────

  readonly comboInstallmentForm: FormGroup = this.fb.group({
    amount_cop: [null, [Validators.required, Validators.min(1)]],
    payment_date: [this.localDateString(new Date()), [Validators.required]],
    payment_method: ['', [Validators.required]],
    notes: ['', [Validators.maxLength(300)]]
  });

  comboInstallmentAmountRaw = '';

  // ─── Saving flags ─────────────────────────────────────────────────────────────

  isSaving = false;
  saveError: string | null = null;

  skeletonRows = [1, 2, 3, 4, 5];

  readonly today = this.localDateString(new Date());

  constructor(
    private readonly cafeteriaService: CafeteriaService,
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
    this.statusFilter = 'all';
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
    this.statusFilter = filter;
    this.cdr.markForCheck();
  }

  filterSales(sales: CafeteriaSaleWithDetails[]): CafeteriaSaleWithDetails[] {
    if (this.statusFilter === 'all') return sales;
    return sales.filter((s) => s.status === this.statusFilter);
  }

  filterPurchases(purchases: CafeteriaComboPurchaseWithDetails[]): CafeteriaComboPurchaseWithDetails[] {
    if (this.statusFilter === 'all') return purchases;
    return purchases.filter((p) => p.status === this.statusFilter);
  }

  // ─── Summary calculations (individual) ───────────────────────────────────────

  totalIngresos(sales: CafeteriaSaleWithDetails[]): number {
    return sales.reduce((acc, s) => acc + s.amount_received_cop, 0);
  }

  totalRegistradas(sales: CafeteriaSaleWithDetails[]): number {
    return sales.length;
  }

  saldoPendiente(sales: CafeteriaSaleWithDetails[]): number {
    return sales
      .filter((s) => s.status === 'pending' || s.status === 'partial')
      .reduce((acc, s) => acc + (s.balance_cop ?? 0), 0);
  }

  // ─── Summary calculations (combos) ───────────────────────────────────────────

  totalIngresosCombo(purchases: CafeteriaComboPurchaseWithDetails[]): number {
    return purchases.reduce((acc, p) => acc + (p.amount_received_cop ?? 0), 0);
  }

  totalCombosVendidos(purchases: CafeteriaComboPurchaseWithDetails[]): number {
    return purchases.length;
  }

  saldoPendienteCombo(purchases: CafeteriaComboPurchaseWithDetails[]): number {
    return purchases
      .filter((p) => p.status === 'pending' || p.status === 'partial')
      .reduce((acc, p) => acc + (p.balance_cop ?? 0), 0);
  }

  // ─── Sale computations ────────────────────────────────────────────────────────

  getSaleTotal(sale: CafeteriaSaleWithDetails): number {
    return (sale.product_price_snapshot_cop ?? 0) * (sale.quantity ?? 1);
  }

  getProgressPercent(sale: CafeteriaSaleWithDetails): number {
    const total = this.getSaleTotal(sale);
    if (total === 0) return 0;
    return Math.min(100, Math.round(((sale.amount_received_cop ?? 0) / total) * 100));
  }

  isFullyPaid(sale: CafeteriaSaleWithDetails): boolean {
    return (sale.amount_received_cop ?? 0) >= this.getSaleTotal(sale);
  }

  // ─── Combo purchase computations ──────────────────────────────────────────────

  getComboPaymentProgressPercent(purchase: CafeteriaComboPurchaseWithDetails): number {
    const price = purchase.combo_price_snapshot_cop ?? 0;
    if (price === 0) return 0;
    return Math.min(100, Math.round(((purchase.amount_received_cop ?? 0) / price) * 100));
  }

  getComboConsumptionPercent(purchase: CafeteriaComboPurchaseWithDetails): number {
    const total = purchase.total_units ?? 0;
    if (total === 0) return 0;
    return Math.min(100, Math.round(((purchase.units_consumed ?? 0) / total) * 100));
  }

  // ─── Date helpers ─────────────────────────────────────────────────────────────

  hasDifferentRegistrationDate(sale: CafeteriaSaleWithDetails): boolean {
    if (!sale.reported_date || !sale.sale_date) return false;
    return sale.sale_date !== sale.reported_date;
  }

  formatDateShort(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }

  formatDateTime(isoStr: string | null | undefined): string {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  }

  // ─── Modal: New sale (opener) ─────────────────────────────────────────────────

  openNewSaleModal(): void {
    this.saleType = 'individual';
    this.buyerType = 'client';
    this.clientQuery = '';
    this.trainerQuery = '';
    this.comboClientQuery = '';
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
      sale_date: this.localDateString(new Date()),
      amount_received_cop: 0,
      payment_method: null,
      notes: ''
    });
    this.newComboForm.reset({
      combo_id: null,
      purchase_date: this.localDateString(new Date()),
      amount_received_cop: 0,
      payment_method: null
    });
    this.activeModal = 'new-sale';
    this.cdr.markForCheck();

    this.isLoadingFormData = true;
    this.cafeteriaService
      .getProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (products) => {
          this.activeProducts = products.filter((p) => p.is_active);
          this.isLoadingFormData = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingFormData = false;
          this.cdr.markForCheck();
        }
      });

    this.cafeteriaService
      .getCombos()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (combos) => {
          this.activeCombos = combos.filter((c) => c.is_active);
          this.cdr.markForCheck();
        },
        error: () => {
          this.cdr.markForCheck();
        }
      });

    this.cafeteriaService
      .getActiveClients()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (clients) => {
          this.activeClients = clients;
          this.cdr.markForCheck();
        },
        error: () => {
          this.cdr.markForCheck();
        }
      });

    this.cafeteriaService
      .getTrainers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (trainers) => {
          this.trainers = trainers;
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
    this.selectedClientId = null;
    this.selectedTrainerId = null;
    this.clientActiveCombos = [];
    this.cdr.markForCheck();
  }

  // ─── Buyer autocomplete (individual) ─────────────────────────────────────────

  get filteredClients(): ActiveClient[] {
    if (!this.clientQuery.trim()) return this.activeClients.slice(0, 8);
    const q = this.clientQuery.toLowerCase();
    return this.activeClients.filter((c) => c.full_name.toLowerCase().includes(q)).slice(0, 8);
  }

  get filteredTrainers(): TrainerOption[] {
    if (!this.trainerQuery.trim()) return this.trainers;
    const q = this.trainerQuery.toLowerCase();
    return this.trainers.filter((t) => t.full_name.toLowerCase().includes(q));
  }

  onClientQueryInput(event: Event): void {
    this.clientQuery = (event.target as HTMLInputElement).value;
    this.selectedClientId = null;
    this.clientActiveCombos = [];
    this.showClientDropdown = true;
    this.cdr.markForCheck();
  }

  selectClient(client: ActiveClient): void {
    this.selectedClientId = client.id;
    this.clientQuery = client.full_name;
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
    this.trainerQuery = (event.target as HTMLInputElement).value;
    this.selectedTrainerId = null;
    this.showTrainerDropdown = true;
    this.cdr.markForCheck();
  }

  selectTrainer(trainer: TrainerOption): void {
    this.selectedTrainerId = trainer.id;
    this.trainerQuery = trainer.full_name;
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
    this.cafeteriaService
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

  get filteredComboClients(): ActiveClient[] {
    if (!this.comboClientQuery.trim()) return this.activeClients.slice(0, 8);
    const q = this.comboClientQuery.toLowerCase();
    return this.activeClients.filter((c) => c.full_name.toLowerCase().includes(q)).slice(0, 8);
  }

  onComboClientQueryInput(event: Event): void {
    this.comboClientQuery = (event.target as HTMLInputElement).value;
    this.comboSelectedClientId = null;
    this.comboDuplicateWarning = null;
    this.showComboClientDropdown = true;
    this.cdr.markForCheck();
  }

  selectComboClient(client: ActiveClient): void {
    this.comboSelectedClientId = client.id;
    this.comboClientQuery = client.full_name;
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

    this.cafeteriaService
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
    const parsed = this.parsePriceInput(raw);
    this.newSaleForm.get('amount_received_cop')?.setValue(parsed ?? 0);
    this.cdr.markForCheck();
  }

  onAmountReceivedBlur(): void {
    const parsed = this.parsePriceInput(this.amountReceivedRaw);
    const val = parsed ?? 0;
    this.newSaleForm.get('amount_received_cop')?.setValue(val);
    this.amountReceivedRaw = val > 0 ? this.formatPriceDisplay(val) : '0';
    this.cdr.markForCheck();
  }

  // ─── Amount received (combo form) ─────────────────────────────────────────────

  onComboAmountReceivedInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.comboAmountReceivedRaw = raw;
    const parsed = this.parsePriceInput(raw);
    this.newComboForm.get('amount_received_cop')?.setValue(parsed ?? 0);
    this.cdr.markForCheck();
  }

  onComboAmountReceivedBlur(): void {
    const parsed = this.parsePriceInput(this.comboAmountReceivedRaw);
    const val = parsed ?? 0;
    this.newComboForm.get('amount_received_cop')?.setValue(val);
    this.comboAmountReceivedRaw = val > 0 ? this.formatPriceDisplay(val) : '0';
    this.cdr.markForCheck();
  }

  // ─── Form computed values (individual) ───────────────────────────────────────

  getSelectedProduct(): CafeteriaProduct | null {
    const id = this.newSaleForm.get('product_id')?.value as string | null;
    if (!id) return null;
    return this.activeProducts.find((p) => p.id === id) ?? null;
  }

  getFormTotal(): number {
    const product = this.getSelectedProduct();
    const qty = (this.newSaleForm.get('quantity')?.value as number) ?? 1;
    if (!product || qty < 1) return 0;
    return product.price_cop * qty;
  }

  getAmountHint(): 'none' | 'partial' | 'exact' | 'over' | 'zero' {
    const received = (this.newSaleForm.get('amount_received_cop')?.value as number) ?? 0;
    const total = this.getFormTotal();
    if (received === 0 || total === 0) return 'zero';
    if (received > total) return 'over';
    if (received === total) return 'exact';
    return 'partial';
  }

  isPaymentMethodRequired(): boolean {
    const received = (this.newSaleForm.get('amount_received_cop')?.value as number) ?? 0;
    return received > 0;
  }

  // ─── Form computed values (combo) ────────────────────────────────────────────

  getSelectedCombo(): CafeteriaComboWithProduct | null {
    const id = this.newComboForm.get('combo_id')?.value as string | null;
    if (!id) return null;
    return this.activeCombos.find((c) => c.id === id) ?? null;
  }

  getComboAmountHint(): 'none' | 'partial' | 'exact' | 'over' | 'zero' {
    const received = (this.newComboForm.get('amount_received_cop')?.value as number) ?? 0;
    const combo = this.getSelectedCombo();
    const total = combo?.price_cop ?? 0;
    if (received === 0 || total === 0) return 'zero';
    if (received > total) return 'over';
    if (received === total) return 'exact';
    return 'partial';
  }

  isComboPaymentMethodRequired(): boolean {
    const received = (this.newComboForm.get('amount_received_cop')?.value as number) ?? 0;
    return received > 0;
  }

  get isComboFormBlocked(): boolean {
    return !!this.comboDuplicateWarning || this.isCheckingComboConflict;
  }

  // ─── Submit new sale (individual) ────────────────────────────────────────────

  submitNewSale(): void {
    this.newSaleForm.markAllAsTouched();

    const product = this.getSelectedProduct();
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

    this.cafeteriaService
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
          this.saveError = this.extractErrorMessage(err);
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

    this.cafeteriaService
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
          this.saveError = this.extractErrorMessage(err);
        }
      });
  }

  // ─── Modal: Individual sale detail ────────────────────────────────────────────

  openDetailModal(sale: CafeteriaSaleWithDetails): void {
    this.selectedSale = sale;
    this.installments = [];
    this.isLoadingInstallments = true;
    this.activeModal = 'detail';
    this.cdr.markForCheck();

    this.cafeteriaService
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

  openInstallmentModal(sale: CafeteriaSaleWithDetails): void {
    this.selectedSale = sale;
    this.installmentAmountRaw = '';
    this.saveError = null;
    this.installmentForm.reset({
      amount_cop: null,
      payment_date: this.localDateString(new Date()),
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
      payment_date: this.localDateString(new Date()),
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
    const parsed = this.parsePriceInput(raw);
    this.installmentForm.get('amount_cop')?.setValue(parsed ?? null);
    this.cdr.markForCheck();
  }

  onInstallmentAmountBlur(): void {
    const parsed = this.parsePriceInput(this.installmentAmountRaw);
    if (parsed !== null && parsed > 0) {
      this.installmentForm.get('amount_cop')?.setValue(parsed);
      this.installmentAmountRaw = this.formatPriceDisplay(parsed);
    } else {
      this.installmentForm.get('amount_cop')?.setValue(null);
      this.installmentAmountRaw = '';
    }
    this.cdr.markForCheck();
  }

  getInstallmentNewBalance(): number {
    if (!this.selectedSale) return 0;
    const amount = (this.installmentForm.get('amount_cop')?.value as number) ?? 0;
    return Math.max(0, (this.selectedSale.balance_cop ?? 0) - amount);
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

    this.cafeteriaService
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
          this.saveError = this.extractErrorMessage(err);
        }
      });
  }

  // ─── Modal: Combo detail ──────────────────────────────────────────────────────

  openComboDetailModal(purchase: CafeteriaComboPurchaseWithDetails): void {
    this.selectedPurchase = purchase;
    this.comboConsumptions = [];
    this.comboInstallments = [];
    this.isLoadingComboDetail = true;
    this.activeModal = 'combo-detail';
    this.cdr.markForCheck();

    this.cafeteriaService
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

    this.cafeteriaService
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

    this.cafeteriaService
      .registerComboConsumption(purchaseId)
      .pipe(
        finalize(() => {
          this.isRegisteringConsumption = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (updatedPurchase) => {
          const wasCompleted = !this.selectedPurchase?.is_completed && updatedPurchase.is_completed;
          this.selectedPurchase = {
            ...this.selectedPurchase!,
            units_consumed: updatedPurchase.units_consumed,
            is_completed: updatedPurchase.is_completed
          };
          this.cafeteriaService
            .getComboConsumptions(purchaseId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (items) => {
                this.comboConsumptions = items;
                this.cdr.markForCheck();
              },
              error: () => {
                this.cdr.markForCheck();
              }
            });
          this.toastService.success('Consumo registrado.');
          if (wasCompleted) {
            this.toastService.success('¡Combo completado!');
          }
          this.refreshCurrentMonth();
        },
        error: (err) => {
          this.toastService.error(this.extractErrorMessage(err));
        }
      });
  }

  openConsumptionFromMenu(purchase: CafeteriaComboPurchaseWithDetails): void {
    this.openComboDetailModal(purchase);
  }

  // ─── Modal: Combo installment ─────────────────────────────────────────────────

  openComboInstallmentFromDetail(): void {
    if (!this.selectedPurchase) return;
    this.comboInstallmentAmountRaw = '';
    this.saveError = null;
    this.comboInstallmentForm.reset({
      amount_cop: null,
      payment_date: this.localDateString(new Date()),
      payment_method: '',
      notes: ''
    });
    this.activeModal = 'combo-installment';
    this.cdr.markForCheck();
  }

  openComboInstallmentFromMenu(purchase: CafeteriaComboPurchaseWithDetails): void {
    this.selectedPurchase = purchase;
    this.comboInstallmentAmountRaw = '';
    this.saveError = null;
    this.comboInstallmentForm.reset({
      amount_cop: null,
      payment_date: this.localDateString(new Date()),
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
    const parsed = this.parsePriceInput(raw);
    this.comboInstallmentForm.get('amount_cop')?.setValue(parsed ?? null);
    this.cdr.markForCheck();
  }

  onComboInstallmentAmountBlur(): void {
    const parsed = this.parsePriceInput(this.comboInstallmentAmountRaw);
    if (parsed !== null && parsed > 0) {
      this.comboInstallmentForm.get('amount_cop')?.setValue(parsed);
      this.comboInstallmentAmountRaw = this.formatPriceDisplay(parsed);
    } else {
      this.comboInstallmentForm.get('amount_cop')?.setValue(null);
      this.comboInstallmentAmountRaw = '';
    }
    this.cdr.markForCheck();
  }

  getComboInstallmentNewBalance(): number {
    if (!this.selectedPurchase) return 0;
    const amount = (this.comboInstallmentForm.get('amount_cop')?.value as number) ?? 0;
    return Math.max(0, (this.selectedPurchase.balance_cop ?? 0) - amount);
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

    this.cafeteriaService
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
          this.saveError = this.extractErrorMessage(err);
        }
      });
  }

  // ─── Active combo banner: jump to detail ─────────────────────────────────────

  openComboDetailFromBanner(activeCombo: ClientActiveCombo): void {
    this.activeModal = null;
    this.cdr.markForCheck();

    const partialPurchase: CafeteriaComboPurchaseWithDetails = {
      ...activeCombo,
      client: this.selectedClientId
        ? { id: this.selectedClientId, full_name: this.clientQuery }
        : null,
      trainer: null
    };

    setTimeout(() => {
      this.openComboDetailModal(partialPurchase);
    }, 50);
  }

  // ─── Display helpers ──────────────────────────────────────────────────────────

  formatCop(amount: number | null | undefined): string {
    if (amount === null || amount === undefined) return '—';
    return '$' + amount.toLocaleString('es-CO');
  }

  getBuyerName(sale: CafeteriaSaleWithDetails): string {
    return sale.client?.full_name ?? sale.trainer?.full_name ?? '—';
  }

  getBuyerType(sale: CafeteriaSaleWithDetails): 'client' | 'trainer' {
    return sale.buyer_type as 'client' | 'trainer';
  }

  getComboBuyerName(purchase: CafeteriaComboPurchaseWithDetails): string {
    return purchase.client?.full_name ?? purchase.trainer?.full_name ?? '—';
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = { paid: 'Pagado', partial: 'Parcial', pending: 'Pendiente' };
    return map[status] ?? status;
  }

  getMethodLabel(method: string | null): string {
    const map: Record<string, string> = {
      cash: 'Efectivo',
      transfer: 'Transferencia',
      nequi: 'Nequi',
      other: 'Otro'
    };
    return method ? (map[method] ?? method) : '—';
  }

  // ─── Track by functions ───────────────────────────────────────────────────────

  trackBySaleId(_index: number, sale: CafeteriaSaleWithDetails): string {
    return sale.id;
  }

  trackByPurchaseId(_index: number, p: CafeteriaComboPurchaseWithDetails): string {
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

  private parsePriceInput(value: string): number | null {
    const cleaned = value.replace(/[^0-9]/g, '');
    if (!cleaned) return null;
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  }

  private formatPriceDisplay(amount: number): string {
    return '$' + amount.toLocaleString('es-CO');
  }

  private localDateString(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private extractErrorMessage(err: unknown): string {
    if (err && typeof err === 'object') {
      const anyErr = err as Record<string, unknown>;
      if (typeof anyErr['message'] === 'string') return anyErr['message'];
    }
    return 'Ocurrió un error. Intenta de nuevo.';
  }
}
