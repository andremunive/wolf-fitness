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

import { CafeteriaSaleView } from '../../models/cafeteria-view.models';

@Component({
  selector: 'app-ventas-actions-menu',
  templateUrl: './ventas-actions-menu.component.html',
  styleUrls: ['./ventas-actions-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VentasActionsMenuComponent {
  @Input() sale!: CafeteriaSaleView;

  @Output() detailRequested = new EventEmitter<CafeteriaSaleView>();
  @Output() installmentRequested = new EventEmitter<CafeteriaSaleView>();

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
    this.detailRequested.emit(this.sale);
    this.close();
  }

  onInstallment(): void {
    this.installmentRequested.emit(this.sale);
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
    const trigger = this.host.nativeElement.querySelector<HTMLElement>('.ventas-actions__trigger');
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
