import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input
} from '@angular/core';

import { Client } from '../../models/client.model';

@Component({
  selector: 'app-client-actions-menu',
  templateUrl: './client-actions-menu.component.html',
  styleUrls: ['./client-actions-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientActionsMenuComponent {
  @Input() client!: Client;
  /**
   * Alineación del dropdown respecto al trigger.
   *  - `'right'` (default): dropdown pegado al borde derecho del trigger, se abre hacia la izquierda.
   *  - `'left'`: dropdown pegado al borde izquierdo del trigger, se abre hacia la derecha.
   */
  @Input() dropdownAlign: 'left' | 'right' = 'right';

  isOpen = false;

  constructor(
    private readonly host: ElementRef<HTMLElement>,
    private readonly cdr: ChangeDetectorRef
  ) {}

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
    this.cdr.markForCheck();
  }

  onPay(): void {
    console.log('[ClientActionsMenu] Pago →', this.client.id);
    this.close();
  }

  onEdit(): void {
    console.log('[ClientActionsMenu] Editar →', this.client.id);
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

  private close(): void {
    this.isOpen = false;
    this.cdr.markForCheck();
  }
}
