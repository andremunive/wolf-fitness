import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output
} from '@angular/core';
import { Router } from '@angular/router';

import { UserRole } from 'src/app/core/types/supabase';
import { NavMenuItem, NavMenuSection } from '../../../../app-shell.config';

/**
 * Full-width slide-down panel shown on mobile when the hamburger is tapped.
 * Each nav section is an accordion item (tap to expand).
 */
@Component({
  selector: 'app-mobile-drawer',
  templateUrl: './mobile-drawer.component.html',
  styleUrls: ['./mobile-drawer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileDrawerComponent {
  @Input() sections: NavMenuSection[] = [];
  @Input() currentRole: UserRole | null = null;
  @Output() closeDrawer = new EventEmitter<void>();

  /** Tracks which section id is currently expanded. Only one at a time. */
  expandedSectionId: string | null = null;

  constructor(private readonly router: Router) {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeDrawer.emit();
  }

  toggleSection(id: string): void {
    this.expandedSectionId = this.expandedSectionId === id ? null : id;
  }

  navigateTo(routerLink: string): void {
    void this.router.navigateByUrl(routerLink);
    this.closeDrawer.emit();
  }

  isActive(routerLink: string): boolean {
    return this.router.isActive(routerLink, {
      paths: 'subset',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored'
    });
  }

  getVisibleItems(section: NavMenuSection): NavMenuItem[] {
    if (!this.currentRole) {
      return [];
    }
    const role = this.currentRole;
    return section.items.filter(
      (item) => !item.allowedRoles || item.allowedRoles.includes(role)
    );
  }

  trackById(_index: number, section: NavMenuSection): string {
    return section.id;
  }

  trackByRoute(_index: number, item: { routerLink: string }): string {
    return item.routerLink;
  }
}
