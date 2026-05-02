import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostListener,
  OnDestroy
} from '@angular/core';

import { BodyScrollLockService } from 'src/app/core/services/body-scroll-lock.service';

/**
 * Modal accessibility helper applied to the inner sheet of any modal:
 *
 * - Traps Tab / Shift+Tab inside the host so focus cannot escape.
 * - Moves focus to the first focusable child on init.
 * - Closes the host on Escape via a CustomEvent "appFocusTrapEscape".
 * - Locks <body> scroll while the host is mounted (via BodyScrollLockService),
 *   to prevent scroll-chaining onto the page underneath on mobile.
 *
 * Usage:
 *   <div appFocusTrap (appFocusTrapEscape)="close()">…</div>
 *
 * Note: we use a CustomEvent on the host element rather than an @Output because
 * this directive is applied to arbitrary elements and the parent template
 * already wires the close logic via (appFocusTrapEscape).
 */
@Directive({
  selector: '[appFocusTrap]'
})
export class FocusTrapDirective implements AfterViewInit, OnDestroy {
  private readonly focusableSelectors =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  constructor(
    private readonly el: ElementRef<HTMLElement>,
    private readonly bodyScrollLock: BodyScrollLockService
  ) {
    // Lock body scroll as soon as the directive is instantiated. Modals are
    // mounted via *ngIf, so the directive constructor runs only when the
    // modal opens — the lock is released in ngOnDestroy when *ngIf flips.
    this.bodyScrollLock.lock();
  }

  ngAfterViewInit(): void {
    // Defer one tick so Angular has time to render any *ngIf children.
    setTimeout(() => {
      const first = this.focusableElements[0];
      if (first) {
        (first as HTMLElement).focus();
      }
    }, 0);
  }

  ngOnDestroy(): void {
    this.bodyScrollLock.unlock();
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.el.nativeElement.dispatchEvent(
        new CustomEvent('appFocusTrapEscape', { bubbles: true })
      );
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = this.focusableElements;
    if (focusable.length === 0) return;

    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;

    if (event.shiftKey) {
      // Shift+Tab: if we are on the first element, wrap to last.
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      // Tab: if we are on the last element, wrap to first.
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  private get focusableElements(): Element[] {
    return Array.from(
      this.el.nativeElement.querySelectorAll<HTMLElement>(this.focusableSelectors)
    ).filter((el) => !el.closest('[hidden]') && el.offsetParent !== null);
  }
}
