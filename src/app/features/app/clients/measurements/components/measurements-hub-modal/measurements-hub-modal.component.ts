import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { Client } from 'src/app/features/app/clients/models/client.model';

export type MeasurementAction = 'register' | 'view' | 'compare' | 'weight-register' | 'weight-history';

type HubView = 'main' | 'weight';

@Component({
  selector: 'app-measurements-hub-modal',
  templateUrl: './measurements-hub-modal.component.html',
  styleUrls: ['./measurements-hub-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeasurementsHubModalComponent {
  @Input() client!: Client;
  /** Cuando es true, el usuario es CSM (solo lectura) — oculta Registrar medida y Registrar peso. */
  @Input() isCsm = false;

  @Output() closed = new EventEmitter<void>();
  @Output() actionSelected = new EventEmitter<MeasurementAction>();

  /** Controls which panel is rendered inside the sheet. */
  view: HubView = 'main';

  constructor(private readonly cdr: ChangeDetectorRef) {}

  get initials(): string {
    return this.client.fullName
      .split(' ')
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  close(): void {
    this.closed.emit();
  }

  selectAction(action: MeasurementAction): void {
    this.actionSelected.emit(action);
  }

  openWeightSubHub(): void {
    this.view = 'weight';
    this.cdr.markForCheck();
  }

  backToMain(): void {
    this.view = 'main';
    this.cdr.markForCheck();
  }
}
