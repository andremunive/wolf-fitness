import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import {
  ClosureAdjustment,
  mapClosureErrorToMessage,
  MONTH_NAMES_ES,
  PAYMENT_METHOD_LABELS,
  TrainerClosureResult
} from '../../models/closure.model';
import { ClosuresService } from '../../services/closures.service';
import { ClosurePdfService } from '../../services/closure-pdf.service';
import { AdjustmentFormValue } from '../closure-adjustment-form/closure-adjustment-form.component';

@Component({
  selector: 'app-closure-detail-modal',
  templateUrl: './closure-detail-modal.component.html',
  styleUrls: ['./closure-detail-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClosureDetailModalComponent implements OnChanges, OnDestroy {
  @Input() closure!: TrainerClosureResult;
  @Input() trainerName = '';
  @Input() isAdmin = false;

  @Output() closed = new EventEmitter<void>();
  /** Emitted after any mutation so parent can refresh. */
  @Output() refreshNeeded = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  quincenaLabel = '';
  monthLabel = '';
  statusLabel = '';
  paymentMethodLabel = '';
  showAdjustmentForm = false;
  actionError = '';
  actionLoading = false;
  showConfirm = false;
  confirmAction: 'close' | 'reopen' | 'deleteAdjustment' | null = null;
  pendingAdjustmentId = '';
  showMarkPaidForm = false;
  markPaidDate = '';
  markPaidMethod = '';
  markPaidNotes = '';
  markPaidError = '';

  readonly paymentMethods = [
    { value: 'cash', label: 'Efectivo' },
    { value: 'transfer', label: 'Transferencia' },
    { value: 'nequi', label: 'Nequi' },
    { value: 'other', label: 'Otros' }
  ];

  constructor(
    private readonly closuresService: ClosuresService,
    private readonly pdfService: ClosurePdfService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(): void {
    if (!this.closure) return;
    this.quincenaLabel = this.closure.quincena === 'q1' ? 'Q1 · 1–15' : 'Q2 · 16–fin';
    this.monthLabel = `${MONTH_NAMES_ES[this.closure.month - 1]} ${this.closure.year}`;
    this.statusLabel = this.resolveStatusLabel(this.closure.status);
    this.paymentMethodLabel = this.closure.payment_method
      ? (PAYMENT_METHOD_LABELS[this.closure.payment_method] ?? this.closure.payment_method)
      : '';
    // Pre-fill mark-paid date with today
    this.markPaidDate = new Date().toISOString().split('T')[0];
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get statusClass(): string {
    switch (this.closure?.status) {
      case 'closed': return 'badge--closed';
      case 'paid':   return 'badge--paid';
      default:       return 'badge--open';
    }
  }

  get canModify(): boolean {
    return this.isAdmin && this.closure?.status !== 'paid';
  }

  get canGeneratePdf(): boolean {
    return this.closure?.status === 'closed' || this.closure?.status === 'paid';
  }

  get isCsm(): boolean {
    return this.closure?.role === 'csm';
  }

  // ─── Confirmation flow ─────────────────────────────────────────────────────

  requestCloseQuincena(): void {
    this.confirmAction = 'close';
    this.showConfirm = true;
    this.actionError = '';
  }

  requestReopenQuincena(): void {
    this.confirmAction = 'reopen';
    this.showConfirm = true;
    this.actionError = '';
  }

  requestDeleteAdjustment(adjustmentId: string): void {
    this.pendingAdjustmentId = adjustmentId;
    this.confirmAction = 'deleteAdjustment';
    this.showConfirm = true;
    this.actionError = '';
  }

  cancelConfirm(): void {
    this.showConfirm = false;
    this.confirmAction = null;
    this.pendingAdjustmentId = '';
  }

  confirmExecute(): void {
    switch (this.confirmAction) {
      case 'close':           this.executeCloseQuincena(); break;
      case 'reopen':          this.executeReopenQuincena(); break;
      case 'deleteAdjustment': this.executeDeleteAdjustment(); break;
    }
    this.showConfirm = false;
    this.confirmAction = null;
  }

  // ─── Close quincena ────────────────────────────────────────────────────────

  private executeCloseQuincena(): void {
    this.actionLoading = true;
    this.actionError = '';
    this.closuresService
      .closeQuincena(this.closure.trainer_id, this.closure.year, this.closure.month, this.closure.quincena)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.actionLoading = false;
          this.refreshNeeded.emit();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.actionLoading = false;
          this.actionError = this.extractError(err);
          this.cdr.markForCheck();
        }
      });
  }

  // ─── Reopen quincena ───────────────────────────────────────────────────────

  private executeReopenQuincena(): void {
    if (!this.closure.closure_id) return;
    this.actionLoading = true;
    this.actionError = '';
    this.closuresService
      .reopenQuincena(this.closure.closure_id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.actionLoading = false;
          this.refreshNeeded.emit();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.actionLoading = false;
          this.actionError = this.extractError(err);
          this.cdr.markForCheck();
        }
      });
  }

  // ─── Mark paid form ────────────────────────────────────────────────────────

  openMarkPaidForm(): void {
    this.showMarkPaidForm = true;
    this.markPaidError = '';
  }

  cancelMarkPaid(): void {
    this.showMarkPaidForm = false;
    this.markPaidError = '';
  }

  submitMarkPaid(): void {
    if (!this.closure.closure_id || !this.markPaidDate || !this.markPaidMethod) {
      this.markPaidError = 'Completa todos los campos requeridos.';
      return;
    }
    this.actionLoading = true;
    this.markPaidError = '';
    this.closuresService
      .markClosurePaid(
        this.closure.closure_id,
        this.markPaidDate,
        this.markPaidMethod as any,
        this.markPaidNotes || null
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.actionLoading = false;
          this.showMarkPaidForm = false;
          this.refreshNeeded.emit();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.actionLoading = false;
          this.markPaidError = this.extractError(err);
          this.cdr.markForCheck();
        }
      });
  }

  // ─── Add adjustment ────────────────────────────────────────────────────────

  onAdjustmentSubmit(value: AdjustmentFormValue): void {
    if (!this.closure.closure_id) return;
    this.actionLoading = true;
    this.actionError = '';
    this.closuresService
      .addClosureAdjustment(this.closure.closure_id, value.amount_cop, value.reason)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.actionLoading = false;
          this.showAdjustmentForm = false;
          this.refreshNeeded.emit();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.actionLoading = false;
          this.actionError = this.extractError(err);
          this.cdr.markForCheck();
        }
      });
  }

  // ─── Delete adjustment ─────────────────────────────────────────────────────

  private executeDeleteAdjustment(): void {
    if (!this.pendingAdjustmentId) return;
    this.actionLoading = true;
    this.actionError = '';
    this.closuresService
      .deleteClosureAdjustment(this.pendingAdjustmentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.actionLoading = false;
          this.pendingAdjustmentId = '';
          this.refreshNeeded.emit();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.actionLoading = false;
          this.actionError = this.extractError(err);
          this.cdr.markForCheck();
        }
      });
  }

  // ─── PDF ───────────────────────────────────────────────────────────────────

  async onGeneratePdf(): Promise<void> {
    const logoDataUrl = await this.pdfService.loadLogoAsDataUrl();
    this.pdfService.generateClosure(this.closure, this.trainerName, logoDataUrl);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

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

  formatDateTime(dateStr: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  }

  trackByAdjId(_index: number, adj: ClosureAdjustment): string {
    return adj.id;
  }

  trackByEntryPaymentId = (_: number, e: { payment_id: string }): string => e.payment_id;
  trackByMethodValue = (_: number, m: { value: string }): string => m.value;

  private resolveStatusLabel(status: string): string {
    switch (status) {
      case 'open':   return 'Abierta';
      case 'closed': return 'Cerrada';
      case 'paid':   return 'Pagada';
      default:       return status;
    }
  }

  todayIso(): string {
    return new Date().toISOString().split('T')[0];
  }

  private extractError(err: unknown): string {
    if (err && typeof err === 'object') {
      const asObj = err as Record<string, unknown>;
      // Supabase FunctionsHttpError wraps the body
      const body = asObj['context'] ?? asObj['body'] ?? asObj;
      if (body && typeof body === 'object') {
        const errorField = (body as Record<string, unknown>)['error'];
        if (errorField && typeof errorField === 'object') {
          const code = (errorField as Record<string, unknown>)['code'] as string ?? '';
          const details = (errorField as Record<string, unknown>)['details'] as Record<string, unknown> ?? {};
          return mapClosureErrorToMessage(code, details);
        }
      }
    }
    return 'Ocurrió un error inesperado. Intenta de nuevo.';
  }
}
