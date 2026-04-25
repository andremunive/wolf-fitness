import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core';

import { TrainerActiveFilter } from '../../models/trainer.model';

export interface TrainerFiltersValue {
  activeFilter: TrainerActiveFilter;
}

@Component({
  selector: 'app-trainers-filters',
  templateUrl: './trainers-filters.component.html',
  styleUrls: ['./trainers-filters.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TrainersFiltersComponent implements OnChanges {
  @Input() currentFilters: TrainerFiltersValue = { activeFilter: 'active' };
  @Output() filtersChange = new EventEmitter<TrainerFiltersValue>();

  // Copia mutable local para que los inputs del template no muten el @Input.
  localFilters: TrainerFiltersValue = { activeFilter: 'active' };

  isOpen = false;

  readonly statusOptions: Array<{ value: TrainerActiveFilter; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'inactive', label: 'Inactivos' }
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentFilters']) {
      this.localFilters = { ...this.currentFilters };
    }
  }

  get activeFilterCount(): number {
    // El filtro "active" es el default y no se cuenta como filtro activo aplicado.
    return this.currentFilters.activeFilter !== 'active' ? 1 : 0;
  }

  get hasActiveFilters(): boolean {
    return this.activeFilterCount > 0;
  }

  togglePanel(): void {
    this.isOpen = !this.isOpen;
  }

  selectStatus(value: TrainerActiveFilter): void {
    this.localFilters = { ...this.localFilters, activeFilter: value };
    this.filtersChange.emit({ ...this.localFilters });
  }

  clearFilters(): void {
    this.localFilters = { activeFilter: 'active' };
    this.filtersChange.emit({ ...this.localFilters });
    this.isOpen = false;
  }

  isStatusSelected(value: TrainerActiveFilter): boolean {
    return this.localFilters.activeFilter === value;
  }

  trackByValue(_index: number, item: { value: string; label: string }): string {
    return item.value;
  }
}
