/** Valor del filtro global del dashboard: un UUID de entrenador o el literal 'todos'. */
export type EntrenadorFilter = string | 'todos';

/** Opción mínima para poblar el dropdown de entrenadores en el filtro global. */
export interface EntrenadorOption {
  id: string;
  fullName: string;
}

// ─── Stats Cards ──────────────────────────────────────────────────────────────

/**
 * Breakdown por tipo (A o B) para las tarjetas del dashboard de clientes.
 * - total: clientes en el tipo para el período actual.
 * - plan_6d / plan_3d: desglose por frecuencia de plan (suma = total).
 * - delta: diferencia respecto al mismo período del mes anterior (puede ser negativo).
 */
export interface ClientesActivosBreakdown {
  total: number;
  plan_6d: number;
  plan_3d: number;
  delta: number;
}

/**
 * Respuesta de la Edge Function `stats-clients-cards`.
 * - tipo_a: clientes que pagaron en el período [inicio_mes, fecha_referencia].
 * - tipo_b: clientes vigentes de mes anterior sin pago en el mes actual.
 * - total_activos_hoy: suma de tipo_a + tipo_b (FASE 4).
 * - total_clientes_sistema: universo total de clientes (deleted_at IS NULL)
 *     en el alcance del filtro (con filtro de entrenador → solo sus asignados).
 * - parciales_mes: cantidad de pagos con status='partial' (queda saldo > 0)
 *     recibidos en el mes en curso, filtrados por entrenador cuando aplica.
 */
export interface ClientesActivosCards {
  tipo_a: ClientesActivosBreakdown;
  tipo_b: ClientesActivosBreakdown;
  total_activos_hoy: ClientesActivosBreakdown;
  total_clientes_sistema: number;
  parciales_mes: number;
}

// ─── Stats Quincenal Cards ─────────────────────────────────────────────────────

/**
 * Breakdown de una quincena (Q1 o Q2) para las tarjetas del dashboard.
 * - total: clientes que pagaron en la quincena.
 * - plan_6d / plan_3d: desglose por frecuencia de plan (suma = total).
 * - delta: diferencia respecto a la misma quincena del mes anterior;
 *          null cuando la quincena aún no ha empezado (Q2 mientras hoy ≤ día 15).
 * - comparativa: 'completa' si la quincena ya cerró, 'parcial' si está en curso.
 */
export interface QuincenaBreakdown {
  total: number;
  plan_6d: number;
  plan_3d: number;
  delta: number | null;
  comparativa: 'parcial' | 'completa';
}

/**
 * Breakdown de clientes pendientes de pago al día de hoy.
 * No incluye delta (no hay período de comparación aplicable).
 */
export interface PendientesBreakdown {
  total: number;
  plan_6d: number;
  plan_3d: number;
}

/**
 * Breakdown de clientes perdidos (sin pago en el mes en curso vs. mes anterior).
 * - delta: diferencia respecto al mismo período del mes anterior.
 *          La UI invierte el signo: más perdidos = peor.
 */
export interface PerdidosBreakdown {
  total: number;
  plan_6d: number;
  plan_3d: number;
  delta: number;
}

/**
 * Respuesta de la Edge Function `stats-clients-quincenal`.
 * - q1: primera quincena del mes (días 1-15).
 * - q2: segunda quincena del mes (días 16-fin).
 * - pendientes: clientes con pago esperado pero aún no registrado.
 * - perdidos: clientes activos el mes anterior sin pago en el mes actual.
 */
export interface ClientesQuincenalCards {
  q1: QuincenaBreakdown;
  q2: QuincenaBreakdown;
  pendientes: PendientesBreakdown;
  perdidos: PerdidosBreakdown;
}

// ─── Stats Tendencia ──────────────────────────────────────────────────────────

/** Ventana temporal en meses para la gráfica de tendencia. */
export type VentanaTendencia = 1 | 2 | 6 | 12;

/**
 * Un punto de la serie temporal de tendencia de clientes.
 * - mes: "YYYY-MM" identifica el mes.
 * - label: etiqueta legible para el eje X ("Abr 26").
 * - total: clientes totales que pagaron en ese mes.
 * - plan_6d / plan_3d: desglose por frecuencia (suma = total).
 * - es_mes_actual: true si el mes está en curso al momento del corte.
 */
export interface TendenciaPoint {
  mes: string;
  label: string;
  total: number;
  plan_6d: number;
  plan_3d: number;
  es_mes_actual: boolean;
}

export type TendenciaResponse = TendenciaPoint[];

// ─── Stats Quincenal Tendencia ────────────────────────────────────────────────

/** Ventana temporal en meses para la gráfica de distribución quincenal. */
export type VentanaQuincenal = 1 | 2 | 3 | 6;

/** Estado de una quincena en el punto de la serie. */
export type QuincenaEstado = 'completa' | 'parcial' | 'no_iniciada';

/** Filtro de plan para la gráfica de distribución quincenal (solo UI, no va al servicio). */
export type PlanFilter = 'todos' | '6d' | '3d';

/**
 * Un punto de la serie temporal quincenal.
 * - mes: "YYYY-MM" identifica el mes.
 * - label: etiqueta legible para el eje X ("Abr 26").
 * - q1/q2_total: total de clientes que pagaron en cada quincena.
 * - q1/q2_plan_6d / plan_3d: desglose por frecuencia de plan.
 * - q1/q2_estado: estado del cierre de la quincena.
 * - es_mes_actual: true si el mes está en curso al momento del corte.
 */
export interface QuincenalTendenciaPoint {
  mes: string;
  label: string;
  q1_total: number;
  q1_plan_6d: number;
  q1_plan_3d: number;
  q1_estado: QuincenaEstado;
  q2_total: number;
  q2_plan_6d: number;
  q2_plan_3d: number;
  q2_estado: QuincenaEstado;
  es_mes_actual: boolean;
}

export type QuincenalTendenciaResponse = QuincenalTendenciaPoint[];

// ─── Stats Detalle ────────────────────────────────────────────────────────────

export type EnRiesgoEstado = 'pendiente' | 'por_vencer';
export type EnRiesgoPlan   = '6d' | '3d';

/**
 * Métricas de retención del mes en curso.
 * tasa es null cuando activos_mes_anterior === 0 (no hubo base para comparar).
 */
export interface RetencionMetric {
  tasa: number | null;
  activos_mes_anterior: number;
  repitieron_este_mes: number;
}

/**
 * Desglose por plan para cohortes (Nuevos y Recuperados).
 * delta = total_actual - total_mismo_rango_mes_anterior (puede ser negativo).
 */
export interface CohortBreakdown {
  total: number;
  plan_6d: number;
  plan_3d: number;
  delta: number;
}

/**
 * Origen de captación del cliente (enum `client_origin` en BD).
 *  - referido: vino por recomendación de otro cliente.
 *  - publicidad: llegó por una campaña publicitaria.
 *  - llego_solo: legacy → en UI se muestra como "Directos".
 */
export type ClientOrigin = 'referido' | 'publicidad' | 'llego_solo';

/**
 * Desglose de "nuevos este mes" agrupados por origen de captación.
 * Cada slot es la misma cohorte que `nuevos` pero filtrada por `clients.origin`.
 */
export interface NuevosPorOrigen {
  referido:   CohortBreakdown;
  publicidad: CohortBreakdown;
  llego_solo: CohortBreakdown;
}

/** Entrada de un cliente en riesgo (pago pendiente o por vencer). */
export interface EnRiesgoEntry {
  cliente_id: string;
  nombre: string;
  entrenador: string;   // cadena vacía si no tiene entrenador asignado
  plan: EnRiesgoPlan;
  ultimo_pago: string;  // ISO date YYYY-MM-DD
  vence_el: string;     // ISO date YYYY-MM-DD
  estado: EnRiesgoEstado;
}

/** Respuesta completa de la Edge Function `stats-clients-detalle`. */
export interface DetalleResponse {
  retencion: RetencionMetric;
  nuevos: CohortBreakdown;
  /** Subdivisión de `nuevos` por canal de captación (clients.origin). */
  nuevos_por_origen: NuevosPorOrigen;
  recuperados: CohortBreakdown;
  en_riesgo: EnRiesgoEntry[];
}

// Tipos del dashboard de estadísticas
