import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostListener,
  OnDestroy
} from '@angular/core';

/**
 * Traps keyboard focus within the host element and closes it on Escape.
 *
 * Usage:
 *   <div appFocusTrap (appFocusTrapEscape)="close()">…</div>
 *
 * The directive:
 * - Moves focus to the first focusable child on init.
 * - Prevents Tab / Shift+Tab from leaving the trap boundary.
 * - Emits via the native CustomEvent "appFocusTrapEscape" so the host
 *   can listen with Angular's (appFocusTrapEscape) event binding.
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

  constructor(private readonly el: ElementRef<HTMLElement>) {}

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
    // Nothing to clean up — HostListeners are removed automatically.
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
