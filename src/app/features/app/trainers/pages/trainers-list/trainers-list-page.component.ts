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
  finalize,
  map,
  shareReplay,
  startWith,
  switchMap,
  takeUntil
} from 'rxjs/operators';

import { LoaderService } from 'src/app/core/services/loader.service';
import { Trainer, TrainersPage } from '../../models/trainer.model';
import { TrainersService } from '../../services/trainers.service';
import { TrainersPaginationState } from '../../components/trainers-pagination/trainers-pagination.component';
import { TrainerFiltersValue } from '../../components/trainers-filters/trainers-filters.component';
import {
  CreateTrainerResult,
  ResetTrainerPasswordResult,
  TrainerDetailFull
} from '../../models/trainer.model';
import { TrainerCreatedModalMode } from '../../components/trainer-created-modal/trainer-created-modal.component';

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
  wizardResult: CreateTrainerResult | ResetTrainerPasswordResult | null = null;
  wizardResultMode: TrainerCreatedModalMode = 'created';

  editingTrainer: TrainerDetailFull | null = null;
  isLoadingEditTrainer = false;
  isResettingPassword = false;

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
    private readonly cdr: ChangeDetectorRef,
    private readonly loader: LoaderService
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
    this.wizardResultMode = 'created';
    this.refreshTrigger$.next();
    this.cdr.markForCheck();
  }

  dismissSuccessModal(): void {
    this.wizardResult = null;
    this.wizardResultMode = 'created';
    this.cdr.markForCheck();
  }

  // ─── Editar trainer ─────────────────────────────────────────────────────────

  onEditRequested(trainer: Trainer): void {
    this.isLoadingEditTrainer = true;
    this.loader.show();
    this.cdr.markForCheck();

    this.trainersService
      .getTrainerById(trainer.id)
      .pipe(
        finalize(() => {
          this.isLoadingEditTrainer = false;
          this.loader.hide();
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (full) => {
          this.editingTrainer = full;
        },
        error: () => {}
      });
  }

  closeEditModal(): void {
    this.editingTrainer = null;
    this.cdr.markForCheck();
  }

  onTrainerUpdated(): void {
    this.refreshTrigger$.next();
  }

  // ─── Restablecer contraseña ─────────────────────────────────────────────────

  onResetPasswordRequested(trainer: Trainer): void {
    if (this.isResettingPassword) return;
    this.isResettingPassword = true;
    this.loader.show();
    this.cdr.markForCheck();

    this.trainersService
      .resetTrainerPassword(trainer.id)
      .pipe(
        finalize(() => {
          this.isResettingPassword = false;
          this.loader.hide();
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.wizardResult = result;
          this.wizardResultMode = 'reset';
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('[TrainersListPage] Error al restablecer contraseña:', err);
          window.alert(
            `No se pudo restablecer la contraseña de ${trainer.fullName}. ` +
              `Intenta nuevamente; si el problema persiste, contacta a soporte.`
          );
        }
      });
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

  retry(): void {
    this.refreshTrigger$.next();
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
