/**
 * Shared error-message extraction utility.
 *
 * WHY: the pattern of pulling `.message` off an unknown error is repeated
 * across multiple component classes. A single pure function avoids the copy.
 */

/**
 * Extracts a human-readable message from an unknown error value.
 * Falls back to a generic Spanish message when no `message` property exists.
 */
export function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, unknown>;
    if (typeof anyErr['message'] === 'string') return anyErr['message'];
  }
  return 'Ocurrió un error. Intenta de nuevo.';
}
