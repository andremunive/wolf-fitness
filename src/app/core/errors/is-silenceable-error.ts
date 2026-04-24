/**
 * Decides if an error is "noise" that Wolf Fitness wants to swallow:
 * - Errors injected by browser extensions / obfuscated third-party scripts.
 * - A known bug inside `@supabase/gotrue-js` where `_startAutoRefresh`
 *   wraps a rejection whose value is null/undefined, producing
 *   `TypeError: can't access property "stack"` in Firefox. The auth
 *   session still refreshes correctly; only the console gets polluted.
 *
 * Real app errors (including other Supabase/network/auth errors) go
 * through unchanged.
 */
export function isSilenceableError(error: unknown): boolean {
  if (error === null || error === undefined) {
    return true;
  }

  const unwrapped = unwrapRejection(error);
  const haystack = collectHaystack(unwrapped);

  if (!haystack.trim()) {
    return false;
  }

  // Extension / obfuscated noise
  if (/_0x[a-f0-9]{3,}/i.test(haystack)) return true;
  if (/\beval\s*(?::|\/|@)/i.test(haystack)) return true;
  if (haystack.includes('chrome-extension://')) return true;
  if (haystack.includes('moz-extension://')) return true;
  if (haystack.includes('safari-extension://')) return true;

  // Known gotrue-js auto-refresh null-stack bug
  const isStackNullError =
    /can't access property "stack"/i.test(haystack) ||
    /cannot read propert(?:y|ies) of null \(reading 'stack'\)/i.test(haystack) ||
    /undefined is not an object \(evaluating '.*\.stack'\)/i.test(haystack);

  const comesFromGotrue =
    haystack.includes('GoTrueClient') ||
    haystack.includes('_startAutoRefresh') ||
    haystack.includes('locks.js') ||
    haystack.includes('_navigatorLock') ||
    haystack.includes('_recoverAndRefresh');

  if (isStackNullError && comesFromGotrue) return true;

  return false;
}

function unwrapRejection(error: unknown): unknown {
  if (error && typeof error === 'object') {
    const maybe = error as { rejection?: unknown; promise?: unknown; reason?: unknown };
    if ('rejection' in maybe && maybe.rejection !== undefined) return maybe.rejection;
    if ('reason' in maybe && maybe.reason !== undefined) return maybe.reason;
  }
  return error;
}

function collectHaystack(error: unknown): string {
  if (error === null || error === undefined) return '';

  if (typeof error === 'string') return error;

  if (typeof error === 'object') {
    const e = error as {
      message?: unknown;
      stack?: unknown;
      filename?: unknown;
      source?: unknown;
      name?: unknown;
    };
    return [e.name, e.message, e.stack, e.filename, e.source]
      .map(safeString)
      .join('\n');
  }

  return safeString(error);
}

function safeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return String(value);
  } catch {
    return '';
  }
}
