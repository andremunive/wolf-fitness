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

import { CafeteriaProduct } from '../../models/cafeteria.model';

@Component({
  selector: 'app-catalogo-actions-menu',
  templateUrl: './catalogo-actions-menu.component.html',
  styleUrls: ['./catalogo-actions-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatalogoActionsMenuComponent {
  @Input() product!: CafeteriaProduct;

  @Output() editRequested = new EventEmitter<CafeteriaProduct>();
  @Output() updatePriceRequested = new EventEmitter<CafeteriaProduct>();
  @Output() priceHistoryRequested = new EventEmitter<CafeteriaProduct>();

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

  onEdit(): void {
    this.editRequested.emit(this.product);
    this.close();
  }

  onUpdatePrice(): void {
    this.updatePriceRequested.emit(this.product);
    this.close();
  }

  onPriceHistory(): void {
    this.priceHistoryRequested.emit(this.product);
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
    const trigger = this.host.nativeElement.querySelector<HTMLElement>('.catalogo-actions__trigger');
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
