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
   *  - `'right'` (default): dropdown pegado al borde derecho del trigger.
   *  - `'left'`: dropdown abierto hacia la derecha.
   */
  @Input() dropdownAlign: 'left' | 'right' = 'right';

  @Output() editRequested = new EventEmitter<Client>();
  @Output() deactivateRequested = new EventEmitter<Client>();

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

  onEdit(): void {
    this.editRequested.emit(this.client);
    this.close();
  }

  onDeactivate(): void {
    const confirmed = window.confirm(
      `¿Desactivar a ${this.client.fullName}? Esta acción cerrará su asignación de entrenador.`
    );
    if (confirmed) {
      this.deactivateRequested.emit(this.client);
    }
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
