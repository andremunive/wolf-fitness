import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
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

import { Client, ClientsPage, TrainerOption } from '../../models/client.model';
import { ClientsMockService } from '../../services/clients-mock.service';
import { ClientFiltersValue } from '../../components/clients-filters/clients-filters.component';
import { PaginationState } from '../../components/clients-pagination/clients-pagination.component';

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
    trainerId: 'all',
    status: 'all',
    plan: 'all'
  });

  private readonly pageSubject = new BehaviorSubject<PageState>({
    page: 1,
    pageSize: 10
  });

  readonly filters$ = this.filtersSubject.asObservable();

  isNewClientModalOpen = false;

  readonly trainers$: Observable<TrainerOption[]> = this.clientsService
    .getTrainers()
    .pipe(shareReplay(1));

  /**
   * Stream principal de la vista. Combina search + filtros + paginación,
   * dispara la query al servicio mock y emite un estado cargando mientras
   * espera la respuesta.
   */
  readonly viewState$: Observable<ViewState> = combineLatest([
    this.searchControl.valueChanges.pipe(
      startWith(''),
      map((v): string => v ?? ''),
      debounceTime(300),
      distinctUntilChanged()
    ),
    this.filtersSubject,
    this.pageSubject
  ]).pipe(
    switchMap(([search, filters, pageState]) => {
      const loadingState: ViewState = {
        ...LOADING_STATE,
        paginationState: { page: pageState.page, pageSize: pageState.pageSize, total: 0 }
      };

      const result$: Observable<ViewState> = this.clientsService
        .getClients({
          search,
          trainerId: filters.trainerId,
          status: filters.status,
          plan: filters.plan,
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
                paginationState: { page: pageState.page, pageSize: pageState.pageSize, total: 0 }
              })
          )
        );

      return result$.pipe(startWith(loadingState));
    }),
    shareReplay(1)
  );

  constructor(private readonly clientsService: ClientsMockService) {}

  ngOnInit(): void {
    // Resetea a página 1 cuando cambian los criterios de búsqueda o filtros.
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

  onFiltersChange(filters: ClientFiltersValue): void {
    this.filtersSubject.next(filters);
  }

  onFiltersClear(): void {
    this.filtersSubject.next({ trainerId: 'all', status: 'all', plan: 'all' });
  }

  onPageChange(page: number): void {
    this.pageSubject.next({ ...this.pageSubject.value, page });
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSubject.next({ page: 1, pageSize });
  }

  openNewClientModal(): void {
    this.isNewClientModalOpen = true;
  }

  closeNewClientModal(): void {
    this.isNewClientModalOpen = false;
  }

  get currentFilters(): ClientFiltersValue {
    return this.filtersSubject.value;
  }

  get hasActiveFilters(): boolean {
    const f = this.filtersSubject.value;
    return f.trainerId !== 'all' || f.status !== 'all' || f.plan !== 'all';
  }

  trackByClientId(_index: number, client: Client): string {
    return client.id;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
