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
  map,
  shareReplay,
  startWith,
  switchMap,
  takeUntil
} from 'rxjs/operators';

import { ServiceProvidersService } from '../../services/service-providers.service';
import { ServiceTypesService } from '../../services/service-types.service';
import {
  ServiceProviderViewModel,
  ServiceProvidersPage,
  ServiceTypeViewModel
} from '../../models/service-provider.model';
import { ServiceProviderFiltersValue } from '../../components/service-providers-filters/service-providers-filters.component';
import { ServiceProvidersPaginationState } from '../../components/service-providers-pagination/service-providers-pagination.component';
import { ServiceProviderCreatedEvent } from '../../components/new-service-provider-wizard/new-service-provider-wizard.component';

interface PageState {
  page: number;
  pageSize: number;
}

interface ViewState {
  providers: ServiceProviderViewModel[];
  total: number;
  loading: boolean;
  error: boolean;
  paginationState: ServiceProvidersPaginationState;
}

const DEFAULT_LOADING_STATE: ViewState = {
  providers: [],
  total: 0,
  loading: true,
  error: false,
  paginationState: { page: 1, pageSize: 10, total: 0 }
};

@Component({
  selector: 'app-service-providers-list-page',
  templateUrl: './service-providers-list-page.component.html',
  styleUrls: ['./service-providers-list-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceProvidersListPageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly searchControl = new FormControl<string>('');

  private readonly filtersSubject = new BehaviorSubject<ServiceProviderFiltersValue>({
    entityType: 'all',
    serviceTypeId: null,
    includeDeleted: false
  });

  private readonly pageSubject = new BehaviorSubject<PageState>({ page: 1, pageSize: 10 });
  private readonly refreshTrigger$ = new BehaviorSubject<void>(undefined);

  readonly filters$ = this.filtersSubject.asObservable();

  // Active service types for the filter dropdown
  serviceTypes: ServiceTypeViewModel[] = [];

  // ─── Modal state ──────────────────────────────────────────────────────────────
  isWizardOpen = false;
  createdProvider: ServiceProviderViewModel | null = null;
  editingProvider: ServiceProviderViewModel | null = null;
  bankAccountsProvider: ServiceProviderViewModel | null = null;
  isServiceTypesModalOpen = false;
  isLoadingProvider = false;

  // ─── Main view stream ─────────────────────────────────────────────────────────

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
        ...DEFAULT_LOADING_STATE,
        paginationState: { page: pageState.page, pageSize: pageState.pageSize, total: 0 }
      };

      const result$: Observable<ViewState> = this.serviceProvidersService
        .list({
          search,
          entityType: filters.entityType,
          serviceTypeId: filters.serviceTypeId,
          includeDeleted: filters.includeDeleted,
          page: pageState.page,
          pageSize: pageState.pageSize
        })
        .pipe(
          map((result: ServiceProvidersPage): ViewState => ({
            providers: result.items,
            total: result.total,
            loading: false,
            error: false,
            paginationState: {
              page: pageState.page,
              pageSize: pageState.pageSize,
              total: result.total
            }
          })),
          catchError((): Observable<ViewState> =>
            of({
              providers: [],
              total: 0,
              loading: false,
              error: true,
              paginationState: { page: pageState.page, pageSize: pageState.pageSize, total: 0 }
            })
          )
        );

      return result$.pipe(startWith(loadingState));
    }),
    shareReplay(1)
  );

  constructor(
    private readonly serviceProvidersService: ServiceProvidersService,
    private readonly serviceTypesService: ServiceTypesService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Reset to page 1 when search or filters change.
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

    // Load service types for the filter dropdown once.
    this.serviceTypesService
      .listActive()
      .pipe(takeUntil(this.destroy$))
      .subscribe((types) => {
        this.serviceTypes = types;
        this.cdr.markForCheck();
      });
  }

  // ─── Search & filters ─────────────────────────────────────────────────────────

  onSearchChange(search: string): void {
    this.searchControl.setValue(search);
  }

  onFiltersChange(filters: ServiceProviderFiltersValue): void {
    this.filtersSubject.next(filters);
  }

  get currentFilters(): ServiceProviderFiltersValue {
    return this.filtersSubject.value;
  }

  // ─── Pagination ───────────────────────────────────────────────────────────────

  onPageChange(page: number): void {
    this.pageSubject.next({ ...this.pageSubject.value, page });
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSubject.next({ page: 1, pageSize });
  }

  // ─── Wizard nuevo proveedor ───────────────────────────────────────────────────

  openWizard(): void {
    this.isWizardOpen = true;
    this.cdr.markForCheck();
  }

  closeWizard(): void {
    this.isWizardOpen = false;
    this.cdr.markForCheck();
  }

  onProviderCreated(event: ServiceProviderCreatedEvent): void {
    this.isWizardOpen = false;
    this.createdProvider = event.provider;
    this.refreshTrigger$.next();
    this.cdr.markForCheck();
  }

  dismissCreatedModal(): void {
    this.createdProvider = null;
    this.cdr.markForCheck();
  }

  // ─── Editar proveedor ─────────────────────────────────────────────────────────

  onEditRequested(provider: ServiceProviderViewModel): void {
    this.isLoadingProvider = true;
    this.cdr.markForCheck();

    this.serviceProvidersService
      .getById(provider.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (full) => {
          this.editingProvider = full;
          this.isLoadingProvider = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingProvider = false;
          this.cdr.markForCheck();
        }
      });
  }

  closeEditModal(): void {
    this.editingProvider = null;
    this.cdr.markForCheck();
  }

  onProviderUpdated(): void {
    this.refreshTrigger$.next();
  }

  // ─── Cuentas bancarias ────────────────────────────────────────────────────────

  onManageBankAccountsRequested(provider: ServiceProviderViewModel): void {
    this.bankAccountsProvider = provider;
    this.cdr.markForCheck();
  }

  closeBankAccountsModal(): void {
    this.bankAccountsProvider = null;
    this.cdr.markForCheck();
  }

  onBankAccountsUpdated(): void {
    // Re-fetch the provider to update the local reference shown in the modal
    // and also trigger a list refresh so the primary bank shows correctly in cards.
    if (this.bankAccountsProvider) {
      this.serviceProvidersService
        .getById(this.bankAccountsProvider.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (updated) => {
            this.bankAccountsProvider = updated;
            this.refreshTrigger$.next();
            this.cdr.markForCheck();
          },
          error: () => {
            this.refreshTrigger$.next();
            this.cdr.markForCheck();
          }
        });
    }
  }

  // ─── Soft-delete / Restore ────────────────────────────────────────────────────

  onSoftDeleteRequested(provider: ServiceProviderViewModel): void {
    this.serviceProvidersService
      .softDelete(provider.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.refreshTrigger$.next();
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('[ServiceProvidersListPage] softDelete error:', err);
          this.cdr.markForCheck();
        }
      });
  }

  onRestoreRequested(provider: ServiceProviderViewModel): void {
    this.serviceProvidersService
      .restore(provider.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.refreshTrigger$.next();
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('[ServiceProvidersListPage] restore error:', err);
          this.cdr.markForCheck();
        }
      });
  }

  // ─── Service types modal ──────────────────────────────────────────────────────

  openServiceTypesModal(): void {
    this.isServiceTypesModalOpen = true;
    this.cdr.markForCheck();
  }

  closeServiceTypesModal(): void {
    this.isServiceTypesModalOpen = false;
    // Reload service types in case new ones were added.
    this.serviceTypesService
      .listActive()
      .pipe(takeUntil(this.destroy$))
      .subscribe((types) => {
        this.serviceTypes = types;
        this.cdr.markForCheck();
      });
  }

  retry(): void {
    this.refreshTrigger$.next();
  }

  trackByProviderId(_index: number, provider: ServiceProviderViewModel): string {
    return provider.id;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
