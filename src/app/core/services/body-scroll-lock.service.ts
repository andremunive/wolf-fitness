import { Injectable } from '@angular/core';

/**
 * Locks the document <body> scroll while modals/overlays are open.
 *
 * Why this exists: on iOS Safari, applying only `overflow: hidden` to body
 * (or `overscroll-behavior: contain` on the inner scroll container) does
 * NOT reliably prevent scroll-chaining. As soon as the user drags past the
 * top/bottom of the modal's inner scroll, the touch propagates to <body>
 * and scrolls the page underneath. The robust trick is to pin <body> with
 * `position: fixed` and a negative `top` equal to the saved scrollY — that
 * physically prevents the page from scrolling. On unlock, we restore the
 * saved styles and re-scroll the window to the original position.
 *
 * The service is counter-based so nested modals work correctly: scroll only
 * restores when the LAST modal closes.
 */
@Injectable({ providedIn: 'root' })
export class BodyScrollLockService {
  private lockCount = 0;
  private savedScrollY = 0;
  private savedBodyStyles: Record<string, string> = {};

  lock(): void {
    if (this.lockCount === 0) {
      this.savedScrollY = window.scrollY || window.pageYOffset || 0;

      const body = document.body;
      this.savedBodyStyles = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow
      };

      body.style.position = 'fixed';
      body.style.top = `-${this.savedScrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
    }
    this.lockCount++;
  }

  unlock(): void {
    if (this.lockCount === 0) return;
    this.lockCount--;

    if (this.lockCount === 0) {
      const body = document.body;
      body.style.position = this.savedBodyStyles['position'] || '';
      body.style.top = this.savedBodyStyles['top'] || '';
      body.style.left = this.savedBodyStyles['left'] || '';
      body.style.right = this.savedBodyStyles['right'] || '';
      body.style.width = this.savedBodyStyles['width'] || '';
      body.style.overflow = this.savedBodyStyles['overflow'] || '';

      window.scrollTo(0, this.savedScrollY);
    }
  }
}
