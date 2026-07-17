import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, switchMap, take } from 'rxjs';

import { UserRole } from '../types/supabase';
import { AuthService } from '../services/auth.service';

/**
 * Guard de rol para restringir rutas a roles específicos.
 *
 * Uso:
 *   canActivate: [roleGuard(['admin', 'trainer'])]
 *
 * Si el usuario no tiene sesión → redirige a `/auth/login`.
 * Si el usuario no tiene el rol requerido → redirige a `/app/home`.
 */
export function roleGuard(allowedRoles: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    // Esperar a `ready$` es clave cuando este guard corre como `canLoad`: en un
    // refresh directo, canLoad se evalúa antes del `authGuard` del padre, y
    // sin esperar el bootstrap leeríamos el `null` inicial del BehaviorSubject
    // y rebotaríamos al login.
    return auth.ready$.pipe(
      switchMap(() => auth.profile$.pipe(take(1))),
      map((profile): boolean | UrlTree => {
        if (!profile) {
          return router.createUrlTree(['/auth/login']);
        }
        if (!allowedRoles.includes(profile.role)) {
          return router.createUrlTree(['/app/home']);
        }
        return true;
      })
    );
  };
}
