/**
 * Utilities for working with Postgres `date` columns (YYYY-MM-DD strings).
 *
 * WHY this module exists:
 * `new Date('2026-04-26')` is parsed as UTC midnight by the JS spec. In
 * UTC-5 (Colombia) that resolves to 2026-04-25 19:00 local time, so any
 * locale-formatting call (toLocaleDateString, Angular date pipe, etc.) will
 * display the day before the intended date.
 *
 * These helpers bypass the problem by constructing Date objects using the
 * three-argument constructor, which always uses the local timezone.
 *
 * Do NOT use these helpers for `timestamptz` columns — those arrive as full
 * ISO strings that include the UTC offset and parse correctly with `new Date`.
 */

const DATE_LOCALE = 'es-CO';

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
};

/**
 * Converts a Postgres `date` string ('YYYY-MM-DD') to a local-timezone Date.
 *
 * @example
 * parseDateOnly('2026-04-26') // → Date representing 2026-04-26 00:00 local
 */
export function parseDateOnly(yyyymmdd: string): Date {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Formats a nullable Postgres `date` string for display in Colombian locale.
 * Returns '—' when the value is null or empty.
 *
 * @example
 * formatDateOnly('2026-04-26') // → '26 abr 2026'
 * formatDateOnly(null)         // → '—'
 */
export function formatDateOnly(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return parseDateOnly(dateStr).toLocaleDateString(DATE_LOCALE, DATE_FORMAT_OPTIONS);
}
