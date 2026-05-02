import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { Client } from 'src/app/features/app/clients/models/client.model';
import { ClientMeasurement } from 'src/app/core/types/supabase';
import { MeasurementsService } from '../../services/measurements.service';
import { formatDateOnly } from 'src/app/shared/utils/date.utils';
import { FIELD_LABELS } from '../register-measurement-modal/register-measurement-modal.component';

type CompareViewMode = 'list' | 'compare';

const PAGE_SIZE = 5;

export interface CompareRow {
  label: string;
  oldValue: number | null;
  newValue: number | null;
  /** positive = new > old, negative = new < old, 0 = equal or both null */
  trend: 1 | -1 | 0;
}

const COMPARABLE_FIELDS: Array<keyof ClientMeasurement> = [
  'weight_kg',
  'calf_left_cm', 'calf_right_cm',
  'thigh_left_cm', 'thigh_right_cm',
  'hip_cm', 'abdomen_cm', 'chest_cm',
  'arm_left_cm', 'arm_right_cm',
  'skinfold_chest_mm', 'skinfold_axilla_mm', 'skinfold_triceps_mm',
  'skinfold_subscapular_mm', 'skinfold_abdomen_mm',
  'skinfold_suprailiac_mm', 'skinfold_thigh_mm',
  'body_fat_pct'
];

function buildCompareRows(
  older: ClientMeasurement,
  newer: ClientMeasurement
): CompareRow[] {
  const rows: CompareRow[] = [];
  for (const field of COMPARABLE_FIELDS) {
    const oldVal = older[field] as number | null;
    const newVal = newer[field] as number | null;
    // Skip if both sides are null — no data to show.
    if (oldVal === null && newVal === null) continue;

    let trend: 1 | -1 | 0 = 0;
    if (oldVal !== null && newVal !== null) {
      if (newVal > oldVal) trend = 1;
      else if (newVal < oldVal) trend = -1;
    }

    rows.push({
      label: FIELD_LABELS[field as string] ?? field,
      oldValue: oldVal,
      newValue: newVal,
      trend
    });
  }
  return rows;
}

@Component({
  selector: 'app-compare-measurements-modal',
  templateUrl: './compare-measurements-modal.component.html',
  styleUrls: ['./compare-measurements-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompareMeasurementsModalComponent implements OnInit, OnDestroy {
  @Input() client!: Client;

  @Output() closed = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  viewMode: CompareViewMode = 'list';

  measurements: ClientMeasurement[] = [];
  isLoading = false;
  loadError = false;
  totalCount = 0;

  selectedIds: string[] = [];

  /** Built when the user clicks "Comparar". */
  compareRows: CompareRow[] = [];
  olderMeasurement: ClientMeasurement | null = null;
  newerMeasurement: ClientMeasurement | null = null;

  constructor(
    private readonly measurementsService: MeasurementsService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadPage(0);
  }

  get hasMore(): boolean {
    return this.measurements.length < this.totalCount;
  }

  get isEmpty(): boolean {
    return !this.isLoading && !this.loadError && this.measurements.length === 0;
  }

  get canCompare(): boolean {
    return this.selectedIds.length === 2;
  }

  // ─── Selection ───────────────────────────────────────────────────────────────

  isSelected(id: string): boolean {
    return this.selectedIds.includes(id);
  }

  toggleSelection(id: string): void {
    if (this.isSelected(id)) {
      this.selectedIds = this.selectedIds.filter((s) => s !== id);
    } else if (this.selectedIds.length < 2) {
      this.selectedIds = [...this.selectedIds, id];
    } else {
      // Already 2 selected: drop the oldest-selected (FIFO) and add the new one.
      this.selectedIds = [this.selectedIds[1], id];
    }
    this.cdr.markForCheck();
  }

  // ─── Pagination ──────────────────────────────────────────────────────────────

  loadPage(from: number): void {
    this.isLoading = true;
    this.loadError = false;
    this.cdr.markForCheck();

    if (from === 0) {
      this.measurementsService
        .countByClient(this.client.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({ next: (c) => { this.totalCount = c; this.cdr.markForCheck(); }, error: () => {} });
    }

    this.measurementsService
      .listByClient(this.client.id, from, PAGE_SIZE)
      .pipe(
        finalize(() => { this.isLoading = false; this.cdr.markForCheck(); }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (rows) => {
          this.measurements = from === 0 ? rows : [...this.measurements, ...rows];
        },
        error: () => { this.loadError = true; }
      });
  }

  loadMore(): void {
    this.loadPage(this.measurements.length);
  }

  // ─── Compare ─────────────────────────────────────────────────────────────────

  compare(): void {
    if (!this.canCompare) return;
    this.isLoading = true;
    this.cdr.markForCheck();

    this.measurementsService
      .getByIds(this.selectedIds as [string, string])
      .pipe(
        finalize(() => { this.isLoading = false; this.cdr.markForCheck(); }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (pair) => {
          // Sort: older = smaller measured_at (or created_at as tie-breaker).
          const sorted = [...pair].sort((a, b) => {
            const dateCmp = a.measured_at.localeCompare(b.measured_at);
            if (dateCmp !== 0) return dateCmp;
            return a.created_at.localeCompare(b.created_at);
          });
          this.olderMeasurement = sorted[0];
          this.newerMeasurement = sorted[1];
          this.compareRows = buildCompareRows(sorted[0], sorted[1]);
          this.viewMode = 'compare';
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadError = true;
        }
      });
  }

  backToList(): void {
    this.viewMode = 'list';
    this.compareRows = [];
    this.olderMeasurement = null;
    this.newerMeasurement = null;
    this.cdr.markForCheck();
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  formatDate(dateStr: string | null): string {
    return formatDateOnly(dateStr);
  }

  formatValue(val: number | null): string {
    if (val === null) return '—';
    return parseFloat(val.toFixed(2)).toString();
  }

  trackById(_index: number, m: ClientMeasurement): string {
    return m.id;
  }

  trackByLabel(_index: number, row: CompareRow): string {
    return row.label;
  }

  close(): void {
    this.closed.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
