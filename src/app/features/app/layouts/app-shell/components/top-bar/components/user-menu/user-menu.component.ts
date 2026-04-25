import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy
} from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { AuthService } from 'src/app/core/services/auth.service';
import { Profile } from 'src/app/core/types/supabase';

/**
 * Avatar button that opens a dropdown with profile info, account settings
 * placeholder, and a functional sign-out action.
 *
 * Closes on any click outside the component via a document-level HostListener
 * that checks containment against the host ElementRef.
 */
@Component({
  selector: 'app-user-menu',
  templateUrl: './user-menu.component.html',
  styleUrls: ['./user-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserMenuComponent implements OnDestroy {
  @Input() profile: Profile | null = null;

  isOpen = false;
  signingOut = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly el: ElementRef<HTMLElement>
  ) {}

  get avatarInitial(): string {
    return this.profile?.full_name?.charAt(0).toUpperCase() ?? '?';
  }

  toggleMenu(): void {
    this.isOpen = !this.isOpen;
    this.cdr.markForCheck();
  }

  openAccountSettings(): void {
    // Placeholder — the account settings screen has not been built yet.
    console.log('TODO: navigate to account settings');
    this.isOpen = false;
    this.cdr.markForCheck();
  }

  signOut(): void {
    if (this.signingOut) {
      return;
    }
    this.signingOut = true;
    this.isOpen = false;
    this.cdr.markForCheck();

    this.auth
      .signOut()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => void this.router.navigate(['/auth/login']),
        error: (err) => {
          console.error('[UserMenu] Error al cerrar sesión:', err);
          this.signingOut = false;
          this.cdr.markForCheck();
        }
      });
  }

  /**
   * Closes the dropdown when the user clicks anywhere outside this component's
   * host element. The check uses `ElementRef` which is accurate and avoids
   * querying the DOM by selector.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) {
      return;
    }
    if (this.el.nativeElement.contains(event.target as Node)) {
      return;
    }
    this.isOpen = false;
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
