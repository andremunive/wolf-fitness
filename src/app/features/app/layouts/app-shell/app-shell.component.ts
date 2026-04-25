import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Observable } from 'rxjs';

import { AuthService } from 'src/app/core/services/auth.service';
import { Profile } from 'src/app/core/types/supabase';

@Component({
  selector: 'app-shell',
  templateUrl: './app-shell.component.html',
  styleUrls: ['./app-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppShellComponent {
  readonly profile$: Observable<Profile | null> = this.auth.profile$;

  constructor(private readonly auth: AuthService) {}
}
