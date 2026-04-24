import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, take } from 'rxjs';

import { AuthService } from '../services/auth.service';

/**
 * Guard para rutas privadas (`/app/**`).
 *
 * Exige:
 *  - Sesión activa.
 *  - Profile cargable.
 *  - `is_active = true`.
 *  - `password_change_required = false`.
 *
 * Si falta sesión → `/auth/login`.
 * Si `password_change_required = true` → `/auth/cambiar-clave`.
 * Si `is_active = false` → cierra sesión y vuelve a `/auth/login`.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.profile$.pipe(
    take(1),
    map((profile): boolean | UrlTree => {
      if (!profile) {
        return router.createUrlTree(['/auth/login']);
      }
      if (!profile.is_active) {
        // El usuario tiene sesión pero está desactivado — forzamos logout.
        void auth.signOut().toPromise();
        return router.createUrlTree(['/auth/login'], {
          queryParams: { reason: 'inactive' }
        });
      }
      if (profile.password_change_required) {
        return router.createUrlTree(['/auth/cambiar-clave']);
      }
      return true;
    })
  );
};
