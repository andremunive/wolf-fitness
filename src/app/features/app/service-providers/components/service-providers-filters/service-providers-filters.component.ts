import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core';

import { EntityTypeFilter, ServiceTypeViewModel } from '../../models/service-provider.model';

export interface ServiceProviderFiltersValue {
  entityType: EntityTypeFilter;
  serviceTypeId: string | null;
  includeDeleted: boolean;
}

@Component({
  selector: 'app-service-providers-filters',
  templateUrl: './service-providers-filters.component.html',
  styleUrls: ['./service-providers-filters.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceProvidersFiltersComponent implements OnChanges {
  @Input() currentFilters: ServiceProviderFiltersValue = {
    entityType: 'all',
    serviceTypeId: null,
    includeDeleted: false
  };
  @Input() serviceTypes: ServiceTypeViewModel[] = [];
  @Output() filtersChange = new EventEmitter<ServiceProviderFiltersValue>();

  localFilters: ServiceProviderFiltersValue = {
    entityType: 'all',
    serviceTypeId: null,
    includeDeleted: false
  };
  isOpen = false;

  readonly entityTypeOptions: Array<{ value: EntityTypeFilter; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'persona', label: 'Persona natural' },
    { value: 'empresa', label: 'Empresa' }
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentFilters']) {
      this.localFilters = { ...this.currentFilters };
    }
  }

  get activeFilterCount(): number {
    let count = 0;
    if (this.currentFilters.entityType !== 'all') count++;
    if (this.currentFilters.serviceTypeId !== null) count++;
    if (this.currentFilters.includeDeleted) count++;
    return count;
  }

  get hasActiveFilters(): boolean {
    return this.activeFilterCount > 0;
  }

  togglePanel(): void {
    this.isOpen = !this.isOpen;
  }

  selectEntityType(value: EntityTypeFilter): void {
    this.localFilters = { ...this.localFilters, entityType: value };
    this.filtersChange.emit({ ...this.localFilters });
  }

  selectServiceType(value: string): void {
    const id = value === '' ? null : value;
    this.localFilters = { ...this.localFilters, serviceTypeId: id };
    this.filtersChange.emit({ ...this.localFilters });
  }

  toggleIncludeDeleted(): void {
    this.localFilters = { ...this.localFilters, includeDeleted: !this.localFilters.includeDeleted };
    this.filtersChange.emit({ ...this.localFilters });
  }

  clearFilters(): void {
    this.localFilters = { entityType: 'all', serviceTypeId: null, includeDeleted: false };
    this.filtersChange.emit({ ...this.localFilters });
    this.isOpen = false;
  }

  isEntityTypeSelected(value: EntityTypeFilter): boolean {
    return this.localFilters.entityType === value;
  }

  trackByValue(_index: number, item: { value: string; label: string }): string {
    return item.value;
  }

  trackByTypeId(_index: number, item: ServiceTypeViewModel): string {
    return item.id;
  }
}
