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

import { ClientPlan, ClientStatus, TrainerOption } from '../../models/client.model';

export interface ClientFiltersValue {
  trainerId: string;
  status: ClientStatus | 'all';
  plan: ClientPlan | 'all';
}

@Component({
  selector: 'app-clients-filters',
  templateUrl: './clients-filters.component.html',
  styleUrls: ['./clients-filters.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    // Contenedor del panel: slide-down + fade al abrirse
    trigger('panelExpand', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-8px)' }),
        animate('200ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('150ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 0, transform: 'translateY(-8px)' }))
      ])
    ]),
    // Cada grupo de filtro aparece en cascada con stagger de 70ms
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
  @Input() trainers: TrainerOption[] = [];
  @Input() currentFilters: ClientFiltersValue = { trainerId: 'all', status: 'all', plan: 'all' };
  @Output() filtersChange = new EventEmitter<ClientFiltersValue>();
  @Output() filtersClear = new EventEmitter<void>();

  isOpen = false;

  readonly statusOptions: Array<{ value: ClientStatus | 'all'; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activo' },
    { value: 'inactive', label: 'Inactivo' },
    { value: 'suspended', label: 'Suspendido' }
  ];

  readonly planOptions: Array<{ value: ClientPlan | 'all'; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: '6_days', label: '6 días/semana' },
    { value: '3_days', label: '3 días/semana' }
  ];

  // Copia mutable local de los filtros para que los inputs no muten el @Input directamente
  localFilters: ClientFiltersValue = { trainerId: 'all', status: 'all', plan: 'all' };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentFilters']) {
      this.localFilters = { ...this.currentFilters };
    }
  }

  get activeFilterCount(): number {
    let count = 0;
    if (this.currentFilters.trainerId !== 'all') count++;
    if (this.currentFilters.status !== 'all') count++;
    if (this.currentFilters.plan !== 'all') count++;
    return count;
  }

  get hasActiveFilters(): boolean {
    return this.activeFilterCount > 0;
  }

  togglePanel(): void {
    this.isOpen = !this.isOpen;
  }

  selectStatus(value: ClientStatus | 'all'): void {
    this.localFilters = { ...this.localFilters, status: value };
    this.filtersChange.emit({ ...this.localFilters });
  }

  selectPlan(value: ClientPlan | 'all'): void {
    this.localFilters = { ...this.localFilters, plan: value };
    this.filtersChange.emit({ ...this.localFilters });
  }

  onTrainerChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.localFilters = { ...this.localFilters, trainerId: select.value };
    this.filtersChange.emit({ ...this.localFilters });
  }

  clearFilters(): void {
    this.filtersClear.emit();
    this.isOpen = false;
  }

  isStatusActive(value: ClientStatus | 'all'): boolean {
    return this.localFilters.status === value;
  }

  isPlanActive(value: ClientPlan | 'all'): boolean {
    return this.localFilters.plan === value;
  }

  trackByValue(_index: number, item: { value: string; label: string }): string {
    return item.value;
  }

  trackByTrainerId(_index: number, trainer: TrainerOption): string {
    return trainer.id;
  }
}
