import {
  animate,
  query,
  stagger,
  style,
  transition,
  trigger
} from '@angular/animations';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

import {
  ClientOrigin,
  ClientPaymentStatusDisplay,
  TrainerOption
} from '../../models/client.model';
import { ClientsService } from '../../services/clients.service';

export interface ClientFiltersValue {
  /** Lista vacía = sin filtro (todos los estados de pago). */
  paymentStatuses: ClientPaymentStatusDisplay[];
  /** Lista vacía = sin filtro (todos los orígenes). */
  origins: ClientOrigin[];
  /** null = todos los entrenadores. */
  trainerId: string | null;
}

@Component({
  selector: 'app-clients-filters',
  templateUrl: './clients-filters.component.html',
  styleUrls: ['./clients-filters.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('panelExpand', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-8px)' }),
        animate('200ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('150ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 0, transform: 'translateY(-8px)' }))
      ])
    ]),
    trigger('filtersCascade', [
      transition(':enter', [
        query('.filter-group', [
          style({ opacity: 0, transform: 'translateY(-6px)' }),
          stagger(70, [
            animate('200ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ])
  ]
})
export class ClientsFiltersComponent implements OnChanges {
  @Input() currentFilters: ClientFiltersValue = {
    paymentStatuses: [],
    origins: [],
    trainerId: null
  };
  @Output() filtersChange = new EventEmitter<ClientFiltersValue>();
  @Output() filtersClear = new EventEmitter<void>();

  isOpen = false;

  readonly paymentStatusOptions: Array<{ value: ClientPaymentStatusDisplay; label: string }> = [
    { value: 'paid',        label: 'Al día' },
    { value: 'partial',     label: 'Pago parcial' },
    { value: 'pending',     label: 'Pendiente' },
    { value: 'voided',      label: 'Anulado' },
    { value: 'no_payments', label: 'Sin pagos' }
  ];

  readonly originOptions: Array<{ value: ClientOrigin; label: string }> = [
    { value: 'referido',   label: 'Referido' },
    { value: 'publicidad', label: 'Publicidad' },
    { value: 'llego_solo', label: 'Directo' }
  ];

  readonly trainers$: Observable<TrainerOption[]>;

  localFilters: ClientFiltersValue = {
    paymentStatuses: [],
    origins: [],
    trainerId: null
  };

  constructor(private readonly clientsService: ClientsService) {
    this.trainers$ = this.clientsService.getActiveTrainers().pipe(shareReplay(1));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentFilters']) {
      this.localFilters = {
        ...this.currentFilters,
        paymentStatuses: [...this.currentFilters.paymentStatuses],
        origins: [...this.currentFilters.origins]
      };
    }
  }

  get activeFilterCount(): number {
    let count = 0;
    if (this.currentFilters.paymentStatuses.length > 0) count++;
    if (this.currentFilters.origins.length > 0) count++;
    if (this.currentFilters.trainerId) count++;
    return count;
  }

  get hasActiveFilters(): boolean {
    return this.activeFilterCount > 0;
  }

  togglePanel(): void {
    this.isOpen = !this.isOpen;
  }

  togglePaymentStatus(value: ClientPaymentStatusDisplay): void {
    const current = this.localFilters.paymentStatuses;
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    this.localFilters = { ...this.localFilters, paymentStatuses: next };
    this.emitChange();
  }

  isPaymentStatusSelected(value: ClientPaymentStatusDisplay): boolean {
    return this.localFilters.paymentStatuses.includes(value);
  }

  toggleOrigin(value: ClientOrigin): void {
    const current = this.localFilters.origins;
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    this.localFilters = { ...this.localFilters, origins: next };
    this.emitChange();
  }

  isOriginSelected(value: ClientOrigin): boolean {
    return this.localFilters.origins.includes(value);
  }

  onTrainerChange(value: string): void {
    const trainerId = value ? value : null;
    this.localFilters = { ...this.localFilters, trainerId };
    this.emitChange();
  }

  private emitChange(): void {
    this.filtersChange.emit({
      ...this.localFilters,
      paymentStatuses: [...this.localFilters.paymentStatuses],
      origins: [...this.localFilters.origins]
    });
  }

  clearFilters(): void {
    this.filtersClear.emit();
    this.isOpen = false;
  }

  trackByValue(_index: number, item: { value: string; label: string }): string {
    return item.value;
  }

  trackByTrainerId(_index: number, trainer: TrainerOption): string {
    return trainer.id;
  }
}
