// ─── Sparklines response (Edge Function: stats-finanzas-sparklines) ───────────

export interface FinanzasSparklinesResponse {
  meses: Array<{ mes: string; label: string; es_mes_actual: boolean }>;
  /** 6 valores oldest→newest */
  utilidad: number[];
  ingresos: number[];
  /** egresos totales (operativos + nomina) */
  egresos: number[];
  nomina: number[];
  /** running balance al cierre de cada mes */
  caja: number[];
}

// ─── Caja response (Edge Function: stats-finanzas-caja) ───────────────────────

export interface CajaConsolidada {
  semilla_cop: number;
  semilla_fecha: string;              // ISO YYYY-MM-DD
  ingresos_consolidados_cop: number;
  egresos_operativos_cop: number;
  nomina_pagada_cop: number;
  saldo_cop: number;                  // puede ser negativo
}

export interface CajaMenor {
  quincena_inicio: string;            // ISO
  quincena_label: string;             // "Q1 Mayo 2026" | "Q2 Mayo 2026"
  total_cop: number;
  cantidad_pagos: number;
}

export interface FinanzasCajaResponse {
  caja_consolidada: CajaConsolidada;
  caja_menor: CajaMenor;
}

// ─── Resumen response (Edge Function: stats-finanzas-resumen) ─────────────────

/**
 * Métrica base compartida por todas las secciones del resumen.
 * `delta_pct` es null cuando el mes anterior fue $0 (evita división por cero).
 */
interface ResumenMetricBase {
  total_cop: number;
  delta_cop: number;
  delta_pct: number | null;
}

/**
 * Métrica unificada que agrupa los tres tipos de conteo opcionales.
 * Cada métrica concreta usa solo uno de ellos; los demás quedan undefined.
 * Consolidar en una sola interfaz simplifica los helpers del componente.
 */
export interface ResumenMetric extends ResumenMetricBase {
  cantidad_pagos?: number;      // ingresos
  cantidad_registros?: number;  // egresos operativos
  cantidad_cierres?: number;    // nómina
}

export interface UtilidadMetric extends ResumenMetricBase {
  es_positiva: boolean;
}

export interface FinanzasResumenResponse {
  ingresos: ResumenMetric;
  egresos_operativos: ResumenMetric;
  nomina: ResumenMetric;
  utilidad: UtilidadMetric;
  mes_completo: boolean;
}

// ─── Tendencia response (Edge Function: stats-finanzas-tendencia) ──────────────

export interface FinanzasTendenciaPunto {
  mes: string;                      // "2026-04"
  label: string;                    // "Abr 26"
  ingresos_cop: number;
  egresos_operativos_cop: number;
  nomina_cop: number;
  egresos_totales_cop: number;      // operativos + nomina (precalculado por el backend)
  utilidad_cop: number;             // ingresos - egresos_totales (puede ser negativo)
  es_mes_actual: boolean;
}

export type FinanzasTendenciaResponse = FinanzasTendenciaPunto[];

/** Ventanas temporales disponibles para la gráfica de tendencia de finanzas. */
export type VentanaTendenciaFin = 1 | 2 | 6;

// ─── Composición response (Edge Function: stats-finanzas-composicion) ──────────

/**
 * Fila base compartida por categoría y proveedor.
 * Los discriminadores específicos (`categoria_id`, `proveedor_id`, `emoji`)
 * se declaran en los tipos concretos para evitar `any` y mantener el tipo
 * estrecho en los puntos de uso.
 */
interface ComposicionRowBase {
  nombre: string;
  total_cop: number;
  /** 0–100 con 2 decimales, tal como lo entrega el backend. */
  porcentaje: number;
  cantidad: number;
}

/** Fila de la vista "Por categoría". `emoji` es opcional: el backend lo omite si la categoría no lo tiene. */
export interface ComposicionCategoriaRow extends ComposicionRowBase {
  /** El id discriminador de categoría — puede ser un UUID o el literal `'nomina'`. */
  categoria_id: string;
  emoji: string;
}

/** Fila de la vista "Por proveedor". No tiene emoji. */
export interface ComposicionProveedorRow extends ComposicionRowBase {
  proveedor_id: string;
}

export interface FinanzasComposicionResponse {
  por_categoria: ComposicionCategoriaRow[];
  por_proveedor: ComposicionProveedorRow[];
  total_egresos_cop: number;
  tiene_datos: boolean;
}

// ─── Detalle response (Edge Function: stats-finanzas-detalle) ─────────────────

export type DetalleQuincenaEstado = 'completa' | 'parcial' | 'no_iniciada';

export interface DetalleQuincena {
  total_cop: number;
  cantidad_pagos: number;
  estado: DetalleQuincenaEstado;
}

export type MetodoPago = 'cash' | 'transfer' | 'nequi' | 'other';

export interface DetalleMetodoPago {
  metodo: MetodoPago;
  label: string;
  total_cop: number;
  cantidad_pagos: number;
  /** 0–100 con 2 decimales, tal como lo entrega el backend. */
  porcentaje: number;
}

export interface FinanzasDetalleResponse {
  quincenas: { q1: DetalleQuincena; q2: DetalleQuincena };
  por_metodo: DetalleMetodoPago[];
  total_ingresos_cop: number;
  tiene_datos: boolean;
}
