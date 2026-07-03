/**
 * Shared currency input utilities.
 *
 * WHY a dedicated module: these helpers are used in multiple cafeteria forms
 * (ventas, combos, installments) and were previously duplicated as private
 * methods on each component. Extracting them as pure functions makes them
 * independently testable and removes duplication.
 */

/**
 * Strips all non-numeric characters from a raw price string and returns the
 * integer value, or null if the input is empty / non-numeric.
 *
 * @example
 * parsePriceInput('$1.500') // → 1500
 * parsePriceInput('')       // → null
 */
export function parsePriceInput(value: string): number | null {
  const cleaned = value.replace(/[^0-9]/g, '');
  if (!cleaned) return null;
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

/**
 * Formats an integer COP amount for display in an input field.
 *
 * @example
 * formatPriceDisplay(1500) // → '$1.500'
 */
export function formatPriceDisplay(amount: number): string {
  return '$' + amount.toLocaleString('es-CO');
}
