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

import { Trainer } from '../../models/trainer.model';

@Component({
  selector: 'app-trainer-actions-menu',
  templateUrl: './trainer-actions-menu.component.html',
  styleUrls: ['./trainer-actions-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TrainerActionsMenuComponent {
  @Input() trainer!: Trainer;
  /**
   * Alineación del dropdown respecto al trigger.
   *  - `'right'` (default): se abre hacia la izquierda del trigger.
   *  - `'left'`: se abre hacia la derecha del trigger.
   */
  @Input() dropdownAlign: 'left' | 'right' = 'right';

  @Output() editRequested = new EventEmitter<Trainer>();
  @Output() toggleActiveRequested = new EventEmitter<{ trainer: Trainer; isActive: boolean }>();

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
    this.editRequested.emit(this.trainer);
    this.close();
  }

  onToggleActive(): void {
    const newActiveState = !this.trainer.isActive;
    const actionLabel = newActiveState ? 'reactivar' : 'desactivar';
    const confirmed = window.confirm(
      `¿Deseas ${actionLabel} a ${this.trainer.fullName}?`
    );
    if (confirmed) {
      this.toggleActiveRequested.emit({ trainer: this.trainer, isActive: newActiveState });
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
