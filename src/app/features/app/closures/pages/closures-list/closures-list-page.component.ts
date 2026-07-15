import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { BehaviorSubject, combineLatest, forkJoin, Observable, of, Subject } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, takeUntil } from 'rxjs/operators';

import { AuthService } from 'src/app/core/services/auth.service';
import { Profile } from 'src/app/core/types/supabase';
import { ClosuresService } from '../../services/closures.service';
import { ClosurePdfService } from '../../services/closure-pdf.service';
import {
  mapClosureErrorToMessage,
  MonthYear,
  StaffRole,
  TrainerClosureResult,
  ListTrainersClosuresResult,
  TrainerClosureSummary
} from '../../models/closure.model';
import { HistoryRow } from '../../components/closures-history-table/closures-history-table.component';

export interface CurrentMonthCard {
  trainerName: string;
  staffRole: StaffRole;
  q1: TrainerClosureResult;
  q2: TrainerClosureResult;
}

export interface PageViewState {
  loading: boolean;
  error: string;
  cards: CurrentMonthCard[];
  historyRows: HistoryRow[];
  trainerOptions: Array<{ id: string; name: string }>;
  nextBlocked: boolean;
}

const LOADING_STATE: PageViewState = {
  loading: true,
  error: '',
  cards: [],
  historyRows: [],
  trainerOptions: [],
  nextBlocked: false
};

@Component({
  selector: 'app-closures-list-page',
  templateUrl: './closures-list-page.component.html',
  styleUrls: ['./closures-list-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClosuresListPageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly monthSubject = new BehaviorSubject<MonthYear>(this.currentMonthYear());
  private readonly refreshSubject = new BehaviorSubject<void>(undefined);

  readonly viewState$: Observable<PageViewState>;

  selectedDetail: { closure: TrainerClosureResult; trainerName: string } | null = null;
  isAdmin = false;
  currentProfile: Profile | null = null;

  constructor(
    private readonly closuresService: ClosuresService,
    private readonly pdfService: ClosurePdfService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.viewState$ = combineLatest([
      this.auth.profile$,
      this.monthSubject.asObservable(),
      this.refreshSubject.asObservable()
    ]).pipe(
      switchMap(([profile, month]) => {
        if (!profile) return of(LOADING_STATE);
        this.isAdmin = profile.role === 'admin';
        this.currentProfile = profile;
        return this.loadMonth(profile, month).pipe(startWith(LOADING_STATE));
      }),
      shareReplay(1)
    );
  }

  ngOnInit(): void {
    // Pipe already wired — no manual subscriptions needed.
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get currentMonth(): MonthYear {
    return this.monthSubject.value;
  }

  onMonthChange(month: MonthYear): void {
    this.monthSubject.next(month);
  }

  onRefreshNeeded(): void {
    this.refreshSubject.next();
    this.selectedDetail = null;
    this.cdr.markForCheck();
  }

  onViewDetails(closure: TrainerClosureResult, trainerName: string): void {
    // Re-fetch the full detail (with entries + adjustments) when opening modal.
    this.closuresService
      .computeTrainerClosure(closure.trainer_id, closure.year, closure.month, closure.quincena)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (full) => {
          this.selectedDetail = { closure: full, trainerName };
          this.cdr.markForCheck();
        },
        error: () => {
          // Fallback: use the summary data already loaded.
          this.selectedDetail = { closure, trainerName };
          this.cdr.markForCheck();
        }
      });
  }

  onCloseModal(): void {
    this.selectedDetail = null;
    this.cdr.markForCheck();
  }

  async onGeneratePdf(closure: TrainerClosureResult, trainerName: string): Promise<void> {
    // El closure que llega desde la card del listado no incluye bank_account
    // (list-trainers-closures-for-month es liviana). Hay que pedir el detalle
    // completo a compute-trainer-closure antes de generar el PDF.
    const [logo, fullClosure] = await Promise.all([
      this.pdfService.loadLogoAsDataUrl(),
      new Promise<TrainerClosureResult>((resolve) => {
        this.closuresService
          .computeTrainerClosure(closure.trainer_id, closure.year, closure.month, closure.quincena)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (full) => resolve(full),
            error: () => resolve(closure)
          });
      })
    ]);
    this.pdfService.generateClosure(fullClosure, trainerName, logo);
  }

  onHistoryRowClick(row: HistoryRow): void {
    this.closuresService
      .computeTrainerClosure(row.trainerId, row.year, row.month, row.quincena)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (full) => {
          this.selectedDetail = { closure: full, trainerName: row.trainerName };
          this.cdr.markForCheck();
        },
        error: () => {
          // Minimal fallback closure object for display.
          const fallback: TrainerClosureResult = {
            status: row.status as any,
            closure_id: row.closureId,
            trainer_id: row.trainerId,
            year: row.year,
            month: row.month,
            quincena: row.quincena,
            base_cop: row.baseCop,
            count_six_days: 0,
            count_three_days: 0,
            equivalente_q: 0,
            equivalente_mes_acum_at_close: 0,
            bono_mes_total_cop: 0,
            bonus_q_cop: row.bonusQCop,
            adjustments_total_cop: row.adjustmentsTotalCop,
            total_cop: row.totalCop,
            closed_at: row.closedAt,
            closed_by: null,
            paid_at: row.paidAt,
            paid_by: null,
            payment_date: row.paymentDate,
            payment_method: null,
            payment_notes: null,
            entries: [],
            adjustments: [],
            bank_account: null
          };
          this.selectedDetail = { closure: fallback, trainerName: row.trainerName };
          this.cdr.markForCheck();
        }
      });
  }

  trackByTrainerId(_index: number, card: CurrentMonthCard): string {
    return card.q1.trainer_id;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private loadMonth(profile: Profile, month: MonthYear): Observable<PageViewState> {
    if (profile.role === 'admin') {
      return this.loadAsAdmin(month);
    }
    return this.loadAsTrainer(profile, month);
  }

  /**
   * Admin load: uses list-trainers-closures-for-month for current month cards,
   * then builds history from all closures returned.
   */
  private loadAsAdmin(month: MonthYear): Observable<PageViewState> {
    return this.closuresService
      .listTrainersClosuresForMonth(month.year, month.month)
      .pipe(
        switchMap((result) => {
          // Build card objects for the current month grid.
          const cards = this.buildAdminCards(result, month);
          // Determine next-month block.
          const nextBlocked = this.isNextMonthBlocked(
            cards,
            month,
            this.currentMonthYear()
          );
          // Build history from previous months (use same EF for each prior month
          // in the current year). We only fetch year's-worth of history.
          return this.loadHistoryForYear(month.year, month.month).pipe(
            map((historyRows) => {
              const trainerOptions = result.trainers.map((t) => ({
                id: t.trainer_id,
                name: t.trainer_name
              }));
              return {
                loading: false,
                error: '',
                cards,
                historyRows,
                trainerOptions,
                nextBlocked
              } as PageViewState;
            })
          );
        }),
        catchError((err) => {
          const code = this.extractErrorCode(err);
          const msg = mapClosureErrorToMessage(code, {});
          return of({ loading: false, error: msg, cards: [], historyRows: [], trainerOptions: [], nextBlocked: false } as PageViewState);
        })
      );
  }

  /**
   * Trainer load: calls compute-trainer-closure for Q1 and Q2 of the current
   * trainer. History comes from direct PostgREST query on trainer_closures.
   */
  private loadAsTrainer(profile: Profile, month: MonthYear): Observable<PageViewState> {
    return forkJoin({
      q1: this.closuresService.computeTrainerClosure(profile.id, month.year, month.month, 'q1'),
      q2: this.closuresService.computeTrainerClosure(profile.id, month.year, month.month, 'q2')
    }).pipe(
      switchMap(({ q1, q2 }) => {
        const cards: CurrentMonthCard[] = [{ trainerName: '', staffRole: 'trainer', q1, q2 }];
        const nextBlocked = this.isNextMonthBlocked(cards, month, this.currentMonthYear());
        return this.loadTrainerHistory(profile, month.year).pipe(
          map((historyRows) => ({
            loading: false,
            error: '',
            cards,
            historyRows,
            trainerOptions: [],
            nextBlocked
          } as PageViewState))
        );
      }),
      catchError((err) => {
        const code = this.extractErrorCode(err);
        const msg = mapClosureErrorToMessage(code, {});
        return of({ loading: false, error: msg, cards: [], historyRows: [], trainerOptions: [], nextBlocked: false } as PageViewState);
      })
    );
  }

  private buildAdminCards(
    result: ListTrainersClosuresResult,
    currentMonth: MonthYear
  ): CurrentMonthCard[] {
    return result.trainers.map((t) => {
      const role: StaffRole = t.role ?? 'trainer';
      const q1 = this.summaryQToResult(t.q1, t.trainer_id, role, currentMonth, 'q1');
      const q2 = this.summaryQToResult(t.q2, t.trainer_id, role, currentMonth, 'q2');
      return { trainerName: t.trainer_name, staffRole: role, q1, q2 };
    });
  }

  private summaryQToResult(
    q: TrainerClosureSummary['q1'],
    trainerId: string,
    role: StaffRole,
    month: MonthYear,
    quincena: 'q1' | 'q2'
  ): TrainerClosureResult {
    return {
      status: q.status,
      closure_id: q.closure_id,
      trainer_id: trainerId,
      role,
      year: month.year,
      month: month.month,
      quincena,
      base_cop: q.base_cop,
      count_six_days: q.count_six_days,
      count_three_days: q.count_three_days,
      equivalente_q: 0, // not available in summary — detail loads on demand
      equivalente_mes_acum_at_close: 0,
      bono_mes_total_cop: 0,
      bonus_q_cop: q.bonus_q_cop,
      adjustments_total_cop: q.adjustments_total_cop,
      total_cop: q.total_cop,
      closed_at: q.closed_at,
      closed_by: null,
      paid_at: q.paid_at,
      paid_by: null,
      payment_date: q.payment_date,
      payment_method: q.payment_method,
      payment_notes: null,
      entries: [],
      adjustments: [],
      bank_account: null
    };
  }

  /**
   * Returns true if the next month button should be blocked because the current
   * month cards (for the displayed month) don't have both Q1 and Q2 in
   * closed or paid state. Only applies when the displayed month is the actual
   * current calendar month.
   */
  private isNextMonthBlocked(
    cards: CurrentMonthCard[],
    displayedMonth: MonthYear,
    currentCalendarMonth: MonthYear
  ): boolean {
    if (
      displayedMonth.year !== currentCalendarMonth.year ||
      displayedMonth.month !== currentCalendarMonth.month
    ) {
      return false;
    }
    return cards.some((card) => {
      const q1Open = card.q1.status === 'open';
      const q2Open = card.q2.status === 'open';
      return q1Open || q2Open;
    });
  }

  /**
   * Loads history rows for all months of the given year that are before the
   * current month (i.e., not the active month being shown in the grid).
   */
  private loadHistoryForYear(year: number, currentMonth: number): Observable<HistoryRow[]> {
    // Incluye todos los meses del año hasta el actual (inclusive). Las quincenas
    // open se filtran abajo, por lo que el mes actual solo aporta cierres
    // closed o paid — útil para auditar pagos del mes en curso.
    const monthsToLoad = Array.from({ length: currentMonth }, (_, i) => i + 1);
    if (monthsToLoad.length === 0) return of([]);

    const requests = monthsToLoad.map((m) =>
      this.closuresService.listTrainersClosuresForMonth(year, m).pipe(
        catchError(() => of({ year, month: m, trainers: [] } as ListTrainersClosuresResult))
      )
    );

    return forkJoin(requests).pipe(
      map((results) => {
        const rows: HistoryRow[] = [];
        for (const result of results) {
          for (const t of result.trainers) {
            for (const q of ['q1', 'q2'] as const) {
              const qData = t[q];
              if (qData.status !== 'open') {
                rows.push({
                  closureId: qData.closure_id ?? `${t.trainer_id}-${result.year}-${result.month}-${q}`,
                  trainerId: t.trainer_id,
                  trainerName: t.trainer_name,
                  year: result.year,
                  month: result.month,
                  quincena: q,
                  baseCop: qData.base_cop,
                  bonusQCop: qData.bonus_q_cop,
                  adjustmentsTotalCop: qData.adjustments_total_cop,
                  totalCop: qData.total_cop,
                  status: qData.status,
                  closedAt: qData.closed_at,
                  paidAt: qData.paid_at,
                  paymentDate: qData.payment_date
                });
              }
            }
          }
        }
        return rows;
      })
    );
  }

  /** Loads history rows for a trainer from the trainer_closures table. */
  private loadTrainerHistory(profile: Profile, year: number): Observable<HistoryRow[]> {
    return this.closuresService.getTrainerClosuresHistory(profile.id, year).pipe(
      map((rows) =>
        rows.map((r) => ({
          closureId: r.closure_id,
          trainerId: r.trainer_id,
          trainerName: profile.full_name,
          year: r.year,
          month: r.month,
          quincena: r.quincena,
          baseCop: r.base_cop,
          bonusQCop: r.bonus_q_cop,
          adjustmentsTotalCop: r.adjustments_total_cop,
          totalCop: r.total_cop,
          status: r.status,
          closedAt: r.closed_at,
          paidAt: r.paid_at,
          paymentDate: r.payment_date
        }))
      ),
      catchError(() => of([] as HistoryRow[]))
    );
  }

  private currentMonthYear(): MonthYear {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  private extractErrorCode(err: unknown): string {
    if (err && typeof err === 'object') {
      const asObj = err as Record<string, unknown>;
      const body = asObj['context'] ?? asObj['body'] ?? asObj;
      if (body && typeof body === 'object') {
        const errorField = (body as Record<string, unknown>)['error'];
        if (errorField && typeof errorField === 'object') {
          return ((errorField as Record<string, unknown>)['code'] as string) ?? 'INTERNAL_ERROR';
        }
      }
    }
    return 'INTERNAL_ERROR';
  }
}
