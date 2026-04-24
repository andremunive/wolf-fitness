import { ChangeDetectionStrategy, Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subject, takeUntil } from 'rxjs';

import { AuthService } from 'src/app/core/services/auth.service';
import { Profile, UserRole } from 'src/app/core/types/supabase';

@Component({
  selector: 'app-home-page',
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomePageComponent implements OnDestroy {
  readonly profile$: Observable<Profile | null> = this.auth.profile$;
  signingOut = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  signOut(): void {
    if (this.signingOut) {
      return;
    }
    this.signingOut = true;

    this.auth
      .signOut()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => void this.router.navigate(['/auth/login']),
        error: (err) => {
          console.error('[HomePage] Error al cerrar sesión:', err);
          this.signingOut = false;
        }
      });
  }

  roleLabel(role: UserRole): string {
    switch (role) {
      case 'admin':
        return 'Administrador';
      case 'trainer':
        return 'Entrenador';
      case 'client':
        return 'Cliente';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
