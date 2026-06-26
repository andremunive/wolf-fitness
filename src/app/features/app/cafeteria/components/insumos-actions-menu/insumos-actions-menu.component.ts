import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output
} from '@angular/core';

import { CafeteriaExpenseWithDetails } from '../../models/cafeteria.model';

@Component({
  selector: 'app-insumos-actions-menu',
  templateUrl: './insumos-actions-menu.component.html',
  styleUrls: ['./insumos-actions-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InsumosActionsMenuComponent {
  @Input() expense!: CafeteriaExpenseWithDetails;

  @Output() detailRequested = new EventEmitter<CafeteriaExpenseWithDetails>();
  @Output() editRequested = new EventEmitter<CafeteriaExpenseWithDetails>();
  @Output() voidRequested = new EventEmitter<CafeteriaExpenseWithDetails>();

  isOpen = false;
  dropdownStyle: Record<string, string> = {};

  constructor(
    private readonly host: ElementRef<HTMLElement>,
    private readonly cdr: ChangeDetectorRef
  ) {}

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.updateDropdownPosition();
    }
    this.cdr.markForCheck();
  }

  onDetail(): void {
    this.detailRequested.emit(this.expense);
    this.close();
  }

  onEdit(): void {
    this.editRequested.emit(this.expense);
    this.close();
  }

  onVoid(): void {
    this.voidRequested.emit(this.expense);
    this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) return;
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) this.close();
  }

  private updateDropdownPosition(): void {
    const trigger = this.host.nativeElement.querySelector<HTMLElement>('.insumos-actions__trigger');
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    this.dropdownStyle = {
      position: 'fixed',
      top: `${rect.bottom + 6}px`,
      right: `${window.innerWidth - rect.right}px`
    };
  }

  private close(): void {
    this.isOpen = false;
    this.cdr.markForCheck();
  }
}
