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

import { Client, ClientDetailFull, ClientsPage } from '../../models/client.model';
import { ClientsService } from '../../services/clients.service';
import { ClientFiltersValue } from '../../components/clients-filters/clients-filters.component';
import { PaginationState } from '../../components/clients-pagination/clients-pagination.component';
import { CreateClientResult } from '../../models/client.model';

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

  // Dispara refresh después de crear/editar/desactivar.
  private readonly refreshTrigger$ = new BehaviorSubject<void>(undefined);

  readonly filters$ = this.filtersSubject.asObservable();

  // ─── Modales ────────────────────────────────────────────────────────────────

  isWizardOpen = false;
  wizardResult: CreateClientResult | null = null;

  editingClient: ClientDetailFull | null = null;
  isLoadingEditClient = false;

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
    private readonly cdr: ChangeDetectorRef
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
    this.cdr.markForCheck();

    this.clientsService
      .getClientById(client.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (full) => {
          this.editingClient = full;
          this.isLoadingEditClient = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingEditClient = false;
          this.cdr.markForCheck();
        }
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

  // ─── Utilidades ─────────────────────────────────────────────────────────────

  trackByClientId(_index: number, client: Client): string {
    return client.id;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
