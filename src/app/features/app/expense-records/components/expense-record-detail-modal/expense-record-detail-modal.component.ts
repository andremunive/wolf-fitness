import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ExpenseRecordsService } from '../../services/expense-records.service';
import {
  ExpenseItemViewModel,
  ExpenseRecordViewModel,
  PAYMENT_METHOD_LABELS,
  formatAmountCop
} from '../../models/expense-record.model';

@Component({
  selector: 'app-expense-record-detail-modal',
  templateUrl: './expense-record-detail-modal.component.html',
  styleUrls: ['./expense-record-detail-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseRecordDetailModalComponent implements OnDestroy {
  @Input() record!: ExpenseRecordViewModel;

  @Output() closed = new EventEmitter<void>();
  @Output() editRequested = new EventEmitter<ExpenseRecordViewModel>();

  private readonly destroy$ = new Subject<void>();

  isLoadingSignedUrl = false;
  invoiceUrlError: string | null = null;

  readonly paymentMethodLabels = PAYMENT_METHOD_LABELS;

  constructor(
    private readonly recordsService: ExpenseRecordsService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  get itemsTotal(): number {
    return this.record.items.reduce((sum, item) => sum + item.subtotalCop, 0);
  }

  formatAmount(amount: number): string {
    return formatAmountCop(amount);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }

  getPaymentMethodLabel(method: string): string {
    return this.paymentMethodLabels[method] ?? method;
  }

  openInvoice(): void {
    if (!this.record.invoiceStoragePath || this.isLoadingSignedUrl) return;

    this.isLoadingSignedUrl = true;
    this.invoiceUrlError = null;
    this.cdr.markForCheck();

    this.recordsService
      .getInvoiceSignedUrl(this.record.invoiceStoragePath, 120)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (url) => {
          this.isLoadingSignedUrl = false;
          this.cdr.markForCheck();
          window.open(url, '_blank', 'noopener,noreferrer');
        },
        error: () => {
          this.isLoadingSignedUrl = false;
          this.invoiceUrlError = 'No se pudo obtener el enlace de la factura. Intenta de nuevo.';
          this.cdr.markForCheck();
        }
      });
  }

  requestEdit(): void {
    this.editRequested.emit(this.record);
  }

  close(): void {
    this.closed.emit();
  }

  trackByItemId(_index: number, item: ExpenseItemViewModel): string {
    return item.id;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
