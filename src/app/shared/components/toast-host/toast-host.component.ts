import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ToastMessage, ToastService } from '../../services/toast.service';

/**
 * Renders the active toast stack.
 * Mount once inside app-shell so it covers the full app.
 *
 * Positioning: fixed bottom-center on mobile, bottom-right on desktop (≥ 640 px).
 * Toasts stack vertically (newest on top). Each auto-dismisses after its duration.
 */
@Component({
  selector: 'app-toast-host',
  templateUrl: './toast-host.component.html',
  styleUrls: ['./toast-host.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToastHostComponent implements OnInit, OnDestroy {
  toasts: ToastMessage[] = [];

  private readonly destroy$ = new Subject<void>();
  /** Map of toast id → auto-dismiss timer handle. */
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.toastService.add$
      .pipe(takeUntil(this.destroy$))
      .subscribe((toast) => {
        this.toasts = [...this.toasts, toast];
        this.cdr.markForCheck();

        // Schedule auto-dismiss.
        const timer = setTimeout(() => {
          this.remove(toast.id);
        }, toast.duration);
        this.timers.set(toast.id, timer);
      });

    this.toastService.remove$
      .pipe(takeUntil(this.destroy$))
      .subscribe((id) => {
        this.remove(id);
      });
  }

  dismiss(id: number): void {
    this.toastService.dismiss(id);
  }

  trackById(_index: number, toast: ToastMessage): number {
    return toast.id;
  }

  private remove(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
