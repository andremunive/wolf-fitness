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
import { finalize, takeUntil } from 'rxjs/operators';

import { MeasurementsService } from '../../services/measurements.service';
import {
  MeasurementShareData,
  SendShareSuccess,
  ShareEmailState,
  ShareErrorPayload,
  mapShareErrorToMessage
} from '../../models/measurement-share.model';

@Component({
  selector: 'app-measurement-share-modal',
  templateUrl: './measurement-share-modal.component.html',
  styleUrls: ['./measurement-share-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeasurementShareModalComponent implements OnDestroy {
  @Input() data!: MeasurementShareData;
  @Output() dismissed = new EventEmitter<void>();

  state: ShareEmailState = 'idle';
  errorMessage: string | undefined;
  resendId: string | undefined;

  /**
   * Anti-double-click guard. Set to true at the start of the EF call;
   * cleared in finalize(). Prevents duplicate sends if the user taps
   * "Enviar" rapidly.
   */
  isSending = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly measurementsService: MeasurementsService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  // ─── Actions ──────────────────────────────────────────────────────────────────

  onSend(): void {
    this.callShareEf();
  }

  onRetry(): void {
    this.callShareEf();
  }

  onDismiss(): void {
    this.dismissed.emit();
  }

  // ─── Core call ────────────────────────────────────────────────────────────────

  private callShareEf(): void {
    if (this.isSending) return;

    this.isSending = true;
    this.state = 'sending';
    this.errorMessage = undefined;
    this.cdr.markForCheck();

    this.measurementsService
      .sendMeasurementsShare(this.data.payload)
      .pipe(
        finalize(() => {
          this.isSending = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response: SendShareSuccess) => {
          this.state = 'sent';
          this.resendId = response.resend_id ?? undefined;
          this.cdr.markForCheck();
        },
        error: (err: unknown) => {
          this.state = 'error';
          const efErr = err as ShareErrorPayload;
          const code = efErr?.code ?? 'INTERNAL_ERROR';
          this.errorMessage = mapShareErrorToMessage(code, efErr?.message);
          this.cdr.markForCheck();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
