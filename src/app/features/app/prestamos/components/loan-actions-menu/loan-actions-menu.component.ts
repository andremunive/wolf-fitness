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

import { Loan } from '../../models/prestamo.model';

/**
 * Three-dot actions dropdown for a single loan row.
 * Presentational: receives the loan via @Input(), emits specific actions.
 * Uses fixed-position dropdown (same pattern as ClientActionsMenuComponent)
 * so it escapes overflow:auto table wrappers.
 */
@Component({
  selector: 'app-loan-actions-menu',
  templateUrl: './loan-actions-menu.component.html',
  styleUrls: ['./loan-actions-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoanActionsMenuComponent {
  @Input() loan!: Loan;
  /** Drop left (table last column) or right (mobile card top-right). */
  @Input() dropdownAlign: 'left' | 'right' = 'right';

  @Output() detailRequested  = new EventEmitter<Loan>();
  @Output() paymentRequested = new EventEmitter<Loan>();
  @Output() editRequested    = new EventEmitter<Loan>();
  @Output() closeRequested   = new EventEmitter<Loan>();

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

  private updateDropdownPosition(): void {
    const trigger = this.host.nativeElement.querySelector<HTMLElement>('.loan-menu__trigger');
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

  onDetail(): void {
    this.detailRequested.emit(this.loan);
    this.close();
  }

  onPayment(): void {
    this.paymentRequested.emit(this.loan);
    this.close();
  }

  onEdit(): void {
    this.editRequested.emit(this.loan);
    this.close();
  }

  onClose(): void {
    this.closeRequested.emit(this.loan);
    this.close();
  }

  /** True when the loan is fully paid off (saldo = 0). */
  get isLoanPaidOff(): boolean {
    return this.loan.saldo_cop <= 0;
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
