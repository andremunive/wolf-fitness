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
 * - delta = pendientes_hoy - pendientes_al_cierre_del_mes_anterior.
 *   Semántica invertida en UI (más pendientes = peor / chip rojo).
 */
export interface PendientesBreakdown {
  total: number;
  plan_6d: number;
  plan_3d: number;
  delta: number;
}

/**
 * Breakdown de clientes con mensualidad por vencer en ≤ 5 días.
 * Solo clientes con status='paid' cuyo period_end cae en [ref, ref + 5 días].
 * delta comparado contra el snapshot al cierre del mes anterior (semántica
 * invertida: más por vencer = peor).
 */
export interface PorVencerBreakdown {
  total: number;
  plan_6d: number;
  plan_3d: number;
  delta: number;
}

/**
 * Breakdown de clientes que no renovaron su mensualidad este mes.
 * Solo clientes con status='paid' cuyo period_end vencio en [som, ref - 1].
 * Delta comparado contra snapshot al cierre del mes anterior (mismo criterio
 * aplicado a la ventana del mes previo). Semántica invertida.
 */
export interface NoRenovaronBreakdown {
  total: number;
  plan_6d: number;
  plan_3d: number;
  delta: number;
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
 * - por_vencer: clientes con mensualidad por vencer en ≤ 5 días.
 * - no_renovaron: clientes cuya mensualidad venció este mes y no renovaron.
 * - perdidos: clientes activos el mes anterior sin pago en el mes actual.
 */
export interface ClientesQuincenalCards {
  q1: QuincenaBreakdown;
  q2: QuincenaBreakdown;
  pendientes:   PendientesBreakdown;
  por_vencer:   PorVencerBreakdown;
  no_renovaron: NoRenovaronBreakdown;
  perdidos:     PerdidosBreakdown;
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

// ─── Stats Origen Detalle (modal) ─────────────────────────────────────────────

/**
 * Valor del origen tal como está en `clients.origin` (BD).
 * En la UI se mapean así:
 *   publicidad → "Publicidad"
 *   llego_solo → "Directos"
 *   referido   → "Recomendación"
 */
export type OrigenDbKey = 'publicidad' | 'llego_solo' | 'referido';

/** Resumen del modal de detalle por origen. */
export interface OrigenResumen {
  total:   number;
  plan_6d: number;
  plan_3d: number;
  /** current_month_total_up_to_ref - full_prev_month_total. */
  delta:   number;
}

/** Fila del breakdown por entrenador. */
export interface OrigenEntrenadorRow {
  /** null cuando el cliente no tiene entrenador asignado. */
  entrenador_id: string | null;
  nombre:        string;
  total_actual:  number;
  total_prev:    number;
  delta:         number;
}

/** Fila individual de cliente captado por el origen en el mes seleccionado. */
export interface OrigenClienteRow {
  cliente_id:      string;
  nombre:          string;
  plan:            EnRiesgoPlan;    // reutiliza el union '6d' | '3d'
  entrenador:      string;          // '' si sin asignar
  fecha_inicio:    string;          // YYYY-MM-DD (fecha del primer pago)
  /**
   * Nombre completo de la persona que recomendó al cliente
   * (`clients.referred_by → profiles.full_name`). Solo relevante para
   * origen 'referido'; para los demás origenes viene `null`.
   */
  recomendado_por: string | null;
}

/** Respuesta completa de la Edge Function `stats-clients-origen-detalle`. */
export interface OrigenDetalleResponse {
  resumen:        OrigenResumen;
  por_entrenador: OrigenEntrenadorRow[];
  clientes:       OrigenClienteRow[];
}

// ─── Stats Cartera Detalle (modal Seguimiento de cartera) ─────────────────────

/** Cohorte de la sección "Seguimiento de cartera". */
export type CarteraCohortKey = 'pendientes' | 'por_vencer' | 'no_renovaron';

/** Resumen del modal de detalle de cartera (misma forma que origen). */
export interface CarteraResumen {
  total:   number;
  plan_6d: number;
  plan_3d: number;
  delta:   number;
}

/** Fila del breakdown por entrenador (misma forma que origen). */
export interface CarteraEntrenadorRow {
  entrenador_id: string | null;
  nombre:        string;
  total_actual:  number;
  total_prev:    number;
  delta:         number;
}

/**
 * Fila individual de cliente en la cohorte de cartera.
 * Extiende la forma de origen con `debe_cop` (saldo pendiente) y `vence_el`
 * (period_end del último pago; usado en la cohorte 'por_vencer').
 */
export interface CarteraClienteRow {
  cliente_id:   string;
  nombre:       string;
  plan:         EnRiesgoPlan;
  entrenador:   string;
  fecha_inicio: string;         // YYYY-MM-DD (primer pago del cliente)
  debe_cop:     number;         // balance_cop del último pago no anulado
  vence_el:     string | null;  // YYYY-MM-DD (period_end del último pago)
}

/** Respuesta de la Edge Function `stats-clients-cartera-detalle`. */
export interface CarteraDetalleResponse {
  resumen:        CarteraResumen;
  por_entrenador: CarteraEntrenadorRow[];
  clientes:       CarteraClienteRow[];
}

// Tipos del dashboard de estadísticas
