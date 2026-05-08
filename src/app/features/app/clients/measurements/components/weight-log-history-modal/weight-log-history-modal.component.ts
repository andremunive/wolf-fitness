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
import { forkJoin } from 'rxjs';

import { Client } from 'src/app/features/app/clients/models/client.model';
import { ClientWeightLog } from 'src/app/core/types/supabase';
import { WeightLogsService } from '../../services/weight-logs.service';
import { formatDateOnly } from 'src/app/shared/utils/date.utils';

const PAGE_SIZE = 5;

@Component({
  selector: 'app-weight-log-history-modal',
  templateUrl: './weight-log-history-modal.component.html',
  styleUrls: ['./weight-log-history-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeightLogHistoryModalComponent implements OnInit, OnDestroy {
  @Input() client!: Client;

  @Output() closed = new EventEmitter<void>();
  /**
   * Emitted when the user taps "Registrar peso" in the empty state.
   * The parent opens the register modal directly without going through the hub.
   */
  @Output() registerRequested = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  entries: ClientWeightLog[] = [];
  total = 0;
  loading = false;
  loadingMore = false;
  error: string | null = null;

  get hasMore(): boolean {
    return this.entries.length < this.total;
  }

  get isEmpty(): boolean {
    return !this.loading && !this.error && this.total === 0;
  }

  get initials(): string {
    return this.client.fullName
      .split(' ')
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  constructor(
    private readonly weightLogsService: WeightLogsService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadInitial();
  }

  // ─── Data loading ─────────────────────────────────────────────────────────────

  private loadInitial(): void {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();

    forkJoin([
      this.weightLogsService.listByClient(this.client.id, 0, PAGE_SIZE),
      this.weightLogsService.countByClient(this.client.id)
    ])
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: ([entries, count]) => {
          this.entries = entries;
          this.total = count;
        },
        error: () => {
          this.error = 'No se pudo cargar el historial. Intenta de nuevo.';
        }
      });
  }

  loadMore(): void {
    if (this.loadingMore || !this.hasMore) return;

    this.loadingMore = true;
    this.cdr.markForCheck();

    this.weightLogsService
      .listByClient(this.client.id, this.entries.length, PAGE_SIZE)
      .pipe(
        finalize(() => {
          this.loadingMore = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (newEntries) => {
          this.entries = [...this.entries, ...newEntries];
        },
        error: () => {
          // Non-fatal: existing entries remain visible.
        }
      });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  formatDate(dateStr: string | null): string {
    return formatDateOnly(dateStr);
  }

  formatWeight(value: number): string {
    return value.toFixed(2);
  }

  trackById(_index: number, entry: ClientWeightLog): string {
    return entry.id;
  }

  close(): void {
    this.closed.emit();
  }

  requestRegister(): void {
    this.registerRequested.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
