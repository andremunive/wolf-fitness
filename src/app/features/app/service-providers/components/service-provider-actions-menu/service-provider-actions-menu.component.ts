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

import { ServiceProviderViewModel } from '../../models/service-provider.model';

@Component({
  selector: 'app-service-provider-actions-menu',
  templateUrl: './service-provider-actions-menu.component.html',
  styleUrls: ['./service-provider-actions-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceProviderActionsMenuComponent {
  @Input() provider!: ServiceProviderViewModel;
  @Input() dropdownAlign: 'left' | 'right' = 'right';

  @Output() editRequested = new EventEmitter<ServiceProviderViewModel>();
  @Output() manageBankAccountsRequested = new EventEmitter<ServiceProviderViewModel>();
  @Output() softDeleteRequested = new EventEmitter<ServiceProviderViewModel>();
  @Output() restoreRequested = new EventEmitter<ServiceProviderViewModel>();

  isOpen = false;
  dropdownStyle: Record<string, string> = {};

  constructor(
    private readonly host: ElementRef<HTMLElement>,
    private readonly cdr: ChangeDetectorRef
  ) {}

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
    if (this.isOpen) this.updateDropdownPosition();
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
    this.editRequested.emit(this.provider);
    this.close();
  }

  onManageBankAccounts(): void {
    this.manageBankAccountsRequested.emit(this.provider);
    this.close();
  }

  onSoftDelete(): void {
    const confirmed = window.confirm(
      `¿Deseas dar de baja a "${this.provider.name}"? El registro quedará desactivado pero conservará su historial.`
    );
    if (confirmed) {
      this.softDeleteRequested.emit(this.provider);
    }
    this.close();
  }

  onRestore(): void {
    const confirmed = window.confirm(
      `¿Deseas restaurar a "${this.provider.name}"?`
    );
    if (confirmed) {
      this.restoreRequested.emit(this.provider);
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
