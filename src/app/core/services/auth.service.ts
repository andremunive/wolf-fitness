import { Injectable, OnDestroy } from '@angular/core';
import { AuthError, Session } from '@supabase/supabase-js';
import {
  BehaviorSubject,
  Observable,
  Subject,
  defer,
  distinctUntilChanged,
  from,
  map,
  of,
  switchMap,
  takeUntil,
  tap
} from 'rxjs';

import { Profile } from '../types/supabase';
import { SupabaseService } from './supabase.service';

/**
 * Orquesta la sesión de Supabase Auth + el perfil de dominio (`profiles`).
 *
 * - `session$` refleja en tiempo real el estado de la sesión de Supabase.
 * - `profile$` es un BehaviorSubject actualizado automáticamente cuando cambia
 *   la sesión, y también manualmente vía `refreshProfile()` cuando un
 *   componente acaba de escribir en `profiles` y necesita que los guards vean
 *   el valor fresco (si no, `authGuard` leería caché stale y rebotaría).
 */
@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly sessionSubject = new BehaviorSubject<Session | null>(null);
  private readonly profileSubject = new BehaviorSubject<Profile | null>(null);

  readonly session$: Observable<Session | null> = this.sessionSubject
    .asObservable()
    .pipe(distinctUntilChanged((a, b) => a?.user.id === b?.user.id));

  readonly profile$: Observable<Profile | null> = this.profileSubject.asObservable();

  constructor(private readonly supabase: SupabaseService) {
    this.bootstrapSession();
    this.wireProfileToSession();
  }

  signIn(email: string, password: string) {
    return from(
      this.supabase.auth.signInWithPassword({ email: email.trim(), password })
    );
  }

  signOut() {
    return from(this.supabase.auth.signOut());
  }

  updatePassword(newPassword: string) {
    return from(this.supabase.auth.updateUser({ password: newPassword }));
  }

  /**
   * Baja el flag `password_change_required` a `false`. La RLS policy
   * `profiles_update_self` permite específicamente esta transición; cualquier
   * otra modificación de rol/email/is_active se bloquea server-side.
   */
  clearPasswordChangeFlag(userId: string) {
    return defer(() =>
      from(
        this.supabase.client
          .from('profiles')
          .update({ password_change_required: false })
          .eq('id', userId)
      )
    );
  }

  /**
   * Re-lee el profile del usuario activo y lo publica en `profile$`. Indispensable
   * llamarlo después de escribir en `profiles` (ej. al bajar el flag de cambio
   * de clave) — si no, los guards consumirían un profile cacheado stale.
   */
  refreshProfile(): Observable<Profile | null> {
    const session = this.sessionSubject.value;
    if (!session) {
      this.profileSubject.next(null);
      return of(null);
    }
    return this.fetchProfile(session.user.id).pipe(
      tap((profile) => this.profileSubject.next(profile))
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrapSession(): void {
    // Estado inicial desde el storage local del SDK.
    from(this.supabase.auth.getSession())
      .pipe(
        map(({ data }) => data.session ?? null),
        takeUntil(this.destroy$)
      )
      .subscribe((session) => this.sessionSubject.next(session));

    // Suscripción al stream de cambios. El SDK expone un `subscription.unsubscribe()`
    // que disparamos en destroy.
    const { data } = this.supabase.auth.onAuthStateChange((_event, session) => {
      this.sessionSubject.next(session ?? null);
    });

    this.destroy$.subscribe(() => data.subscription.unsubscribe());
  }

  private wireProfileToSession(): void {
    this.session$
      .pipe(
        switchMap((session) =>
          session ? this.fetchProfile(session.user.id) : of(null)
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((profile) => this.profileSubject.next(profile));
  }

  private fetchProfile(userId: string): Observable<Profile | null> {
    return from(
      this.supabase.client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
    ).pipe(
      map((response) => {
        if (response.error) {
          console.error('[AuthService] Error cargando profile:', response.error);
          return null;
        }
        return response.data as Profile;
      })
    );
  }
}

export type AuthResult = { ok: true } | { ok: false; error: AuthError | Error };
