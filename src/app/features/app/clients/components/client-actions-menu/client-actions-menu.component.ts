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
  /**
   * Cuando es true, muestra la opción "Registrar pago".
   * El contenedor padre decide si el usuario logueado tiene rol admin.
   */
  @Input() isAdmin = false;

  @Output() editRequested = new EventEmitter<Client>();
  @Output() deactivateRequested = new EventEmitter<Client>();
  @Output() registerPaymentRequested = new EventEmitter<Client>();
  @Output() measurementsRequested = new EventEmitter<Client>();

  isOpen = false;
  /** Fixed-position style for the dropdown so it escapes overflow:auto containers. */
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

  private updateDropdownPosition(): void {
    const trigger = this.host.nativeElement.querySelector<HTMLElement>('.actions-menu__trigger');
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    if (this.dropdownAlign === 'left') {
      this.dropdownStyle = {
        position: 'fixed',
        top: `${rect.bottom + 6}px`,
        left: `${rect.left}px`
      };
    } else {
      this.dropdownStyle = {
        position: 'fixed',
        top: `${rect.bottom + 6}px`,
        right: `${window.innerWidth - rect.right}px`
      };
    }
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

  onRegisterPayment(): void {
    this.registerPaymentRequested.emit(this.client);
    this.close();
  }

  onMeasurements(): void {
    this.measurementsRequested.emit(this.client);
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
