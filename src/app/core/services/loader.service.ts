import { Injectable } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router
} from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class LoaderService {
  private readonly counter$ = new BehaviorSubject<number>(0);

  readonly visible$: Observable<boolean> = this.counter$.pipe(
    map((count) => count > 0),
    distinctUntilChanged()
  );

  constructor(private readonly router: Router) {}

  bindToRouter(): void {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.show();
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.hide();
      }
    });
  }

  show(): void {
    this.counter$.next(this.counter$.value + 1);
  }

  hide(): void {
    this.counter$.next(Math.max(0, this.counter$.value - 1));
  }

  reset(): void {
    this.counter$.next(0);
  }
}

export function loaderInitializerFactory(loader: LoaderService): () => void {
  return () => loader.bindToRouter();
}
