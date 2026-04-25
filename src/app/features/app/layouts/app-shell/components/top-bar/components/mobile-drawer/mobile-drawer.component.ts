import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';
import { Router } from '@angular/router';

import { NavMenuSection } from '../../../../app-shell.config';

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
  @Output() closeDrawer = new EventEmitter<void>();

  /** Tracks which section id is currently expanded. Only one at a time. */
  expandedSectionId: string | null = null;

  constructor(private readonly router: Router) {}

  toggleSection(id: string): void {
    this.expandedSectionId = this.expandedSectionId === id ? null : id;
  }

  navigateTo(routerLink: string): void {
    void this.router.navigateByUrl(routerLink);
    this.closeDrawer.emit();
  }

  trackById(_index: number, section: NavMenuSection): string {
    return section.id;
  }

  trackByRoute(_index: number, item: { routerLink: string }): string {
    return item.routerLink;
  }
}
