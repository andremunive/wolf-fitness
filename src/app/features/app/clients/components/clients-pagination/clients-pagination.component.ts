import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

@Component({
  selector: 'app-clients-pagination',
  templateUrl: './clients-pagination.component.html',
  styleUrls: ['./clients-pagination.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientsPaginationComponent {
  @Input() state: PaginationState = { page: 1, pageSize: 10, total: 0 };
  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  readonly pageSizeOptions = [10, 20, 50];

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.state.total / this.state.pageSize));
  }

  get isFirstPage(): boolean {
    return this.state.page <= 1;
  }

  get isLastPage(): boolean {
    return this.state.page >= this.totalPages;
  }

  get startItem(): number {
    if (this.state.total === 0) return 0;
    return (this.state.page - 1) * this.state.pageSize + 1;
  }

  get endItem(): number {
    return Math.min(this.state.page * this.state.pageSize, this.state.total);
  }

  goToPreviousPage(): void {
    if (!this.isFirstPage) {
      this.pageChange.emit(this.state.page - 1);
    }
  }

  goToNextPage(): void {
    if (!this.isLastPage) {
      this.pageChange.emit(this.state.page + 1);
    }
  }

  onPageSizeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.pageSizeChange.emit(Number(select.value));
  }

  trackBySize(_index: number, size: number): number {
    return size;
  }
}
