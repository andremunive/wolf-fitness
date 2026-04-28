import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { BehaviorSubject, combineLatest, of, Subject } from 'rxjs';
import { catchError, switchMap, takeUntil } from 'rxjs/operators';

import {
  buildPeriodRange,
  ExpenseCategoryViewModel,
  ExpenseRecordViewModel,
  ExpenseSummaryByCategory,
  MONTH_NAMES_ES,
  MonthYear,
  PERIOD_FILTERS,
  PeriodFilter,
  PeriodFilterKey
} from '../../models/expense-record.model';
import { ExpenseCategoriesService } from '../../services/expense-categories.service';
import { ExpenseRecordsPage, ExpenseRecordsService } from '../../services/expense-records.service';

@Component({
  selector: 'app-expense-records-list-page',
  templateUrl: './expense-records-list-page.component.html',
  styleUrls: ['./expense-records-list-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseRecordsListPageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  // Navigation state
  private readonly monthSubject = new BehaviorSubject<MonthYear>(this.currentMonthYear());
  private readonly pageSubject = new BehaviorSubject<number>(1);
  private readonly categoryFilterSubject = new BehaviorSubject<string | null>(null);
  private readonly periodSubject = new BehaviorSubject<PeriodFilterKey>(1);
  private readonly refreshSubject = new BehaviorSubject<void>(undefined);

  // Modal state
  isNewRecordModalOpen = false;
  detailRecord: ExpenseRecordViewModel | null = null;
  editingRecord: ExpenseRecordViewModel | null = null;
  isManageCategoriesOpen = false;

  // Categories for filter dropdown (loaded once)
  activeCategories: ExpenseCategoryViewModel[] = [];

  // View state (records + chart driven by reactive streams)
  recordsState: { isLoading: boolean; error: string | null; records: ExpenseRecordViewModel[]; total: number } = {
    isLoading: true, error: null, records: [], total: 0
  };
  chartState: { isLoading: boolean; error: string | null; data: ExpenseSummaryByCategory[]; totalCop: number; recordCount: number } = {
    isLoading: true, error: null, data: [], totalCop: 0, recordCount: 0
  };

  readonly periodFilters: PeriodFilter[] = PERIOD_FILTERS;

  constructor(
    private readonly recordsService: ExpenseRecordsService,
    private readonly categoriesService: ExpenseCategoriesService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadCategories();
    this.wireRecords();
    this.wireChart();
  }

  private loadCategories(): void {
    this.categoriesService.listActive().pipe(takeUntil(this.destroy$)).subscribe({
      next: (categories) => {
        this.activeCategories = categories;
        this.cdr.markForCheck();
      },
      error: () => {}
    });
  }

  private wireRecords(): void {
    combineLatest([
      this.monthSubject.asObservable(),
      this.pageSubject.asObservable(),
      this.categoryFilterSubject.asObservable(),
      this.refreshSubject.asObservable()
    ]).pipe(
      switchMap(([month, page, categoryId]) => {
        this.recordsState = { ...this.recordsState, isLoading: true, error: null };
        this.cdr.markForCheck();
        return this.recordsService
          .listByMonth(month.year, month.month, page, categoryId)
          .pipe(
            catchError(() => of({ items: [], total: 0 } as ExpenseRecordsPage))
          );
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (page) => {
        this.recordsState = {
          isLoading: false,
          error: null,
          records: page.items,
          total: page.total
        };
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.recordsState = {
          isLoading: false,
          error: 'Error al cargar los registros.',
          records: [],
          total: 0
        };
        this.cdr.markForCheck();
      }
    });
  }

  private wireChart(): void {
    combineLatest([
      this.periodSubject.asObservable(),
      this.refreshSubject.asObservable()
    ]).pipe(
      switchMap(([periodKey]) => {
        this.chartState = { ...this.chartState, isLoading: true, error: null };
        this.cdr.markForCheck();
        const { start, end } = buildPeriodRange(periodKey);
        return this.recordsService
          .getSummaryByCategory(start, end)
          .pipe(catchError(() => of([] as ExpenseSummaryByCategory[])));
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (data) => {
        const totalCop = data.reduce((acc, d) => acc + d.total_cop, 0);
        const recordCount = data.reduce((acc, d) => acc + d.record_count, 0);
        this.chartState = { isLoading: false, error: null, data, totalCop, recordCount };
        this.cdr.markForCheck();
      },
      error: () => {
        this.chartState = { isLoading: false, error: 'Error al cargar el resumen.', data: [], totalCop: 0, recordCount: 0 };
        this.cdr.markForCheck();
      }
    });
  }

  // ─── Getters ───────────────────────────────────────────────────────────────

  get currentMonth(): MonthYear {
    return this.monthSubject.value;
  }

  get currentMonthLabel(): string {
    const { year, month } = this.currentMonth;
    return `${MONTH_NAMES_ES[month - 1]} ${year}`;
  }

  get isNextMonthBlocked(): boolean {
    const now = this.currentMonthYear();
    return (
      this.currentMonth.year === now.year &&
      this.currentMonth.month === now.month
    );
  }

  get currentPage(): number {
    return this.pageSubject.value;
  }

  get currentPeriod(): PeriodFilterKey {
    return this.periodSubject.value;
  }

  get selectedCategoryId(): string | null {
    return this.categoryFilterSubject.value;
  }

  get currentPeriodLabel(): string {
    const filter = PERIOD_FILTERS.find((f) => f.key === this.currentPeriod);
    return filter?.label ?? 'Último mes';
  }

  // ─── Month navigation ──────────────────────────────────────────────────────

  goToPreviousMonth(): void {
    const { year, month } = this.currentMonth;
    const isJanuary = month === 1;
    this.monthSubject.next({
      year: isJanuary ? year - 1 : year,
      month: isJanuary ? 12 : month - 1
    });
    this.pageSubject.next(1);
  }

  goToNextMonth(): void {
    if (this.isNextMonthBlocked) return;
    const { year, month } = this.currentMonth;
    const isDecember = month === 12;
    this.monthSubject.next({
      year: isDecember ? year + 1 : year,
      month: isDecember ? 1 : month + 1
    });
    this.pageSubject.next(1);
  }

  // ─── Records table ──────────────────────────────────────────────────────────

  onPageChange(page: number): void {
    this.pageSubject.next(page);
  }

  onCategoryFilterChange(categoryId: string | null): void {
    this.categoryFilterSubject.next(categoryId);
    this.pageSubject.next(1);
  }

  // ─── Chart ────────────────────────────────────────────────────────────────

  onPeriodChange(period: PeriodFilterKey): void {
    this.periodSubject.next(period);
  }

  // ─── New record modal ──────────────────────────────────────────────────────

  openNewRecordModal(): void {
    this.isNewRecordModalOpen = true;
    this.cdr.markForCheck();
  }

  closeNewRecordModal(): void {
    this.isNewRecordModalOpen = false;
    this.cdr.markForCheck();
  }

  onRecordCreated(): void {
    this.isNewRecordModalOpen = false;
    this.refreshSubject.next();
    this.loadCategories(); // Refresh category list in case a new one was created.
    this.cdr.markForCheck();
  }

  // ─── Detail record modal ───────────────────────────────────────────────────

  onDetailRequested(record: ExpenseRecordViewModel): void {
    this.detailRecord = record;
    this.cdr.markForCheck();
  }

  closeDetailModal(): void {
    this.detailRecord = null;
    this.cdr.markForCheck();
  }

  onEditFromDetail(record: ExpenseRecordViewModel): void {
    this.detailRecord = null;
    this.editingRecord = record;
    this.cdr.markForCheck();
  }

  // ─── Edit record modal ──────────────────────────────────────────────────────

  onEditRequested(record: ExpenseRecordViewModel): void {
    this.editingRecord = record;
    this.cdr.markForCheck();
  }

  closeEditModal(): void {
    this.editingRecord = null;
    this.cdr.markForCheck();
  }

  onRecordUpdated(): void {
    this.editingRecord = null;
    this.refreshSubject.next();
    this.cdr.markForCheck();
  }

  onRecordAnnulled(): void {
    this.editingRecord = null;
    this.refreshSubject.next();
    this.cdr.markForCheck();
  }

  // ─── Manage categories modal ───────────────────────────────────────────────

  openManageCategories(): void {
    this.isManageCategoriesOpen = true;
    this.cdr.markForCheck();
  }

  closeManageCategories(): void {
    this.isManageCategoriesOpen = false;
    this.loadCategories(); // Refresh in case categories changed.
    this.cdr.markForCheck();
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  trackByRecordId(_index: number, record: ExpenseRecordViewModel): string {
    return record.id;
  }

  private currentMonthYear(): MonthYear {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
