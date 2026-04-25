import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy
} from '@angular/core';

import { Profile, UserRole } from 'src/app/core/types/supabase';
import { NAV_SECTIONS, NavMenuSection } from '../../app-shell.config';

/**
 * Top navigation bar — orchestrates:
 *  - Brand logo (left)
 *  - Horizontal nav sections with hover dropdowns (center-left, desktop only)
 *  - Notification badge placeholder + user avatar menu (right)
 *  - Hamburger button that reveals the mobile drawer
 *
 * Visibility of nav sections is filtered by the current user role, so clients
 * see only the logo and avatar.
 */
@Component({
  selector: 'app-top-bar',
  templateUrl: './top-bar.component.html',
  styleUrls: ['./top-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TopBarComponent implements OnDestroy {
  @Input() profile: Profile | null = null;

  isDrawerOpen = false;

  /** Sections filtered for the current role — used by both desktop nav and mobile drawer. */
  get visibleSections(): NavMenuSection[] {
    const role = this.profile?.role ?? null;
    if (!role) {
      return [];
    }
    return NAV_SECTIONS.filter((s) => s.allowedRoles.includes(role as UserRole));
  }

  constructor(private readonly cdr: ChangeDetectorRef) {}

  toggleDrawer(): void {
    this.isDrawerOpen = !this.isDrawerOpen;
    this.cdr.markForCheck();
  }

  closeDrawer(): void {
    this.isDrawerOpen = false;
    this.cdr.markForCheck();
  }

  trackById(_index: number, section: NavMenuSection): string {
    return section.id;
  }

  ngOnDestroy(): void {
    // Ensure drawer is closed when the component is torn down (e.g. on logout).
    this.isDrawerOpen = false;
  }
}
