import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy
} from '@angular/core';
import { Router } from '@angular/router';

import { UserRole } from 'src/app/core/types/supabase';
import { NavMenuItem, NavMenuSection } from '../../../../app-shell.config';

/**
 * Renders a single top-bar navigation trigger (e.g. "Personal ▾") plus
 * its floating dropdown card.
 *
 * Hover behaviour with a short grace period so the pointer can travel from
 * the trigger to the dropdown panel without the menu collapsing.
 */
@Component({
  selector: 'app-nav-menu-item',
  templateUrl: './nav-menu-item.component.html',
  styleUrls: ['./nav-menu-item.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavMenuItemComponent implements OnDestroy {
  @Input() section!: NavMenuSection;
  /** Rol del usuario actualmente autenticado; se usa para filtrar items con allowedRoles. */
  @Input() currentRole: UserRole | null = null;

  isOpen = false;

  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  /** Items de la sección filtrados por el rol actual. */
  get visibleItems(): NavMenuItem[] {
    if (!this.currentRole) {
      return [];
    }
    const role = this.currentRole;
    return this.section.items.filter(
      (item) => !item.allowedRoles || item.allowedRoles.includes(role)
    );
  }

  onTriggerMouseEnter(): void {
    this.cancelCloseTimer();
    this.isOpen = true;
    this.cdr.markForCheck();
  }

  onTriggerMouseLeave(): void {
    this.scheduleClose();
  }

  onDropdownMouseEnter(): void {
    this.cancelCloseTimer();
  }

  onDropdownMouseLeave(): void {
    this.scheduleClose();
  }

  navigateTo(routerLink: string): void {
    this.isOpen = false;
    this.cdr.markForCheck();
    void this.router.navigateByUrl(routerLink);
  }

  trackByRoute(_index: number, item: { routerLink: string }): string {
    return item.routerLink;
  }

  ngOnDestroy(): void {
    this.cancelCloseTimer();
  }

  private scheduleClose(): void {
    // 120 ms grace period lets the pointer travel from trigger to dropdown.
    this.closeTimer = setTimeout(() => {
      this.isOpen = false;
      this.cdr.markForCheck();
    }, 120);
  }

  private cancelCloseTimer(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }
}
