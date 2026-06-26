import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { BehaviorSubject, forkJoin, Subject } from 'rxjs';
import { catchError, finalize, of, startWith, switchMap, takeUntil } from 'rxjs';

import { ToastService } from 'src/app/shared/services/toast.service';
import { CafeteriaService } from '../../services/cafeteria.service';
import {
  CafeteriaConsolidation,
  CafeteriaConsolidationPreview,
  CafeteriaConsolidationWithUser
} from '../../models/cafeteria.model';

export type CierresModal = 'confirm-close' | 'detail' | null;

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export type QuincenaStatus = 'open' | 'closed' | 'future';

export interface QuincenaCard {
  label: string;
  quarter: 'Q1' | 'Q2';
  periodStart: string;
  periodEnd: string;
  dayStart: number;
  dayEnd: number;
  status: QuincenaStatus;
  closed: CafeteriaConsolidation | null;
  preview: CafeteriaConsolidationPreview | null;
  loadingPreview: boolean;
}

interface CierresPageState {
  loading: boolean;
  error: string | null;
  consolidations: CafeteriaConsolidationWithUser[];
}

const LOADING_PAGE_STATE: CierresPageState = { loading: true, error: null, consolidations: [] };

@Component({
  selector: 'app-cafeteria-cierres',
  templateUrl: './cierres.component.html',
  styleUrls: ['./cierres.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CierresComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly refresh$ = new BehaviorSubject<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1
  });

  // ─── Month navigation ─────────────────────────────────────────────────────

  currentYear = new Date().getFullYear();
  currentMonth = new Date().getMonth() + 1;

  // ─── Quincena cards ───────────────────────────────────────────────────────

  q1Card: QuincenaCard | null = null;
  q2Card: QuincenaCard | null = null;

  // ─── History state ────────────────────────────────────────────────────────

  historyLoading = false;
  historyError: string | null = null;
  consolidations: CafeteriaConsolidationWithUser[] = [];

  skeletonRows = [1, 2, 3, 4];

  // ─── Modal state ──────────────────────────────────────────────────────────

  activeModal: CierresModal = null;
  selectedCard: QuincenaCard | null = null;
  selectedDetail: CafeteriaConsolidationWithUser | null = null;

  // ─── Saving state ─────────────────────────────────────────────────────────

  isClosing = false;

  constructor(
    private readonly cafeteriaService: CafeteriaService,
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.refresh$
      .pipe(
        switchMap(({ year, month }) => {
          this.historyLoading = true;
          this.historyError = null;
          this.q1Card = null;
          this.q2Card = null;
          this.cdr.markForCheck();
          return this.cafeteriaService.getConsolidationsWithUser().pipe(
            catchError((err) => {
              this.historyError = err?.message ?? 'Error al cargar el historial.';
              return of([] as CafeteriaConsolidationWithUser[]);
            })
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((consolidations) => {
        this.consolidations = consolidations;
        this.historyLoading = false;
        this.buildQuincenaCards(this.currentYear, this.currentMonth, consolidations);
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Month navigation ─────────────────────────────────────────────────────

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
    this.refresh$.next({ year: this.currentYear, month: this.currentMonth });
  }

  goToNextMonth(): void {
    if (this.isNextMonthBlocked) return;
    if (this.currentMonth === 12) {
      this.currentMonth = 1;
      this.currentYear += 1;
    } else {
      this.currentMonth += 1;
    }
    this.refresh$.next({ year: this.currentYear, month: this.currentMonth });
  }

  // ─── Build quincena cards ─────────────────────────────────────────────────

  private buildQuincenaCards(
    year: number,
    month: number,
    consolidations: CafeteriaConsolidationWithUser[]
  ): void {
    const lastDay = new Date(year, month, 0).getDate();
    const monthStr = String(month).padStart(2, '0');
    const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

    const q1Start = `${year}-${monthStr}-01`;
    const q1End = `${year}-${monthStr}-15`;
    const q2Start = `${year}-${monthStr}-16`;
    const q2End = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

    const q1Closed = consolidations.find(
      (c) => c.period_start === q1Start && c.period_end === q1End
    ) ?? null;
    const q2Closed = consolidations.find(
      (c) => c.period_start === q2Start && c.period_end === q2End
    ) ?? null;

    const today = new Date();
    const todayNum = today.getDate();
    const isSameMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

    const q1Status = this.resolveStatus(q1Closed, 1, 15, isSameMonth, todayNum);
    const q2Status = this.resolveStatus(q2Closed, 16, lastDay, isSameMonth, todayNum);

    this.q1Card = {
      label: `Q1 ${monthLabel} · 1 al 15`,
      quarter: 'Q1',
      periodStart: q1Start,
      periodEnd: q1End,
      dayStart: 1,
      dayEnd: 15,
      status: q1Status,
      closed: q1Closed,
      preview: null,
      loadingPreview: false
    };

    this.q2Card = {
      label: `Q2 ${monthLabel} · 16 al ${lastDay}`,
      quarter: 'Q2',
      periodStart: q2Start,
      periodEnd: q2End,
      dayStart: 16,
      dayEnd: lastDay,
      status: q2Status,
      closed: q2Closed,
      preview: null,
      loadingPreview: false
    };

    this.loadPreviewsForOpenCards(this.q1Card, this.q2Card);
  }

  private resolveStatus(
    closed: CafeteriaConsolidation | null,
    dayStart: number,
    dayEnd: number,
    isSameMonth: boolean,
    todayNum: number
  ): QuincenaStatus {
    if (closed) return 'closed';
    if (!isSameMonth) return 'open';
    if (todayNum < dayStart) return 'future';
    return 'open';
  }

  private loadPreviewsForOpenCards(q1: QuincenaCard, q2: QuincenaCard): void {
    const openCards = [q1, q2].filter((c) => c.status === 'open');
    if (openCards.length === 0) return;

    openCards.forEach((card) => {
      card.loadingPreview = true;
    });
    this.cdr.markForCheck();

    openCards.forEach((card) => {
      this.cafeteriaService
        .getConsolidationPreview(card.periodStart, card.periodEnd)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (preview) => {
            card.preview = preview;
            card.loadingPreview = false;
            this.cdr.markForCheck();
          },
          error: () => {
            card.loadingPreview = false;
            this.cdr.markForCheck();
          }
        });
    });
  }

  // ─── Quincena card helpers ────────────────────────────────────────────────

  hasMovements(card: QuincenaCard): boolean {
    if (!card.preview) return false;
    return (
      card.preview.sales_count + card.preview.combo_purchases_count + card.preview.expenses_count > 0
    );
  }

  netColorClass(net: number): string {
    if (net > 0) return 'amount--positive';
    if (net < 0) return 'amount--negative';
    return 'amount--muted';
  }

  pendingCount(card: QuincenaCard): number {
    if (!card.preview) return 0;
    return card.preview.pending_sales_count + card.preview.pending_combo_purchases_count;
  }

  // ─── Modal: Confirm close ─────────────────────────────────────────────────

  openConfirmCloseModal(card: QuincenaCard): void {
    this.selectedCard = card;
    this.activeModal = 'confirm-close';
    this.cdr.markForCheck();
  }

  closeConfirmModal(): void {
    if (this.isClosing) return;
    this.activeModal = null;
    this.selectedCard = null;
    this.cdr.markForCheck();
  }

  submitClose(): void {
    if (!this.selectedCard || this.isClosing) return;
    const card = this.selectedCard;

    this.isClosing = true;
    this.cdr.markForCheck();

    this.cafeteriaService
      .closeConsolidation(card.periodStart, card.periodEnd)
      .pipe(
        finalize(() => {
          this.isClosing = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.activeModal = null;
          this.selectedCard = null;
          this.toastService.success('Quincena cerrada correctamente.');
          this.refresh$.next({ year: this.currentYear, month: this.currentMonth });
        },
        error: (err) => {
          const msg: string = err?.message ?? 'Error al cerrar la quincena.';
          this.toastService.error(msg);
        }
      });
  }

  // ─── Modal: Detail ────────────────────────────────────────────────────────

  openDetailModal(row: CafeteriaConsolidationWithUser): void {
    this.selectedDetail = row;
    this.activeModal = 'detail';
    this.cdr.markForCheck();
  }

  openDetailFromCard(card: QuincenaCard): void {
    if (!card.closed) return;
    const withUser = this.consolidations.find((c) => c.id === card.closed!.id) ?? null;
    if (!withUser) return;
    this.openDetailModal(withUser);
  }

  closeDetailModal(): void {
    this.activeModal = null;
    this.selectedDetail = null;
    this.cdr.markForCheck();
  }

  // ─── Formatting helpers ───────────────────────────────────────────────────

  formatCop(amount: number | null | undefined): string {
    if (amount === null || amount === undefined) return '—';
    return '$' + amount.toLocaleString('es-CO');
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

  formatDateShort(isoStr: string | null | undefined): string {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  periodLabel(periodStart: string, periodEnd: string): string {
    const start = new Date(periodStart + 'T00:00:00');
    const end = new Date(periodEnd + 'T00:00:00');
    const dayStart = start.getDate();
    const dayEnd = end.getDate();
    const quarter = dayStart === 1 ? 'Q1' : 'Q2';
    const monthName = MONTH_NAMES[start.getMonth()];
    const year = start.getFullYear();
    return `${quarter} ${monthName} ${year} · ${dayStart}–${dayEnd} ${monthName.slice(0, 3).toLowerCase()}`;
  }

  // ─── Track by functions ───────────────────────────────────────────────────

  trackByConsolidationId(_index: number, c: CafeteriaConsolidationWithUser): string {
    return c.id;
  }

  trackBySkeletonIndex(index: number): number {
    return index;
  }
}
