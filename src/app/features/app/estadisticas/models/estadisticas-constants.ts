/**
 * Constantes compartidas entre los dashboards de estadísticas (clientes y finanzas).
 * Centraliza valores que estaban duplicados en ambos componentes.
 */

// ─── Etiquetas de mes ─────────────────────────────────────────────────────────

export const MESES_CORTOS: string[] = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
];

/**
 * MONTH_NAMES_ES ya existe en `closures/models/closure.model.ts` (capitalizado)
 * y en `expense-records/models/expense-record.model.ts`.
 * Re-exportamos desde la fuente canónica para no duplicar; los consumidores
 * dentro del feature estadisticas deben importar desde aquí.
 */
export { MONTH_NAMES_ES as MESES_COMPLETOS } from 'src/app/features/app/closures/models/closure.model';

// ─── Colores de series financieras ───────────────────────────────────────────

/** Verde esmeralda — ingresos / clientes activos / resultados positivos. */
export const COLOR_INGRESOS  = '#10b981';

/** Rojo — egresos / pérdidas / alertas críticas. */
export const COLOR_EGRESOS   = '#dc2626';

/** Teal (color de marca) — utilidad / caja / brand. */
export const COLOR_UTILIDAD  = '#228d9f';

/** Índigo — nómina pagada. */
export const COLOR_NOMINA    = '#6366f1';

// ─── Colores de planes ────────────────────────────────────────────────────────

/** Color brand para plan 6 días. */
export const COLOR_PLAN_6D = '#228d9f';

/** Cyan-300 para plan 3 días. */
export const COLOR_PLAN_3D = '#67e8f9';

// ─── Colores de composición (paleta determinista) ─────────────────────────────

/**
 * Paleta rotativa para secciones de composición (categorías, proveedores, etc.).
 * Usar `COMPOSICION_COLORS[i % COMPOSICION_COLORS.length]`.
 */
export const COMPOSICION_COLORS: string[] = [
  '#228d9f',
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
  '#f97316',
  '#0ea5e9',
  '#84cc16',
  '#a855f7'
];
