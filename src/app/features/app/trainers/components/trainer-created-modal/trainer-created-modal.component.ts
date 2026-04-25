import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { CreateTrainerResult } from '../../models/trainer.model';

@Component({
  selector: 'app-trainer-created-modal',
  templateUrl: './trainer-created-modal.component.html',
  styleUrls: ['./trainer-created-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TrainerCreatedModalComponent {
  @Input() result!: CreateTrainerResult;
  @Output() dismissed = new EventEmitter<void>();

  isCopied = false;
  copyError = false;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  copyToClipboard(): void {
    if (!this.result?.temporary_password) return;

    navigator.clipboard
      .writeText(this.result.temporary_password)
      .then(() => {
        this.isCopied = true;
        this.copyError = false;
        this.cdr.markForCheck();

        // Resetea el estado de copiado después de 3 segundos.
        setTimeout(() => {
          this.isCopied = false;
          this.cdr.markForCheck();
        }, 3000);
      })
      .catch(() => {
        this.copyError = true;
        this.cdr.markForCheck();
      });
  }

  dismiss(): void {
    this.dismissed.emit();
  }
}
