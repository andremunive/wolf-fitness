import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error';
  message: string;
  duration: number;
}

const DEFAULT_DURATION_MS = 2500;

/**
 * Lightweight toast/snackbar service.
 * Components push messages; ToastHostComponent listens and renders them.
 * No external dependencies — intentionally kept minimal.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private counter = 0;

  /** Stream of toasts to add to the stack. */
  readonly add$ = new Subject<ToastMessage>();
  /** Stream of toast IDs to remove from the stack. */
  readonly remove$ = new Subject<number>();

  success(message: string, duration = DEFAULT_DURATION_MS): void {
    this.push('success', message, duration);
  }

  error(message: string, duration = DEFAULT_DURATION_MS): void {
    this.push('error', message, duration);
  }

  dismiss(id: number): void {
    this.remove$.next(id);
  }

  private push(type: 'success' | 'error', message: string, duration: number): void {
    this.counter += 1;
    this.add$.next({ id: this.counter, type, message, duration });
  }
}
