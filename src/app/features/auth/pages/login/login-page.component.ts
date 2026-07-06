import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';

import { AuthService } from 'src/app/core/services/auth.service';
import { SupabaseService } from 'src/app/core/services/supabase.service';

type LoginErrorKey = 'invalid_credentials' | 'inactive' | 'network' | 'generic';

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginPageComponent implements OnInit, OnDestroy {
  readonly form: FormGroup = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  submitting = false;
  errorKey: LoginErrorKey | null = null;
  showPassword = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly supabase: SupabaseService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Si el guard nos dejó llegar hasta acá pero venimos de una redirección
    // por "cuenta desactivada", mostramos el banner correspondiente.
    const reason = new URL(window.location.href).searchParams.get('reason');
    if (reason === 'inactive') {
      this.errorKey = 'inactive';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get email() {
    return this.form.controls['email'];
  }

  get password() {
    return this.form.controls['password'];
  }

  get errorMessage(): string | null {
    switch (this.errorKey) {
      case 'invalid_credentials':
        return 'El correo o la contraseña son incorrectos.';
      case 'inactive':
        return 'Tu cuenta está desactivada. Contacta al administrador.';
      case 'network':
        return 'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.';
      case 'generic':
        return 'Ocurrió un error inesperado. Intenta nuevamente en unos segundos.';
      default:
        return null;
    }
  }

  submit(): void {
    this.errorKey = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.submitting = true;
    this.form.disable({ emitEvent: false });

    this.auth
      .signIn(email, password)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ data, error }) => {
          if (error) {
            this.handleAuthError(error.message);
            return;
          }
          const userId = data.user?.id;
          if (!userId) {
            this.finishWithError('generic');
            return;
          }
          void this.finalizeLogin();
        },
        error: (err) => {
          console.error('[LoginPage] Auth exception:', err);
          this.finishWithError('network');
        }
      });
  }

  private async finalizeLogin(): Promise<void> {
    try {
      // refreshProfile() pobla AuthService.profile$ con el valor fresco ANTES
      // de que el authGuard de /app/home lo lea — si no, la navegación podría
      // rebotar por caché stale / race con el bootstrap del perfil.
      const profile = await firstValueFrom(this.auth.refreshProfile());

      if (!profile) {
        this.finishWithError('generic');
        return;
      }

      if (!profile.is_active) {
        // Sesión residual de un usuario desactivado: cerramos antes de avisar.
        await this.supabase.auth.signOut();
        this.finishWithError('inactive');
        return;
      }

      if (profile.password_change_required) {
        void this.router.navigate(['/auth/cambiar-clave']);
        return;
      }

      const destination = profile.role === 'csm' ? '/app/clientes' : '/app/home';
      void this.router.navigate([destination]);
    } catch (err) {
      console.error('[LoginPage] Exception en finalize:', err);
      this.finishWithError('network');
    }
  }

  private handleAuthError(rawMessage: string): void {
    const message = (rawMessage || '').toLowerCase();
    if (
      message.includes('invalid login') ||
      message.includes('invalid credentials') ||
      message.includes('email not confirmed') ||
      message.includes('invalid email')
    ) {
      this.finishWithError('invalid_credentials');
      return;
    }
    if (message.includes('fetch') || message.includes('network')) {
      this.finishWithError('network');
      return;
    }
    this.finishWithError('generic');
  }

  private finishWithError(key: LoginErrorKey): void {
    this.errorKey = key;
    this.submitting = false;
    this.form.enable({ emitEvent: false });
    this.cdr.markForCheck();
  }
}
