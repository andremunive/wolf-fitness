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
import { FIELD_LABELS, FIELD_UNITS } from '../register-measurement-modal/register-measurement-modal.component';
import { MeasurementShareData } from '../../models/measurement-share.model';

type ViewMode = 'list' | 'detail';

const PAGE_SIZE = 5;

@Component({
  selector: 'app-view-measurements-modal',
  templateUrl: './view-measurements-modal.component.html',
  styleUrls: ['./view-measurements-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewMeasurementsModalComponent implements OnInit, OnDestroy {
  @Input() client!: Client;

  @Output() closed = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  viewMode: ViewMode = 'list';

  measurements: ClientMeasurement[] = [];
  isLoading = false;
  loadError = false;
  totalCount = 0;

  selectedMeasurement: ClientMeasurement | null = null;

  /** Non-null while the share modal is open. Controls *ngIf in the template. */
  shareData: MeasurementShareData | null = null;

  readonly fieldLabels = FIELD_LABELS;
  readonly fieldUnits = FIELD_UNITS;

  readonly circumferenceFields = [
    'calf_left_cm', 'calf_right_cm',
    'thigh_left_cm', 'thigh_right_cm',
    'hip_cm', 'abdomen_cm', 'chest_cm',
    'arm_left_cm', 'arm_right_cm'
  ] as const;

  readonly skinfoldFields = [
    'skinfold_chest_mm', 'skinfold_axilla_mm', 'skinfold_triceps_mm',
    'skinfold_subscapular_mm', 'skinfold_abdomen_mm',
    'skinfold_suprailiac_mm', 'skinfold_thigh_mm'
  ] as const;

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

  // ─── List view ────────────────────────────────────────────────────────────────

  loadPage(from: number): void {
    this.isLoading = true;
    this.loadError = false;
    this.cdr.markForCheck();

    // Fetch count and page in parallel on first load.
    if (from === 0) {
      this.measurementsService
        .countByClient(this.client.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (count) => {
            this.totalCount = count;
            this.cdr.markForCheck();
          },
          error: () => {} // Non-fatal; hasMore defaults false.
        });
    }

    this.measurementsService
      .listByClient(this.client.id, from, PAGE_SIZE)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (rows) => {
          this.measurements = from === 0 ? rows : [...this.measurements, ...rows];
        },
        error: () => {
          this.loadError = true;
        }
      });
  }

  loadMore(): void {
    this.loadPage(this.measurements.length);
  }

  // ─── Detail view ──────────────────────────────────────────────────────────────

  openDetail(measurement: ClientMeasurement): void {
    this.selectedMeasurement = measurement;
    this.viewMode = 'detail';
    this.cdr.markForCheck();
  }

  backToList(): void {
    this.viewMode = 'list';
    this.selectedMeasurement = null;
    this.cdr.markForCheck();
  }

  // ─── Share flow ───────────────────────────────────────────────────────────────

  openShare(): void {
    if (!this.selectedMeasurement) return;
    this.shareData = {
      mode: 'single',
      clientName: this.client.fullName,
      clientEmail: this.client.email,
      measurementDateLabel: this.formatDate(this.selectedMeasurement.measured_at),
      payload: { mode: 'single', measurement_id: this.selectedMeasurement.id }
    };
    this.cdr.markForCheck();
  }

  closeShare(): void {
    this.shareData = null;
    this.cdr.markForCheck();
  }

  // ─── Helpers for template ────────────────────────────────────────────────────

  formatDate(dateStr: string | null): string {
    return formatDateOnly(dateStr);
  }

  hasCircumferences(m: ClientMeasurement): boolean {
    return this.circumferenceFields.some((f) => m[f] !== null);
  }

  hasSkinfolds(m: ClientMeasurement): boolean {
    return this.skinfoldFields.some((f) => m[f] !== null);
  }

  trackById(_index: number, m: ClientMeasurement): string {
    return m.id;
  }

  trackByField(_index: number, field: string): string {
    return field;
  }

  close(): void {
    this.closed.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
