import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, switchMap, take } from 'rxjs';

import { AuthService } from '../services/auth.service';

/**
 * Guard para `/auth/cambiar-clave`. Solo admite usuarios con sesión activa
 * cuyo profile tenga `password_change_required = true`. Cualquier otro caso
 * se redirige a donde corresponde.
 */
export const firstLoginGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.ready$.pipe(
    switchMap(() => auth.profile$.pipe(take(1))),
    map((profile): boolean | UrlTree => {
      if (!profile) {
        return router.createUrlTree(['/auth/login']);
      }
      if (!profile.is_active) {
        void auth.signOut().toPromise();
        return router.createUrlTree(['/auth/login'], {
          queryParams: { reason: 'inactive' }
        });
      }
      if (!profile.password_change_required) {
        return router.createUrlTree(['/app/home']);
      }
      return true;
    })
  );
};
