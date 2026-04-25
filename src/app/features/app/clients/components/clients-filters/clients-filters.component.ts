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

import { ClientActiveFilter } from '../../models/client.model';

export interface ClientFiltersValue {
  activeFilter: ClientActiveFilter;
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
  @Input() currentFilters: ClientFiltersValue = { activeFilter: 'active' };
  @Output() filtersChange = new EventEmitter<ClientFiltersValue>();
  @Output() filtersClear = new EventEmitter<void>();

  isOpen = false;

  readonly activeFilterOptions: Array<{ value: ClientActiveFilter; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'inactive', label: 'Inactivos' }
  ];

  localFilters: ClientFiltersValue = { activeFilter: 'active' };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentFilters']) {
      this.localFilters = { ...this.currentFilters };
    }
  }

  get activeFilterCount(): number {
    // Se considera filtro activo cuando no está en el default ('active').
    return this.currentFilters.activeFilter !== 'active' ? 1 : 0;
  }

  get hasActiveFilters(): boolean {
    return this.activeFilterCount > 0;
  }

  togglePanel(): void {
    this.isOpen = !this.isOpen;
  }

  selectActiveFilter(value: ClientActiveFilter): void {
    this.localFilters = { ...this.localFilters, activeFilter: value };
    this.filtersChange.emit({ ...this.localFilters });
  }

  clearFilters(): void {
    this.filtersClear.emit();
    this.isOpen = false;
  }

  isActiveFilterSelected(value: ClientActiveFilter): boolean {
    return this.localFilters.activeFilter === value;
  }

  trackByValue(_index: number, item: { value: string; label: string }): string {
    return item.value;
  }
}
