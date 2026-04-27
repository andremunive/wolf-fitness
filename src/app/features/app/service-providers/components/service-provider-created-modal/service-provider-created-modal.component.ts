import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

import { ServiceProviderViewModel } from '../../models/service-provider.model';

@Component({
  selector: 'app-service-provider-created-modal',
  templateUrl: './service-provider-created-modal.component.html',
  styleUrls: ['./service-provider-created-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceProviderCreatedModalComponent {
  @Input() provider!: ServiceProviderViewModel;
  @Output() dismissed = new EventEmitter<void>();

  dismiss(): void {
    this.dismissed.emit();
  }
}
