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

import { Trainer, TrainersPage } from '../../models/trainer.model';
import { TrainersService } from '../../services/trainers.service';
import { TrainersPaginationState } from '../../components/trainers-pagination/trainers-pagination.component';
import { TrainerFiltersValue } from '../../components/trainers-filters/trainers-filters.component';
import { CreateTrainerResult, TrainerDetailFull } from '../../models/trainer.model';

interface PageState {
  page: number;
  pageSize: number;
}

interface ViewState {
  trainers: Trainer[];
  total: number;
  loading: boolean;
  error: boolean;
  paginationState: TrainersPaginationState;
}

const LOADING_STATE: ViewState = {
  trainers: [],
  total: 0,
  loading: true,
  error: false,
  paginationState: { page: 1, pageSize: 10, total: 0 }
};

@Component({
  selector: 'app-trainers-list-page',
  templateUrl: './trainers-list-page.component.html',
  styleUrls: ['./trainers-list-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TrainersListPageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly searchControl = new FormControl<string>('');

  private readonly filtersSubject = new BehaviorSubject<TrainerFiltersValue>({
    activeFilter: 'active'
  });

  private readonly pageSubject = new BehaviorSubject<PageState>({
    page: 1,
    pageSize: 10
  });

  // Trigger para refrescar la lista después de crear/editar/cambiar estado.
  private readonly refreshTrigger$ = new BehaviorSubject<void>(undefined);

  readonly filters$ = this.filtersSubject.asObservable();

  // ─── Modales ────────────────────────────────────────────────────────────────

  isWizardOpen = false;
  wizardResult: CreateTrainerResult | null = null;

  editingTrainer: TrainerDetailFull | null = null;
  isLoadingEditTrainer = false;

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

      const result$: Observable<ViewState> = this.trainersService
        .getTrainers({
          search,
          activeFilter: filters.activeFilter,
          page: pageState.page,
          pageSize: pageState.pageSize
        })
        .pipe(
          map(
            (result: TrainersPage): ViewState => ({
              trainers: result.items,
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
                trainers: [],
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
    private readonly trainersService: TrainersService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Resetea a página 1 cuando cambia el término de búsqueda o los filtros.
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

  onFiltersChange(filters: TrainerFiltersValue): void {
    this.filtersSubject.next(filters);
  }

  get currentFilters(): TrainerFiltersValue {
    return this.filtersSubject.value;
  }

  // ─── Paginación ─────────────────────────────────────────────────────────────

  onPageChange(page: number): void {
    this.pageSubject.next({ ...this.pageSubject.value, page });
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSubject.next({ page: 1, pageSize });
  }

  // ─── Wizard nuevo trainer ───────────────────────────────────────────────────

  openWizard(): void {
    this.isWizardOpen = true;
    this.cdr.markForCheck();
  }

  closeWizard(): void {
    this.isWizardOpen = false;
    this.cdr.markForCheck();
  }

  onTrainerCreated(result: CreateTrainerResult): void {
    this.isWizardOpen = false;
    this.wizardResult = result;
    this.refreshTrigger$.next();
    this.cdr.markForCheck();
  }

  dismissSuccessModal(): void {
    this.wizardResult = null;
    this.cdr.markForCheck();
  }

  // ─── Editar trainer ─────────────────────────────────────────────────────────

  onEditRequested(trainer: Trainer): void {
    this.isLoadingEditTrainer = true;
    this.cdr.markForCheck();

    this.trainersService
      .getTrainerById(trainer.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (full) => {
          this.editingTrainer = full;
          this.isLoadingEditTrainer = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingEditTrainer = false;
          this.cdr.markForCheck();
        }
      });
  }

  closeEditModal(): void {
    this.editingTrainer = null;
    this.cdr.markForCheck();
  }

  onTrainerUpdated(): void {
    this.refreshTrigger$.next();
  }

  // ─── Activar / Desactivar ───────────────────────────────────────────────────

  onToggleActiveRequested(event: { trainer: Trainer; isActive: boolean }): void {
    this.trainersService
      .setTrainerActive(event.trainer.id, event.isActive)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.refreshTrigger$.next();
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('[TrainersListPage] Error al cambiar estado:', err);
          this.cdr.markForCheck();
        }
      });
  }

  // ─── Utilidades ─────────────────────────────────────────────────────────────

  trackByTrainerId(_index: number, trainer: Trainer): string {
    return trainer.id;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
