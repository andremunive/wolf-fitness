import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { BehaviorSubject, Subject, combineLatest } from 'rxjs';
import { catchError, map, of, shareReplay, switchMap, takeUntil } from 'rxjs';

import { formatAmountCop } from 'src/app/features/app/expense-records/models/expense-record.model';
import { BeneficiaryType, Loan, LoanPayment } from '../../models/prestamo.model';
import { PrestamosService } from '../../services/prestamos.service';

// ─── Filter state ──────────────────────────────────────────────────────────────

interface HistorialFilters {
  search: string;
  tipo: BeneficiaryType | '';
  resultado: 'profit' | 'neutral' | 'loss' | '';
}

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-prestamos-list',
  templateUrl: './prestamos-list.component.html',
  styleUrls: ['./prestamos-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PrestamosListComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly refreshTrigger$ = new BehaviorSubject<number>(0);
  private readonly refreshClosedTrigger$ = new BehaviorSubject<number>(0);

  /** Skeleton rows shown while the real data loads. */
  readonly skeletonRows = [1, 2, 3, 4, 5];

  // ─── Active loans ─────────────────────────────────────────────────────────

  activeLoans: Loan[] = [];
  isLoadingActive = true;

  get activeCount(): number {
    return this.activeLoans.length;
  }

  // ─── Closed loans ─────────────────────────────────────────────────────────

  closedLoans: Loan[] = [];
  isLoadingClosed = true;
  filteredClosedLoans: Loan[] = [];
  hasActiveFilters = false;

  /**
   * Shared hot observable for the raw closed list.
   * shareReplay(1) ensures both the "raw list" subscriber and the "filtered"
   * subscriber get the same emission without issuing a second HTTP request.
   * Assigned in the constructor body so the injected service is available.
   */
  private readonly closedLoans$: ReturnType<PrestamosService['getClosedLoans']>;

  // ─── Historial filters ────────────────────────────────────────────────────

  private readonly historialFilters$ = new BehaviorSubject<HistorialFilters>({
    search: '',
    tipo: '',
    resultado: ''
  });

  // ─── Modal state ──────────────────────────────────────────────────────────

  isNewLoanModalOpen = false;
  detailModalLoan: Loan | null = null;
  paymentModalLoan: Loan | null = null;
  editModalLoan: Loan | null = null;
  closeModalLoan: Loan | null = null;

  constructor(
    private readonly prestamosService: PrestamosService,
    private readonly cdr: ChangeDetectorRef
  ) {
    // Build the shared closed-loans stream here so `prestamosService` is ready.
    this.closedLoans$ = this.refreshClosedTrigger$.pipe(
      switchMap(() =>
        this.prestamosService.getClosedLoans().pipe(
          catchError(() => of([] as Loan[]))
        )
      ),
      shareReplay(1)
    );
  }

  ngOnInit(): void {
    this.wireActiveLoans();
    this.wireClosedLoans();
    this.wireFilteredClosed();
  }

  // ─── Active loans stream ──────────────────────────────────────────────────

  private wireActiveLoans(): void {
    this.refreshTrigger$.pipe(
      switchMap(() => {
        this.isLoadingActive = true;
        this.cdr.markForCheck();
        return this.prestamosService.getActiveLoans().pipe(
          catchError(() => of([] as Loan[]))
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe((loans) => {
      this.activeLoans = loans;
      this.isLoadingActive = false;
      this.cdr.markForCheck();
    });
  }

  // ─── Closed loans stream ──────────────────────────────────────────────────

  /**
   * Subscribes to the shared closedLoans$ stream to maintain the raw list
   * and the loading flag. No second HTTP call — shares the same emission
   * as wireFilteredClosed.
   */
  private wireClosedLoans(): void {
    this.closedLoans$.pipe(
      takeUntil(this.destroy$)
    ).subscribe((loans) => {
      this.closedLoans = loans;
      this.isLoadingClosed = false;
      this.cdr.markForCheck();
    });

    // Set loading flag immediately when trigger fires (before the async response).
    this.refreshClosedTrigger$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isLoadingClosed = true;
      this.cdr.markForCheck();
    });
  }

  // ─── Filtered closed loans (client-side, no re-fetch) ────────────────────

  /**
   * combineLatest re-evaluates whenever the raw list updates (after a refresh)
   * or whenever the user changes a filter. Filtering is fully client-side.
   */
  private wireFilteredClosed(): void {
    combineLatest([this.closedLoans$, this.historialFilters$]).pipe(
      map(([loans, filters]) => {
        this.hasActiveFilters =
          filters.search.trim() !== '' ||
          filters.tipo !== '' ||
          filters.resultado !== '';

        return loans.filter((loan) => {
          if (
            filters.search.trim() !== '' &&
            !loan.beneficiary_label
              .toLowerCase()
              .includes(filters.search.trim().toLowerCase())
          ) {
            return false;
          }

          if (filters.tipo !== '' && loan.beneficiary_type !== filters.tipo) {
            return false;
          }

          if (filters.resultado !== '') {
            const profit = loan.profit_cop ?? 0;
            const loss   = loan.loss_cop   ?? 0;
            if (filters.resultado === 'profit'  && !(profit > 0)) return false;
            if (filters.resultado === 'loss'    && !(loss   > 0)) return false;
            if (filters.resultado === 'neutral' && !(profit === 0 && loss === 0)) return false;
          }

          return true;
        });
      }),
      takeUntil(this.destroy$)
    ).subscribe((filtered) => {
      this.filteredClosedLoans = filtered;
      this.cdr.markForCheck();
    });
  }

  private refresh(): void {
    this.refreshTrigger$.next(this.refreshTrigger$.value + 1);
  }

  private refreshClosed(): void {
    this.refreshClosedTrigger$.next(this.refreshClosedTrigger$.value + 1);
  }

  // ─── Filter handlers ──────────────────────────────────────────────────────

  onSearchChange(value: string): void {
    this.historialFilters$.next({ ...this.historialFilters$.value, search: value });
  }

  onTipoChange(value: string): void {
    this.historialFilters$.next({
      ...this.historialFilters$.value,
      tipo: value as BeneficiaryType | ''
    });
  }

  onResultadoChange(value: string): void {
    this.historialFilters$.next({
      ...this.historialFilters$.value,
      resultado: value as 'profit' | 'neutral' | 'loss' | ''
    });
  }

  clearFilters(): void {
    this.historialFilters$.next({ search: '', tipo: '', resultado: '' });
  }

  get currentFilters(): HistorialFilters {
    return this.historialFilters$.value;
  }

  // ─── Days-ago helper ───────────────────────────────────────────────────────

  getDaysAgoLabel(loanDateStr: string): string {
    const [y, m, d] = loanDateStr.split('-').map(Number);
    const loanDate = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - loanDate.getTime()) / 86_400_000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    return `Hace ${diff} días`;
  }

  // ─── Progress bar ──────────────────────────────────────────────────────────

  getProgressPct(loan: Loan): number {
    if (loan.amount_cop <= 0) return 0;
    return Math.min(100, Math.round((loan.total_paid_cop / loan.amount_cop) * 100));
  }

  isPaidOff(loan: Loan): boolean {
    return loan.total_paid_cop >= loan.amount_cop;
  }

  // ─── Amount formatting ─────────────────────────────────────────────────────

  formatAmount(amount: number): string {
    return formatAmountCop(amount);
  }

  // ─── Initials + deterministic color ───────────────────────────────────────

  getInitials(fullName: string): string {
    return fullName
      .split(' ')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  getAvatarBg(fullName: string): string {
    const colors = [
      '#0891b2', '#0284c7', '#7c3aed', '#db2777',
      '#059669', '#d97706', '#dc2626', '#4f46e5'
    ];
    let hash = 0;
    for (let i = 0; i < fullName.length; i++) {
      hash = (hash * 31 + fullName.charCodeAt(i)) & 0xffffffff;
    }
    return colors[Math.abs(hash) % colors.length];
  }

  // ─── New loan modal ───────────────────────────────────────────────────────

  openNewLoanModal(): void {
    this.isNewLoanModalOpen = true;
    this.cdr.markForCheck();
  }

  closeNewLoanModal(): void {
    this.isNewLoanModalOpen = false;
    this.cdr.markForCheck();
  }

  onLoanCreated(): void {
    this.isNewLoanModalOpen = false;
    this.refresh();
    this.cdr.markForCheck();
  }

  // ─── Detail modal ─────────────────────────────────────────────────────────

  openDetail(loan: Loan): void {
    this.detailModalLoan = loan;
    this.cdr.markForCheck();
  }

  closeDetail(): void {
    this.detailModalLoan = null;
    this.cdr.markForCheck();
  }

  // ─── Payment modal ────────────────────────────────────────────────────────

  openPayment(loan: Loan): void {
    this.paymentModalLoan = loan;
    this.cdr.markForCheck();
  }

  closePayment(): void {
    this.paymentModalLoan = null;
    this.cdr.markForCheck();
  }

  onPaymentRequestedFromDetail(loan: Loan): void {
    this.paymentModalLoan = loan;
    this.cdr.markForCheck();
  }

  /**
   * Called when a payment was successfully created.
   * Closes the payment modal, refreshes the active list, and if the detail
   * modal shows the same loan, fetches the updated row to keep it in sync.
   */
  onPaymentCreated(newPayment: LoanPayment): void {
    this.paymentModalLoan = null;
    this.refresh();

    if (this.detailModalLoan?.id === newPayment.loan_id) {
      this.prestamosService.getLoanById(newPayment.loan_id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (updated) => {
            this.detailModalLoan = updated;
            this.cdr.markForCheck();
          },
          error: (err) => {
            console.error('[PrestamosList] reload loan after payment', err);
          }
        });
    }

    this.cdr.markForCheck();
  }

  // ─── Edit modal ───────────────────────────────────────────────────────────

  openEdit(loan: Loan): void {
    this.editModalLoan = loan;
    this.cdr.markForCheck();
  }

  closeEdit(): void {
    this.editModalLoan = null;
    this.cdr.markForCheck();
  }

  onLoanUpdated(updated: Loan): void {
    this.editModalLoan = null;
    this.refresh();
    if (this.detailModalLoan?.id === updated.id) {
      this.detailModalLoan = updated;
    }
    this.cdr.markForCheck();
  }

  // ─── Close modal ──────────────────────────────────────────────────────────

  openClose(loan: Loan): void {
    this.closeModalLoan = loan;
    this.cdr.markForCheck();
  }

  closeClose(): void {
    this.closeModalLoan = null;
    this.cdr.markForCheck();
  }

  onLoanClosed(closedLoan: Loan): void {
    this.closeModalLoan = null;
    this.refresh();
    this.refreshClosed();
    if (this.detailModalLoan?.id === closedLoan.id) {
      this.detailModalLoan = null;
    }
    this.cdr.markForCheck();
  }

  // ─── Track-by ─────────────────────────────────────────────────────────────

  trackByLoanId(_index: number, loan: Loan): string {
    return loan.id;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
