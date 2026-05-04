import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, Subject } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, takeUntil } from 'rxjs/operators';
import { of } from 'rxjs';

import {
  Discount,
  DiscountType,
  formatDiscountValue,
  DISCOUNT_TYPE_LABELS
} from '../../models/discount.model';
import { DiscountsService } from '../../services/discounts.service';

export type TypeFilter = 'all' | DiscountType;
export type StatusFilter = 'all' | 'active' | 'inactive';

interface PageViewState {
  loading: boolean;
  error: string | null;
  discounts: Discount[];
}

const LOADING_STATE: PageViewState = { loading: true, error: null, discounts: [] };

@Component({
  selector: 'app-discounts-list-page',
  templateUrl: './discounts-list-page.component.html',
  styleUrls: ['./discounts-list-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DiscountsListPageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly refreshSubject = new BehaviorSubject<void>(undefined);
  private readonly typeFilterSubject = new BehaviorSubject<TypeFilter>('all');
  private readonly statusFilterSubject = new BehaviorSubject<StatusFilter>('all');

  readonly viewState$: Observable<PageViewState>;

  /** Currently open modal state. */
  isFormModalOpen = false;
  formModalMode: 'create' | 'edit' = 'create';
  editingDiscount: Discount | undefined;

  /** Toast state. */
  toastMessage: string | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  // Expose to template.
  readonly typeFilterOptions: Array<{ value: TypeFilter; label: string }> = [
    { value: 'all', label: 'Todos los tipos' },
    { value: 'promocion', label: 'Promoción' },
    { value: 'personal', label: 'Personal' }
  ];

  readonly statusFilterOptions: Array<{ value: StatusFilter; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'inactive', label: 'Inactivos' }
  ];

  constructor(
    private readonly discountsService: DiscountsService,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.viewState$ = combineLatest([
      this.refreshSubject.asObservable(),
      this.typeFilterSubject.asObservable(),
      this.statusFilterSubject.asObservable()
    ]).pipe(
      switchMap(([, typeFilter]) => {
        const typeArg = typeFilter === 'all' ? undefined : typeFilter;
        return this.discountsService.list({ type: typeArg }).pipe(
          map((discounts) => ({ loading: false, error: null, discounts })),
          catchError((err) => {
            const msg = err?.message ?? 'No se pudo cargar la lista de descuentos.';
            return of({ loading: false, error: msg as string, discounts: [] });
          }),
          startWith(LOADING_STATE)
        );
      }),
      shareReplay(1)
    );
  }

  ngOnInit(): void {
    // Pipe is already wired.
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  // ─── Filter helpers ────────────────────────────────────────────────────────

  get currentTypeFilter(): TypeFilter {
    return this.typeFilterSubject.value;
  }

  get currentStatusFilter(): StatusFilter {
    return this.statusFilterSubject.value;
  }

  onTypeFilterChange(value: TypeFilter): void {
    this.typeFilterSubject.next(value);
  }

  onStatusFilterChange(value: StatusFilter): void {
    this.statusFilterSubject.next(value);
  }

  applyStatusFilter(discounts: Discount[]): Discount[] {
    const status = this.statusFilterSubject.value;
    if (status === 'active') return discounts.filter((d) => d.is_active);
    if (status === 'inactive') return discounts.filter((d) => !d.is_active);
    return discounts;
  }

  // ─── Modal helpers ─────────────────────────────────────────────────────────

  openCreateModal(): void {
    this.formModalMode = 'create';
    this.editingDiscount = undefined;
    this.isFormModalOpen = true;
    this.cdr.markForCheck();
  }

  openEditModal(discount: Discount): void {
    this.formModalMode = 'edit';
    this.editingDiscount = discount;
    this.isFormModalOpen = true;
    this.cdr.markForCheck();
  }

  closeFormModal(): void {
    this.isFormModalOpen = false;
    this.cdr.markForCheck();
  }

  onDiscountSaved(discount: Discount): void {
    this.isFormModalOpen = false;
    const action = this.formModalMode === 'create' ? 'creado' : 'actualizado';
    this.showToast(`Descuento ${discount.code} ${action} correctamente.`);
    this.refreshSubject.next();
    this.cdr.markForCheck();
  }

  // ─── Toggle active ─────────────────────────────────────────────────────────

  onToggleActive(discount: Discount, event: Event): void {
    // Prevent the card tap from opening the edit modal.
    event.stopPropagation();

    const newValue = !discount.is_active;
    this.discountsService
      .toggleActive(discount.id, newValue)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          const label = updated.is_active ? 'activado' : 'desactivado';
          this.showToast(`Descuento ${updated.code} ${label}.`);
          this.refreshSubject.next();
        },
        error: (err) => {
          const msg = err?.message ?? 'No se pudo cambiar el estado del descuento.';
          this.showToast(msg);
        }
      });
  }

  onRetry(): void {
    this.refreshSubject.next();
  }

  // ─── Display helpers ───────────────────────────────────────────────────────

  formatDiscountValue(discount: Discount): string {
    return formatDiscountValue(discount);
  }

  typeLabel(type: DiscountType): string {
    return DISCOUNT_TYPE_LABELS[type];
  }

  trackByDiscountId(_index: number, d: Discount): string {
    return d.id;
  }

  trackByValue(_index: number, item: { value: string }): string {
    return item.value;
  }

  // ─── Toast ────────────────────────────────────────────────────────────────

  private showToast(message: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastMessage = message;
    this.cdr.markForCheck();
    this.toastTimer = setTimeout(() => {
      this.toastMessage = null;
      this.cdr.markForCheck();
    }, 3500);
  }
}
