import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Observable } from 'rxjs';

import { AuthService } from 'src/app/core/services/auth.service';
import { Profile, UserRole } from 'src/app/core/types/supabase';

@Component({
  selector: 'app-home-page',
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomePageComponent {
  readonly profile$: Observable<Profile | null> = this.auth.profile$;

  constructor(private readonly auth: AuthService) {}

  roleLabel(role: UserRole): string {
    switch (role) {
      case 'admin':
        return 'Administrador';
      case 'trainer':
        return 'Entrenador';
      case 'csm':
        return 'Customer Success';
      case 'client':
        return 'Cliente';
    }
  }

  /** Returns the first word of the user's full name for the greeting. */
  firstName(profile: Profile): string {
    const parts = profile.full_name.split(' ');
    return parts[0] ?? this.roleLabel(profile.role);
  }
}
