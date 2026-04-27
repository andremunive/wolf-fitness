import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Observable } from 'rxjs';

import { LoaderService } from 'src/app/core/services/loader.service';

@Component({
  selector: 'app-global-loader',
  templateUrl: './global-loader.component.html',
  styleUrls: ['./global-loader.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GlobalLoaderComponent {
  readonly visible$: Observable<boolean> = this.loader.visible$;

  constructor(private readonly loader: LoaderService) {}
}
