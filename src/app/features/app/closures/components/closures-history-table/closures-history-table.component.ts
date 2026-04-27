import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core';

import {
  ClosureQuincena,
  ClosureStatus,
  MONTH_NAMES_ES
} from '../../models/closure.model';

export interface HistoryRow {
  closureId: string;
  trainerId: string;
  trainerName: string;
  year: number;
  month: number;
  quincena: ClosureQuincena;
  baseCop: number;
  bonusQCop: number;
  adjustmentsTotalCop: number;
  totalCop: number;
  status: ClosureStatus | 'open';
  closedAt: string | null;
  paidAt: string | null;
  paymentDate: string | null;
}

@Component({
  selector: 'app-closures-history-table',
  templateUrl: './closures-history-table.component.html',
  styleUrls: ['./closures-history-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClosuresHistoryTableComponent implements OnChanges {
  @Input() rows: HistoryRow[] = [];
  @Input() isAdmin = false;
  @Input() loading = false;
  @Input() error = '';

  /** Unique trainer names (for admin filter). */
  @Input() trainerOptions: Array<{ id: string; name: string }> = [];

  @Output() rowClick = new EventEmitter<HistoryRow>();

  // ─── Filters ────────────────────────────────────────────────────────────────
  filterTrainerId = '';
  filterStatus = '';
  filterYear = new Date().getFullYear();

  availableYears: number[] = [];
  filteredRows: HistoryRow[] = [];
  pagedRows: HistoryRow[] = [];

  // ─── Pagination ──────────────────────────────────────────────────────────────
  readonly pageSize = 25;
  currentPage = 1;
  totalPages = 1;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rows']) {
      this.buildAvailableYears();
      this.applyFilters();
    }
  }

  private buildAvailableYears(): void {
    const years = new Set(this.rows.map((r) => r.year));
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    this.availableYears = Array.from(years).sort((a, b) => b - a);
    if (!this.availableYears.includes(this.filterYear)) {
      this.filterYear = this.availableYears[0] ?? currentYear;
    }
  }

  applyFilters(): void {
    this.currentPage = 1;
    let result = this.rows.filter((r) => r.year === this.filterYear);
    if (this.filterTrainerId) {
      result = result.filter((r) => r.trainerId === this.filterTrainerId);
    }
    if (this.filterStatus) {
      result = result.filter((r) => r.status === this.filterStatus);
    }
    // Sort by month desc, then quincena desc
    result = result.sort((a, b) => {
      if (b.month !== a.month) return b.month - a.month;
      return b.quincena.localeCompare(a.quincena);
    });
    this.filteredRows = result;
    this.totalPages = Math.ceil(result.length / this.pageSize) || 1;
    this.buildPage();
  }

  private buildPage(): void {
    const from = (this.currentPage - 1) * this.pageSize;
    const to = from + this.pageSize;
    this.pagedRows = this.filteredRows.slice(from, to);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.buildPage();
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  // ─── Display helpers ─────────────────────────────────────────────────────────

  quincenaLabel(row: HistoryRow): string {
    return row.quincena === 'q1' ? 'Q1 (1–15)' : 'Q2 (16–fin)';
  }

  monthLabel(row: HistoryRow): string {
    return `${MONTH_NAMES_ES[row.month - 1]} ${row.year}`;
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'open':   return 'Abierta';
      case 'closed': return 'Cerrada';
      case 'paid':   return 'Pagada';
      default:       return status;
    }
  }

  statusClass(status: string): string {
    switch (status) {
      case 'closed': return 'badge--closed';
      case 'paid':   return 'badge--paid';
      default:       return 'badge--open';
    }
  }

  formatCop(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount);
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  trackByClosureId(_index: number, row: HistoryRow): string {
    return row.closureId;
  }

  get pagesArray(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }
}
