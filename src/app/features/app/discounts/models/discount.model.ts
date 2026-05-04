import { Discount, DiscountInsert, DiscountType, DiscountUpdate, DiscountValueType } from 'src/app/core/types/supabase';

// Re-exports for convenience within this feature.
export type { Discount, DiscountInsert, DiscountUpdate, DiscountType, DiscountValueType };

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  promocion: 'Promoción',
  personal: 'Personal'
};

export const DISCOUNT_TYPE_DESCRIPTIONS: Record<DiscountType, string> = {
  promocion: 'Lo absorbe el gimnasio. No afecta el cierre del entrenador.',
  personal: 'Lo asume el entrenador asignado al cliente. Se descuenta de su cierre quincenal.'
};

export const DISCOUNT_VALUE_TYPE_LABELS: Record<DiscountValueType, string> = {
  percentage: 'Porcentaje',
  fixed: 'Valor fijo'
};

/** Formats a discount value for display (e.g. "15%" or "$50.000"). */
export function formatDiscountValue(discount: Discount): string {
  if (discount.value_type === 'percentage') {
    return `${discount.percentage ?? 0}%`;
  }
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(discount.amount_cop ?? 0);
}

/** Formats a numeric value with es-CO thousands separators (no currency symbol). */
export function formatCopPlain(amount: number): string {
  return new Intl.NumberFormat('es-CO').format(amount);
}

/** Maps a PostgREST / trigger error to a Spanish message the admin can act on. */
export function mapDiscountErrorToMessage(error: { code?: string; message?: string }): string {
  const code = error.code ?? '';
  const message = error.message ?? '';

  // UNIQUE constraint on code column.
  if (code === '23505' || message.includes('discounts_code_key')) {
    return 'Ya existe un descuento con ese código.';
  }

  // Trigger BEFORE UPDATE: immutable fields violation (SQLSTATE P0001).
  if (code === 'P0001' && message.toLowerCase().includes('immutable')) {
    return 'No se puede modificar este descuento porque ya tiene pagos asociados.';
  }

  // Value consistency CHECK constraint.
  if (message.includes('discounts_value_consistency')) {
    return 'El descuento debe ser solo porcentaje o solo valor fijo.';
  }

  return message || 'Ocurrió un error al guardar el descuento.';
}
