import { ErrorHandler, Injectable } from '@angular/core';

import { isSilenceableError } from './is-silenceable-error';

/**
 * Swallows noise captured by Zone.js / Angular's default ErrorHandler.
 * Criteria live in `isSilenceableError` so the same rules apply to the
 * native `unhandledrejection` / `error` listeners installed in `main.ts`.
 */
@Injectable()
export class GlobalErrorHandler extends ErrorHandler {
  override handleError(error: unknown): void {
    if (isSilenceableError(error)) {
      return;
    }
    super.handleError(error);
  }
}
