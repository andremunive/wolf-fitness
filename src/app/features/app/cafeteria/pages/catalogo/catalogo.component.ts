import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import {
  catchError,
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
  CafeteriaComboWithProduct,
  CafeteriaProduct,
  CafeteriaProductPriceHistory
} from '../../models/cafeteria.model';

export type CatalogoModal =
  | 'new-product'
  | 'edit-product'
  | 'update-price'
  | 'price-history'
  | 'new-combo'
  | 'edit-combo'
  | null;

interface PageViewState {
  loading: boolean;
  error: string | null;
  products: CafeteriaProduct[];
}

interface CombosViewState {
  loading: boolean;
  error: string | null;
  combos: CafeteriaComboWithProduct[];
}

const LOADING_STATE: PageViewState = { loading: true, error: null, products: [] };
const COMBOS_LOADING_STATE: CombosViewState = { loading: true, error: null, combos: [] };

@Component({
  selector: 'app-cafeteria-catalogo',
  templateUrl: './catalogo.component.html',
  styleUrls: ['./catalogo.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatalogoComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private readonly refreshCombos$ = new BehaviorSubject<void>(undefined);

  // ─── Products view state ─────────────────────────────────────────────────────

  readonly viewState$: Observable<PageViewState> = this.refresh$.pipe(
    switchMap(() =>
      this.cafeteriaService.getProducts().pipe(
        map((products) => ({ loading: false, error: null, products })),
        catchError((err) => {
          const msg: string = err?.message ?? 'Error al cargar los productos.';
          return of({ loading: false, error: msg, products: [] });
        }),
        startWith(LOADING_STATE)
      )
    ),
    shareReplay(1)
  );

  // ─── Combos view state ───────────────────────────────────────────────────────

  readonly combosState$: Observable<CombosViewState> = this.refreshCombos$.pipe(
    switchMap(() =>
      this.cafeteriaService.getCombos().pipe(
        map((combos) => ({ loading: false, error: null, combos })),
        catchError((err) => {
          const msg: string = err?.message ?? 'Error al cargar los combos.';
          return of({ loading: false, error: msg, combos: [] });
        }),
        startWith(COMBOS_LOADING_STATE)
      )
    ),
    shareReplay(1)
  );

  // ─── Modal state ─────────────────────────────────────────────────────────────

  activeModal: CatalogoModal = null;
  selectedProduct: CafeteriaProduct | null = null;
  selectedCombo: CafeteriaComboWithProduct | null = null;

  // ─── Price history ────────────────────────────────────────────────────────────

  priceHistory: CafeteriaProductPriceHistory[] = [];
  isPriceHistoryLoading = false;

  // ─── Current price entry (for update-price modal) ────────────────────────────

  currentPriceEntry: CafeteriaProductPriceHistory | null = null;

  // ─── Toggle in-flight sets ────────────────────────────────────────────────────

  togglingIds = new Set<string>();
  togglingComboIds = new Set<string>();

  // ─── Form saving ─────────────────────────────────────────────────────────────

  isSaving = false;
  saveError: string | null = null;

  // ─── Forms — products ────────────────────────────────────────────────────────

  readonly newProductForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    size_label: ['', [Validators.required, Validators.maxLength(20)]],
    price_cop: [null, [Validators.required, Validators.min(1)]]
  });

  readonly editProductForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    size_label: ['', [Validators.required, Validators.maxLength(20)]]
  });

  readonly updatePriceForm: FormGroup = this.fb.group({
    new_price: [null, [Validators.required, Validators.min(1)]]
  });

  // ─── Forms — combos ──────────────────────────────────────────────────────────

  readonly newComboForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    product_id: [null, [Validators.required]],
    quantity: [null, [Validators.required, Validators.min(2)]],
    price_cop: [null, [Validators.required, Validators.min(1)]]
  });

  readonly editComboForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    product_id: [null, [Validators.required]],
    quantity: [null, [Validators.required, Validators.min(2)]],
    price_cop: [null, [Validators.required, Validators.min(1)]]
  });

  // ─── Raw price values (for the masked input display) ─────────────────────────

  newProductPriceRaw = '';
  updatePriceRaw = '';
  newComboPriceRaw = '';
  editComboPriceRaw = '';

  // ─── Active products cache (for combo selects) ───────────────────────────────

  activeProducts: CafeteriaProduct[] = [];

  skeletonRows = [1, 2, 3, 4];

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

  // ─── Refresh ─────────────────────────────────────────────────────────────────

  refresh(): void {
    this.refresh$.next();
  }

  refreshCombos(): void {
    this.refreshCombos$.next();
  }

  // ─── Modal: New product ───────────────────────────────────────────────────────

  openNewProductModal(): void {
    this.newProductForm.reset();
    this.newProductPriceRaw = '';
    this.saveError = null;
    this.activeModal = 'new-product';
    this.cdr.markForCheck();
  }

  closeNewProductModal(): void {
    this.activeModal = null;
    this.cdr.markForCheck();
  }

  submitNewProduct(): void {
    if (this.newProductForm.invalid || this.isSaving) return;
    this.newProductForm.markAllAsTouched();
    if (this.newProductForm.invalid) return;

    const { name, size_label, price_cop } = this.newProductForm.value as {
      name: string;
      size_label: string;
      price_cop: number;
    };

    this.isSaving = true;
    this.saveError = null;
    this.cdr.markForCheck();

    this.cafeteriaService
      .createProduct({ name: name.trim(), size_label: size_label.trim(), price_cop })
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
          this.toastService.success('Presentación creada correctamente.');
          this.refresh();
        },
        error: (err) => {
          this.saveError = this.extractErrorMessage(err);
        }
      });
  }

  // ─── Modal: Edit product ──────────────────────────────────────────────────────

  openEditModal(product: CafeteriaProduct): void {
    this.selectedProduct = product;
    this.editProductForm.patchValue({
      name: product.name,
      size_label: product.size_label
    });
    this.saveError = null;
    this.activeModal = 'edit-product';
    this.cdr.markForCheck();
  }

  closeEditModal(): void {
    this.activeModal = null;
    this.selectedProduct = null;
    this.cdr.markForCheck();
  }

  submitEditProduct(): void {
    if (this.editProductForm.invalid || this.isSaving || !this.selectedProduct) return;
    this.editProductForm.markAllAsTouched();
    if (this.editProductForm.invalid) return;

    const { name, size_label } = this.editProductForm.value as {
      name: string;
      size_label: string;
    };

    this.isSaving = true;
    this.saveError = null;
    this.cdr.markForCheck();

    this.cafeteriaService
      .updateProduct(this.selectedProduct.id, { name: name.trim(), size_label: size_label.trim() })
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
          this.selectedProduct = null;
          this.toastService.success('Presentación actualizada.');
          this.refresh();
        },
        error: (err) => {
          this.saveError = this.extractErrorMessage(err);
        }
      });
  }

  // ─── Modal: Update price ──────────────────────────────────────────────────────

  openUpdatePriceModal(product: CafeteriaProduct): void {
    this.selectedProduct = product;
    this.updatePriceForm.reset();
    this.updatePriceRaw = '';
    this.saveError = null;
    this.currentPriceEntry = null;
    this.isPriceHistoryLoading = true;
    this.activeModal = 'update-price';
    this.cdr.markForCheck();

    this.cafeteriaService
      .getPriceHistory(product.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (history) => {
          this.currentPriceEntry = history.find((h) => h.valid_until === null) ?? null;
          this.isPriceHistoryLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isPriceHistoryLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  closeUpdatePriceModal(): void {
    this.activeModal = null;
    this.selectedProduct = null;
    this.currentPriceEntry = null;
    this.cdr.markForCheck();
  }

  submitUpdatePrice(): void {
    if (this.updatePriceForm.invalid || this.isSaving || !this.selectedProduct) return;
    this.updatePriceForm.markAllAsTouched();
    if (this.updatePriceForm.invalid) return;

    const newPrice = this.updatePriceForm.value['new_price'] as number;
    const currentPrice = this.selectedProduct.price_cop;

    if (newPrice === currentPrice) {
      this.saveError = 'El nuevo precio debe ser diferente al precio actual.';
      this.cdr.markForCheck();
      return;
    }

    this.isSaving = true;
    this.saveError = null;
    this.cdr.markForCheck();

    this.cafeteriaService
      .updatePrice(this.selectedProduct.id, newPrice)
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
          this.selectedProduct = null;
          this.currentPriceEntry = null;
          this.toastService.success('Precio actualizado correctamente.');
          this.refresh();
        },
        error: (err) => {
          this.saveError = this.extractErrorMessage(err);
        }
      });
  }

  // ─── Modal: Price history ─────────────────────────────────────────────────────

  openPriceHistoryModal(product: CafeteriaProduct): void {
    this.selectedProduct = product;
    this.priceHistory = [];
    this.isPriceHistoryLoading = true;
    this.activeModal = 'price-history';
    this.cdr.markForCheck();

    this.cafeteriaService
      .getPriceHistory(product.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (history) => {
          this.priceHistory = history;
          this.isPriceHistoryLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isPriceHistoryLoading = false;
          this.toastService.error('No se pudo cargar el historial.');
          this.cdr.markForCheck();
        }
      });
  }

  closePriceHistoryModal(): void {
    this.activeModal = null;
    this.selectedProduct = null;
    this.priceHistory = [];
    this.cdr.markForCheck();
  }

  // ─── Modal: New combo ─────────────────────────────────────────────────────────

  openNewComboModal(products: CafeteriaProduct[]): void {
    this.activeProducts = products.filter((p) => p.is_active);
    this.newComboForm.reset();
    this.newComboPriceRaw = '';
    this.saveError = null;
    this.activeModal = 'new-combo';
    this.cdr.markForCheck();
  }

  closeNewComboModal(): void {
    this.activeModal = null;
    this.cdr.markForCheck();
  }

  submitNewCombo(): void {
    if (this.newComboForm.invalid || this.isSaving) return;
    this.newComboForm.markAllAsTouched();
    if (this.newComboForm.invalid) return;

    const { name, product_id, quantity, price_cop } = this.newComboForm.value as {
      name: string;
      product_id: string;
      quantity: number;
      price_cop: number;
    };

    this.isSaving = true;
    this.saveError = null;
    this.cdr.markForCheck();

    this.cafeteriaService
      .createCombo({ name: name.trim(), product_id, quantity, price_cop })
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
          this.toastService.success('Combo creado correctamente.');
          this.refreshCombos();
        },
        error: (err) => {
          this.saveError = this.extractErrorMessage(err);
        }
      });
  }

  // ─── Modal: Edit combo ────────────────────────────────────────────────────────

  openEditComboModal(combo: CafeteriaComboWithProduct, products: CafeteriaProduct[]): void {
    this.selectedCombo = combo;
    this.activeProducts = products.filter((p) => p.is_active);
    this.editComboPriceRaw = this.formatPriceDisplay(combo.price_cop);
    this.editComboForm.patchValue({
      name: combo.name,
      product_id: combo.product_id,
      quantity: combo.quantity,
      price_cop: combo.price_cop
    });
    this.saveError = null;
    this.activeModal = 'edit-combo';
    this.cdr.markForCheck();
  }

  closeEditComboModal(): void {
    this.activeModal = null;
    this.selectedCombo = null;
    this.cdr.markForCheck();
  }

  submitEditCombo(): void {
    if (this.editComboForm.invalid || this.isSaving || !this.selectedCombo) return;
    this.editComboForm.markAllAsTouched();
    if (this.editComboForm.invalid) return;

    const { name, product_id, quantity, price_cop } = this.editComboForm.value as {
      name: string;
      product_id: string;
      quantity: number;
      price_cop: number;
    };

    this.isSaving = true;
    this.saveError = null;
    this.cdr.markForCheck();

    this.cafeteriaService
      .updateCombo(this.selectedCombo.id, {
        name: name.trim(),
        product_id,
        quantity,
        price_cop
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
          this.selectedCombo = null;
          this.toastService.success('Combo actualizado correctamente.');
          this.refreshCombos();
        },
        error: (err) => {
          this.saveError = this.extractErrorMessage(err);
        }
      });
  }

  // ─── Toggle product ───────────────────────────────────────────────────────────

  toggleProduct(product: CafeteriaProduct): void {
    if (this.togglingIds.has(product.id)) return;

    this.togglingIds.add(product.id);
    this.cdr.markForCheck();

    this.cafeteriaService
      .toggleProduct(product.id, !product.is_active)
      .pipe(
        finalize(() => {
          this.togglingIds.delete(product.id);
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (updated) => {
          const label = updated.is_active ? 'activada' : 'desactivada';
          this.toastService.success(`Presentación ${label}.`);
          this.refresh();
        },
        error: (err) => {
          this.toastService.error(this.extractErrorMessage(err));
        }
      });
  }

  // ─── Toggle combo ─────────────────────────────────────────────────────────────

  toggleCombo(combo: CafeteriaComboWithProduct): void {
    if (this.togglingComboIds.has(combo.id)) return;

    this.togglingComboIds.add(combo.id);
    this.cdr.markForCheck();

    this.cafeteriaService
      .toggleCombo(combo.id, !combo.is_active)
      .pipe(
        finalize(() => {
          this.togglingComboIds.delete(combo.id);
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (updated) => {
          const label = updated.is_active ? 'activado' : 'desactivado';
          this.toastService.success(`Combo ${label}.`);
          this.refreshCombos();
        },
        error: (err) => {
          this.toastService.error(this.extractErrorMessage(err));
        }
      });
  }

  // ─── Price formatting — products ──────────────────────────────────────────────

  onNewPriceBlur(): void {
    const raw = this.parsePriceInput(this.newProductPriceRaw);
    if (raw !== null && raw > 0) {
      this.newProductForm.get('price_cop')?.setValue(raw);
      this.newProductPriceRaw = this.formatPriceDisplay(raw);
    } else {
      this.newProductForm.get('price_cop')?.setValue(null);
    }
    this.cdr.markForCheck();
  }

  onNewPriceInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.newProductPriceRaw = input.value;
    const parsed = this.parsePriceInput(input.value);
    this.newProductForm.get('price_cop')?.setValue(parsed ?? null);
  }

  onUpdatePriceBlur(): void {
    const raw = this.parsePriceInput(this.updatePriceRaw);
    if (raw !== null && raw > 0) {
      this.updatePriceForm.get('new_price')?.setValue(raw);
      this.updatePriceRaw = this.formatPriceDisplay(raw);
    } else {
      this.updatePriceForm.get('new_price')?.setValue(null);
    }
    this.cdr.markForCheck();
  }

  onUpdatePriceInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.updatePriceRaw = input.value;
    const parsed = this.parsePriceInput(input.value);
    this.updatePriceForm.get('new_price')?.setValue(parsed ?? null);
  }

  // ─── Price formatting — combos ────────────────────────────────────────────────

  onNewComboPriceBlur(): void {
    const raw = this.parsePriceInput(this.newComboPriceRaw);
    if (raw !== null && raw > 0) {
      this.newComboForm.get('price_cop')?.setValue(raw);
      this.newComboPriceRaw = this.formatPriceDisplay(raw);
    } else {
      this.newComboForm.get('price_cop')?.setValue(null);
    }
    this.cdr.markForCheck();
  }

  onNewComboPriceInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.newComboPriceRaw = input.value;
    const parsed = this.parsePriceInput(input.value);
    this.newComboForm.get('price_cop')?.setValue(parsed ?? null);
  }

  onEditComboPriceBlur(): void {
    const raw = this.parsePriceInput(this.editComboPriceRaw);
    if (raw !== null && raw > 0) {
      this.editComboForm.get('price_cop')?.setValue(raw);
      this.editComboPriceRaw = this.formatPriceDisplay(raw);
    } else {
      this.editComboForm.get('price_cop')?.setValue(null);
    }
    this.cdr.markForCheck();
  }

  onEditComboPriceInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.editComboPriceRaw = input.value;
    const parsed = this.parsePriceInput(input.value);
    this.editComboForm.get('price_cop')?.setValue(parsed ?? null);
  }

  // ─── Combo preview helpers ────────────────────────────────────────────────────

  getSelectedProductForForm(form: FormGroup): CafeteriaProduct | null {
    const productId = form.get('product_id')?.value as string | null;
    if (!productId) return null;
    return this.activeProducts.find((p) => p.id === productId) ?? null;
  }

  getComboUnitPrice(form: FormGroup): number | null {
    const price = form.get('price_cop')?.value as number | null;
    const qty = form.get('quantity')?.value as number | null;
    if (!price || !qty || qty < 1) return null;
    return Math.round(price / qty);
  }

  getComboSavingPercent(form: FormGroup): number | null {
    const unitPrice = this.getComboUnitPrice(form);
    const product = this.getSelectedProductForForm(form);
    if (!unitPrice || !product) return null;
    const saving = 1 - unitPrice / product.price_cop;
    return saving > 0 ? Math.round(saving * 100) : null;
  }

  getComboSavingAmount(form: FormGroup): number | null {
    const unitPrice = this.getComboUnitPrice(form);
    const product = this.getSelectedProductForForm(form);
    if (!unitPrice || !product) return null;
    const saving = product.price_cop - unitPrice;
    return saving > 0 ? saving : null;
  }

  // ─── Table display helpers ────────────────────────────────────────────────────

  getComboUnitPriceFromCombo(combo: CafeteriaComboWithProduct): number {
    return Math.round(combo.price_cop / combo.quantity);
  }

  getComboSavingPercentFromCombo(combo: CafeteriaComboWithProduct): number | null {
    if (!combo.product) return null;
    const unitPrice = this.getComboUnitPriceFromCombo(combo);
    const saving = 1 - unitPrice / combo.product.price_cop;
    return saving > 0 ? Math.round(saving * 100) : null;
  }

  // ─── Display helpers ──────────────────────────────────────────────────────────

  formatCop(amount: number | null): string {
    if (amount === null || amount === undefined) return '—';
    return '$' + amount.toLocaleString('es-CO');
  }

  formatDateOnly(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  isTogglingProduct(productId: string): boolean {
    return this.togglingIds.has(productId);
  }

  isTogglingCombo(comboId: string): boolean {
    return this.togglingComboIds.has(comboId);
  }

  trackByProductId(_index: number, product: CafeteriaProduct): string {
    return product.id;
  }

  trackByComboId(_index: number, combo: CafeteriaComboWithProduct): string {
    return combo.id;
  }

  trackByHistoryId(_index: number, entry: CafeteriaProductPriceHistory): string {
    return entry.id;
  }

  trackByProductSelect(_index: number, product: CafeteriaProduct): string {
    return product.id;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private parsePriceInput(value: string): number | null {
    const cleaned = value.replace(/[^0-9]/g, '');
    if (!cleaned) return null;
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  }

  private formatPriceDisplay(amount: number): string {
    return '$' + amount.toLocaleString('es-CO');
  }

  private extractErrorMessage(err: unknown): string {
    if (err && typeof err === 'object') {
      const anyErr = err as Record<string, unknown>;
      if (typeof anyErr['message'] === 'string') return anyErr['message'];
    }
    return 'Ocurrió un error. Intenta de nuevo.';
  }
}
