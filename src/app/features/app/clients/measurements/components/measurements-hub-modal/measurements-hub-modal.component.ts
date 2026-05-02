import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { Client } from 'src/app/features/app/clients/models/client.model';

export type MeasurementAction = 'register' | 'view' | 'compare';

@Component({
  selector: 'app-measurements-hub-modal',
  templateUrl: './measurements-hub-modal.component.html',
  styleUrls: ['./measurements-hub-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeasurementsHubModalComponent {
  @Input() client!: Client;

  @Output() closed = new EventEmitter<void>();
  @Output() actionSelected = new EventEmitter<MeasurementAction>();

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
}
