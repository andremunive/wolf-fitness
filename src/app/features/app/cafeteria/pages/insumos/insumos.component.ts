import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { BehaviorSubject, Subject } from 'rxjs';
import {
  catchError,
  finalize,
  of,
  startWith,
  switchMap,
  takeUntil
} from 'rxjs';

import { ToastService } from 'src/app/shared/services/toast.service';
import { CafeteriaInsumosService } from '../../services/cafeteria-insumos.service';
import {
  CafeteriaExpenseCategory,
  CafeteriaExpenseWithDetails
} from '../../models/cafeteria.model';

export type InsumosModal =
  | 'new'
  | 'edit'
  | 'detail'
  | 'void'
  | 'manage-categories'
  | null;

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface InsumosState {
  loading: boolean;
  error: string | null;
  expenses: CafeteriaExpenseWithDetails[];
}

const LOADING_STATE: InsumosState = { loading: true, error: null, expenses: [] };

function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-cafeteria-insumos',
  templateUrl: './insumos.component.html',
  styleUrls: ['./insumos.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InsumosComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly refresh$ = new BehaviorSubject<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1
  });

  // ─── Month navigation ─────────────────────────────────────────────────────────

  currentYear = new Date().getFullYear();
  currentMonth = new Date().getMonth() + 1;

  // ─── Data state ───────────────────────────────────────────────────────────────

  readonly expensesState$ = this.refresh$.pipe(
    switchMap(({ year, month }) =>
      this.insumosService.getExpenses(year, month).pipe(
        switchMap((expenses) => of({ loading: false, error: null, expenses } as InsumosState)),
        catchError((err) => {
          const msg: string = err?.message ?? 'Error al cargar los insumos.';
          return of({ loading: false, error: msg, expenses: [] } as InsumosState);
        }),
        startWith(LOADING_STATE)
      )
    )
  );

  // ─── Category filter (local) ──────────────────────────────────────────────────

  selectedCategoryFilter: string | null = null;

  // ─── Modal state ──────────────────────────────────────────────────────────────

  activeModal: InsumosModal = null;
  selectedExpense: CafeteriaExpenseWithDetails | null = null;

  // ─── Active categories (for autocomplete in create/edit forms) ────────────────

  activeCategories: CafeteriaExpenseCategory[] = [];
  isLoadingCategories = false;

  // ─── All categories (for manage modal) ───────────────────────────────────────

  allCategories: CafeteriaExpenseCategory[] = [];
  isLoadingAllCategories = false;

  // ─── New/edit form ────────────────────────────────────────────────────────────

  readonly today = localDateString(new Date());

  expenseForm = new FormGroup({
    expense_date: new FormControl(this.today, [Validators.required]),
    category_id: new FormControl('', [Validators.required]),
    amount_cop: new FormControl<number | null>(null, [Validators.required, Validators.min(1)]),
    payment_method: new FormControl('', [Validators.required]),
    supplier: new FormControl('', [Validators.maxLength(100)]),
    notes: new FormControl('', [Validators.maxLength(300)])
  });

  amountDisplay = '';
  categoryInvalid = false;

  // Category autocomplete state
  categoryQuery = '';
  showCategoryDropdown = false;
  selectedCategoryObj: CafeteriaExpenseCategory | null = null;

  // Inline new category mini-modal (inside new/edit expense modal)
  showNewCategoryInline = false;
  newCategoryForm = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.maxLength(80)]),
    description: new FormControl('', [Validators.maxLength(200)])
  });
  isSavingCategory = false;
  newCategoryError: string | null = null;

  // ─── Manage categories: new category inline ───────────────────────────────────

  showManageNewCategory = false;
  manageCategoryForm = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.maxLength(80)]),
    description: new FormControl('', [Validators.maxLength(200)])
  });
  isSavingManageCategory = false;
  manageCategoryError: string | null = null;

  // ─── Toggle state per category (manage modal) ─────────────────────────────────

  togglingCategoryId: string | null = null;

  // ─── Save/void flags ──────────────────────────────────────────────────────────

  isSaving = false;
  isVoiding = false;
  saveError: string | null = null;

  readonly skeletonRows = [1, 2, 3, 4, 5];

  constructor(
    private readonly insumosService: CafeteriaInsumosService,
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
    this.selectedCategoryFilter = null;
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
    this.selectedCategoryFilter = null;
    this.refresh$.next({ year: this.currentYear, month: this.currentMonth });
    this.cdr.markForCheck();
  }

  // ─── Summary helpers ──────────────────────────────────────────────────────────

  totalAmount(expenses: CafeteriaExpenseWithDetails[]): number {
    return expenses.reduce((acc, e) => acc + (e.amount_cop ?? 0), 0);
  }

  // ─── Category filter ──────────────────────────────────────────────────────────

  getCategoriesInMonth(expenses: CafeteriaExpenseWithDetails[]): Array<{ id: string; name: string }> {
    const seen = new Map<string, string>();
    for (const e of expenses) {
      if (e.category_id && e.category?.name && !seen.has(e.category_id)) {
        seen.set(e.category_id, e.category.name);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  filterExpenses(expenses: CafeteriaExpenseWithDetails[]): CafeteriaExpenseWithDetails[] {
    if (!this.selectedCategoryFilter) return expenses;
    return expenses.filter((e) => e.category_id === this.selectedCategoryFilter);
  }

  onCategoryFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedCategoryFilter = value || null;
    this.cdr.markForCheck();
  }

  // ─── Date formatting helpers ──────────────────────────────────────────────────

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

  hasDateMismatch(expense: CafeteriaExpenseWithDetails): boolean {
    if (!expense.reported_date || !expense.expense_date) return false;
    return expense.expense_date !== expense.reported_date;
  }

  // ─── Payment method helpers ───────────────────────────────────────────────────

  getPaymentMethodLabel(method: string | null): string {
    const map: Record<string, string> = {
      cash: 'Efectivo',
      transfer: 'Transferencia',
      nequi: 'Nequi',
      other: 'Otro'
    };
    return method ? (map[method] ?? method) : '—';
  }

  getPaymentMethodIcon(method: string | null): string {
    const map: Record<string, string> = {
      cash: '💵',
      transfer: '🏦',
      nequi: '📱',
      other: '🔹'
    };
    return method ? (map[method] ?? '') : '';
  }

  // ─── Deterministic category color ────────────────────────────────────────────

  getCategoryColor(categoryId: string): { bg: string; border: string } {
    const BG = [
      '#fef3c7', '#dbeafe', '#fce7f3', '#d1fae5',
      '#e0e7ff', '#fee2e2', '#fef9c3', '#cffafe'
    ];
    const BORDER = [
      '#f59e0b', '#3b82f6', '#ec4899', '#10b981',
      '#6366f1', '#ef4444', '#eab308', '#06b6d4'
    ];
    let hash = 0;
    for (let i = 0; i < categoryId.length; i++) {
      hash = (hash * 31 + categoryId.charCodeAt(i)) & 0xffffffff;
    }
    const index = Math.abs(hash) % BG.length;
    return { bg: BG[index], border: BORDER[index] };
  }

  // ─── Format COP ──────────────────────────────────────────────────────────────

  formatCop(amount: number | null | undefined): string {
    if (amount === null || amount === undefined) return '—';
    return '$' + amount.toLocaleString('es-CO');
  }

  // ─── Modal: New expense ───────────────────────────────────────────────────────

  openNewModal(): void {
    this.expenseForm.reset({
      expense_date: this.today,
      category_id: '',
      amount_cop: null,
      payment_method: '',
      supplier: '',
      notes: ''
    });
    this.amountDisplay = '';
    this.categoryQuery = '';
    this.selectedCategoryObj = null;
    this.categoryInvalid = false;
    this.showCategoryDropdown = false;
    this.showNewCategoryInline = false;
    this.newCategoryError = null;
    this.saveError = null;
    this.activeModal = 'new';
    this.cdr.markForCheck();
    this.loadActiveCategories();
  }

  // ─── Modal: Edit expense ──────────────────────────────────────────────────────

  openEditModal(expense: CafeteriaExpenseWithDetails): void {
    this.selectedExpense = expense;
    this.expenseForm.reset({
      expense_date: expense.expense_date,
      category_id: expense.category_id,
      amount_cop: expense.amount_cop,
      payment_method: expense.payment_method ?? '',
      supplier: expense.supplier ?? '',
      notes: expense.notes ?? ''
    });
    this.amountDisplay = expense.amount_cop
      ? new Intl.NumberFormat('es-CO').format(expense.amount_cop)
      : '';
    const cat = expense.category;
    this.categoryQuery = cat?.name ?? '';
    this.selectedCategoryObj = cat
      ? ({ id: expense.category_id, name: cat.name, is_active: true } as CafeteriaExpenseCategory)
      : null;
    this.categoryInvalid = false;
    this.showCategoryDropdown = false;
    this.showNewCategoryInline = false;
    this.newCategoryError = null;
    this.saveError = null;
    this.activeModal = 'edit';
    this.cdr.markForCheck();
    this.loadActiveCategories();
  }

  // ─── Modal: Detail ────────────────────────────────────────────────────────────

  openDetailModal(expense: CafeteriaExpenseWithDetails): void {
    this.selectedExpense = expense;
    this.activeModal = 'detail';
    this.cdr.markForCheck();
  }

  openEditFromDetail(): void {
    const expense = this.selectedExpense;
    if (!expense) return;
    this.activeModal = null;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.openEditModal(expense);
    }, 30);
  }

  // ─── Modal: Void ─────────────────────────────────────────────────────────────

  openVoidModal(expense: CafeteriaExpenseWithDetails): void {
    this.selectedExpense = expense;
    this.activeModal = 'void';
    this.cdr.markForCheck();
  }

  // ─── Modal: Manage categories ─────────────────────────────────────────────────

  openManageCategories(): void {
    this.showManageNewCategory = false;
    this.manageCategoryError = null;
    this.manageCategoryForm.reset({ name: '', description: '' });
    this.activeModal = 'manage-categories';
    this.cdr.markForCheck();
    this.loadAllCategories();
  }

  closeModal(): void {
    this.activeModal = null;
    this.selectedExpense = null;
    this.cdr.markForCheck();
  }

  // ─── Category autocomplete ────────────────────────────────────────────────────

  get filteredCategories(): CafeteriaExpenseCategory[] {
    if (!this.categoryQuery.trim()) return this.activeCategories.slice(0, 8);
    const q = this.categoryQuery.toLowerCase();
    return this.activeCategories
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 8);
  }

  onCategoryQueryInput(event: Event): void {
    this.categoryQuery = (event.target as HTMLInputElement).value;
    this.selectedCategoryObj = null;
    this.expenseForm.get('category_id')?.setValue('');
    this.showCategoryDropdown = true;
    this.cdr.markForCheck();
  }

  selectCategory(cat: CafeteriaExpenseCategory): void {
    this.selectedCategoryObj = cat;
    this.categoryQuery = cat.name;
    this.expenseForm.get('category_id')?.setValue(cat.id);
    this.categoryInvalid = false;
    this.showCategoryDropdown = false;
    this.cdr.markForCheck();
  }

  openCategoryDropdown(): void {
    this.showCategoryDropdown = true;
    this.cdr.markForCheck();
  }

  onCategoryBlur(): void {
    setTimeout(() => {
      this.showCategoryDropdown = false;
      this.cdr.markForCheck();
    }, 150);
  }

  // ─── Inline new category (inside expense form) ────────────────────────────────

  openNewCategoryInline(): void {
    this.showNewCategoryInline = true;
    this.newCategoryForm.reset({ name: this.categoryQuery.trim(), description: '' });
    this.newCategoryError = null;
    this.showCategoryDropdown = false;
    this.cdr.markForCheck();
  }

  cancelNewCategoryInline(): void {
    this.showNewCategoryInline = false;
    this.newCategoryError = null;
    this.cdr.markForCheck();
  }

  saveNewCategoryInline(): void {
    this.newCategoryForm.markAllAsTouched();
    if (this.newCategoryForm.invalid || this.isSavingCategory) return;

    const name = (this.newCategoryForm.get('name')?.value ?? '').trim();
    const description = (this.newCategoryForm.get('description')?.value ?? '').trim() || undefined;

    this.isSavingCategory = true;
    this.newCategoryError = null;
    this.cdr.markForCheck();

    this.insumosService
      .createExpenseCategory({ name, description })
      .pipe(
        finalize(() => {
          this.isSavingCategory = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (created) => {
          this.activeCategories = [...this.activeCategories, created].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          this.selectCategory(created);
          this.showNewCategoryInline = false;
        },
        error: (err) => {
          this.newCategoryError = this.isUniqueViolation(err)
            ? 'Ya existe una categoría con ese nombre.'
            : this.extractErrorMessage(err);
        }
      });
  }

  // ─── Amount input ─────────────────────────────────────────────────────────────

  onAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const oldCursor = input.selectionStart ?? input.value.length;
    const digitsBeforeCursor = input.value.slice(0, oldCursor).replace(/\D/g, '').length;

    const digits = input.value.replace(/\D/g, '');
    const ctrl = this.expenseForm.get('amount_cop');

    if (!digits) {
      this.amountDisplay = '';
      input.value = '';
      ctrl?.setValue(null);
      this.cdr.markForCheck();
      return;
    }

    const num = parseInt(digits, 10);
    const formatted = new Intl.NumberFormat('es-CO').format(num);
    this.amountDisplay = formatted;
    input.value = formatted;
    ctrl?.setValue(num);

    let newCursor = 0;
    let counted = 0;
    while (counted < digitsBeforeCursor && newCursor < formatted.length) {
      if (/\d/.test(formatted[newCursor])) counted++;
      newCursor++;
    }
    input.setSelectionRange(newCursor, newCursor);
    this.cdr.markForCheck();
  }

  // ─── Save new expense ─────────────────────────────────────────────────────────

  submitExpense(): void {
    this.expenseForm.markAllAsTouched();
    this.categoryInvalid = !this.selectedCategoryObj;

    if (this.expenseForm.invalid || !this.selectedCategoryObj || this.isSaving) return;

    const { expense_date, amount_cop, payment_method, supplier, notes } = this.expenseForm.value;

    this.isSaving = true;
    this.saveError = null;
    this.cdr.markForCheck();

    this.insumosService
      .createExpense({
        expense_date: expense_date!,
        category_id: this.selectedCategoryObj.id,
        amount_cop: amount_cop!,
        payment_method: payment_method as 'cash' | 'transfer' | 'nequi' | 'other',
        supplier: supplier?.trim() || undefined,
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
          this.toastService.success('Insumo registrado correctamente.');
          this.refreshCurrentMonth();
        },
        error: (err) => {
          this.saveError = this.extractErrorMessage(err);
        }
      });
  }

  // ─── Save edited expense ──────────────────────────────────────────────────────

  submitEditExpense(): void {
    this.expenseForm.markAllAsTouched();
    this.categoryInvalid = !this.selectedCategoryObj;

    if (this.expenseForm.invalid || !this.selectedCategoryObj || !this.selectedExpense || this.isSaving) return;

    const { expense_date, amount_cop, payment_method, supplier, notes } = this.expenseForm.value;

    this.isSaving = true;
    this.saveError = null;
    this.cdr.markForCheck();

    this.insumosService
      .updateExpense(this.selectedExpense.id, {
        expense_date: expense_date!,
        category_id: this.selectedCategoryObj.id,
        amount_cop: amount_cop!,
        payment_method: payment_method as 'cash' | 'transfer' | 'nequi' | 'other',
        supplier: supplier?.trim() || null,
        notes: notes?.trim() || null
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
          this.selectedExpense = null;
          this.toastService.success('Insumo actualizado correctamente.');
          this.refreshCurrentMonth();
        },
        error: (err) => {
          this.saveError = this.extractErrorMessage(err);
        }
      });
  }

  // ─── Void expense ─────────────────────────────────────────────────────────────

  confirmVoid(): void {
    if (!this.selectedExpense || this.isVoiding) return;

    this.isVoiding = true;
    this.cdr.markForCheck();

    this.insumosService
      .voidExpense(this.selectedExpense.id)
      .pipe(
        finalize(() => {
          this.isVoiding = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.activeModal = null;
          this.selectedExpense = null;
          this.toastService.success('Insumo anulado.');
          this.refreshCurrentMonth();
        },
        error: (err) => {
          this.toastService.error(this.extractErrorMessage(err));
        }
      });
  }

  // ─── Manage categories: toggle ────────────────────────────────────────────────

  toggleCategory(category: CafeteriaExpenseCategory): void {
    if (this.togglingCategoryId) return;

    this.togglingCategoryId = category.id;
    this.cdr.markForCheck();

    this.insumosService
      .toggleExpenseCategory(category.id, !category.is_active)
      .pipe(
        finalize(() => {
          this.togglingCategoryId = null;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (updated) => {
          this.allCategories = this.allCategories.map((c) =>
            c.id === updated.id ? updated : c
          );
          const label = updated.is_active ? 'activada' : 'desactivada';
          this.toastService.success(`Categoría ${label}.`);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.toastService.error(this.extractErrorMessage(err));
        }
      });
  }

  // ─── Manage categories: new category ─────────────────────────────────────────

  openManageNewCategory(): void {
    this.showManageNewCategory = true;
    this.manageCategoryForm.reset({ name: '', description: '' });
    this.manageCategoryError = null;
    this.cdr.markForCheck();
  }

  cancelManageNewCategory(): void {
    this.showManageNewCategory = false;
    this.manageCategoryError = null;
    this.cdr.markForCheck();
  }

  saveManageNewCategory(): void {
    this.manageCategoryForm.markAllAsTouched();
    if (this.manageCategoryForm.invalid || this.isSavingManageCategory) return;

    const name = (this.manageCategoryForm.get('name')?.value ?? '').trim();
    const description = (this.manageCategoryForm.get('description')?.value ?? '').trim() || undefined;

    this.isSavingManageCategory = true;
    this.manageCategoryError = null;
    this.cdr.markForCheck();

    this.insumosService
      .createExpenseCategory({ name, description })
      .pipe(
        finalize(() => {
          this.isSavingManageCategory = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (created) => {
          this.allCategories = [...this.allCategories, created].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          this.showManageNewCategory = false;
          this.toastService.success('Categoría creada.');
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.manageCategoryError = this.isUniqueViolation(err)
            ? 'Ya existe una categoría con ese nombre.'
            : this.extractErrorMessage(err);
        }
      });
  }

  // ─── Track by functions ───────────────────────────────────────────────────────

  trackByExpenseId(_index: number, e: CafeteriaExpenseWithDetails): string {
    return e.id;
  }

  trackByCategoryId(_index: number, c: CafeteriaExpenseCategory): string {
    return c.id;
  }

  trackByFilterId(_index: number, c: { id: string; name: string }): string {
    return c.id;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private refreshCurrentMonth(): void {
    this.refresh$.next({ year: this.currentYear, month: this.currentMonth });
  }

  private loadActiveCategories(): void {
    if (this.activeCategories.length > 0) return;
    this.isLoadingCategories = true;
    this.cdr.markForCheck();

    this.insumosService
      .getExpenseCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (cats) => {
          this.activeCategories = cats;
          this.isLoadingCategories = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingCategories = false;
          this.cdr.markForCheck();
        }
      });
  }

  private loadAllCategories(): void {
    this.isLoadingAllCategories = true;
    this.cdr.markForCheck();

    this.insumosService
      .getAllExpenseCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (cats) => {
          this.allCategories = cats;
          this.isLoadingAllCategories = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingAllCategories = false;
          this.cdr.markForCheck();
        }
      });
  }

  private isUniqueViolation(err: unknown): boolean {
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      return e['code'] === '23505';
    }
    return false;
  }

  private extractErrorMessage(err: unknown): string {
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      if (typeof e['message'] === 'string') return e['message'];
    }
    return 'Ocurrió un error. Intenta de nuevo.';
  }
}
