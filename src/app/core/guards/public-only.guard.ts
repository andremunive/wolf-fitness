import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, switchMap, take } from 'rxjs';

import { AuthService } from '../services/auth.service';

/**
 * Guard para rutas "solo público" como `/auth/login`.
 *
 * Si el usuario ya tiene sesión válida y no le falta rotar contraseña,
 * se redirige al home. Si le falta rotarla, se deja pasar al `firstLoginGuard`
 * decidir (vía un redirect que emite esta misma guard).
 */
export const publicOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.ready$.pipe(
    switchMap(() => auth.profile$.pipe(take(1))),
    map((profile): boolean | UrlTree => {
      if (!profile) {
        return true;
      }
      if (!profile.is_active) {
        // Sesión residual de un usuario desactivado — dejamos entrar al login,
        // la propia página se encarga de invalidarla y mostrar el mensaje.
        return true;
      }
      if (profile.password_change_required) {
        return router.createUrlTree(['/auth/cambiar-clave']);
      }
      return router.createUrlTree(['/app/home']);
    })
  );
};
