import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';

import { AuthService } from 'src/app/core/services/auth.service';
import { SupabaseService } from 'src/app/core/services/supabase.service';

type ChangePasswordErrorKey = 'same_password' | 'network' | 'generic';

@Component({
  selector: 'app-change-password-page',
  templateUrl: './change-password-page.component.html',
  styleUrls: ['./change-password-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChangePasswordPageComponent implements OnDestroy {
  readonly form: FormGroup = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', [Validators.required]]
    },
    { validators: [this.matchValidator] }
  );

  submitting = false;
  errorKey: ChangePasswordErrorKey | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly supabase: SupabaseService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get password() {
    return this.form.controls['password'];
  }

  get confirm() {
    return this.form.controls['confirm'];
  }

  get mismatch(): boolean {
    return (
      this.form.hasError('mismatch') &&
      (this.confirm.touched || this.confirm.dirty)
    );
  }

  get errorMessage(): string | null {
    switch (this.errorKey) {
      case 'same_password':
        return 'La nueva contraseña no puede ser igual a la actual.';
      case 'network':
        return 'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.';
      case 'generic':
        return 'Ocurrió un error al actualizar tu contraseña. Intenta nuevamente.';
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

    const { password } = this.form.getRawValue();
    this.submitting = true;
    this.form.disable({ emitEvent: false });

    this.auth
      .updatePassword(password)
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
          // Fire-and-forget IIFE: aislamos el await para no perder errores
          // dentro del `next:` del subscribe.
          void this.finalizePasswordChange(userId);
        },
        error: (err) => {
          console.error('[ChangePassword] Exception:', err);
          this.finishWithError('network');
        }
      });
  }

  private async finalizePasswordChange(userId: string): Promise<void> {
    try {
      const { error: updateError } = await this.supabase.client
        .from('profiles')
        .update({ password_change_required: false })
        .eq('id', userId);

      if (updateError) {
        console.error('[ChangePassword] Error bajando flag:', updateError);
        this.finishWithError('generic');
        return;
      }

      // Refresca profile$ en AuthService ANTES de navegar — si no,
      // authGuard sobre /app/home leería caché stale y rebotaría aquí.
      const profile = await firstValueFrom(this.auth.refreshProfile());

      if (!profile) {
        this.finishWithError('generic');
        return;
      }

      if (profile.password_change_required) {
        // El UPDATE no se reflejó (posible RLS bloqueando silenciosamente).
        this.finishWithError('generic');
        return;
      }

      void this.router.navigate(['/app/home']);
    } catch (err) {
      console.error('[ChangePassword] Exception en finalize:', err);
      this.finishWithError('network');
    }
  }

  private handleAuthError(rawMessage: string): void {
    const message = (rawMessage || '').toLowerCase();
    if (message.includes('same') || message.includes('different from the old')) {
      this.finishWithError('same_password');
      return;
    }
    if (message.includes('fetch') || message.includes('network')) {
      this.finishWithError('network');
      return;
    }
    this.finishWithError('generic');
  }

  private finishWithError(key: ChangePasswordErrorKey): void {
    this.errorKey = key;
    this.submitting = false;
    this.form.enable({ emitEvent: false });
    this.cdr.markForCheck();
  }

  private matchValidator(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirm = group.get('confirm')?.value;
    if (!password || !confirm) {
      return null;
    }
    return password === confirm ? null : { mismatch: true };
  }
}
