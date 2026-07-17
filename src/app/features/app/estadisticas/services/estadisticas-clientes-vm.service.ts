import { Injectable } from '@angular/core';
import { ChartData } from 'chart.js';

import {
  ClientesActivosCards,
  ClientesQuincenalCards,
  DetalleResponse,
  EnRiesgoEntry,
  QuincenaBreakdown,
  TendenciaResponse,
  QuincenalTendenciaResponse
} from '../models/estadisticas.model';

import {
  QuincenaCardVM,
  QuincenaKey,
  QuincenaEstado,
  QuincenaInicioInfo,
  PendientesVM,
  PerdidosVM,
  RetencionVM,
  RiesgoVM,
  VariacionVM,
  SeriesLegendRow
} from '../clientes/pages/clientes-dashboard/clientes-dashboard.component';

// Re-importamos los estados locales del componente (necesarios como parámetros).
// En el siguiente paso, cuando el componente los mueva a un archivo de modelos
// compartido, estas importaciones se actualizarán.
import {
  SparklineGeometryService
} from './sparkline-geometry.service';
import {
  GaugeGeometryService,
  GaugeGeometry
} from './gauge-geometry.service';

import {
  COLOR_PLAN_6D,
  COLOR_PLAN_3D,
  MESES_CORTOS,
  MESES_COMPLETOS
} from '../models/estadisticas-constants';

// ─── Colores de series (tendencia + distribución) ────────────────────────────

const COLOR_SERIE_TOTAL = '#228d9f';
const COLOR_SERIE_6D    = '#1a7080';
const COLOR_SERIE_3D    = '#67e8f9';

const COLOR_DIST_Q1 = '#228d9f';
const COLOR_DIST_Q2 = 'rgba(34, 141, 159, 0.55)';

/**
 * Paleta de avatares para clientes en riesgo.
 * Selección por nombre es determinista vía charCode.
 */
const AVATAR_PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#dbeafe', '#1e3a8a'],
  ['#dcfce7', '#14532d'],
  ['#fef3c7', '#78350f'],
  ['#fce7f3', '#831843'],
  ['#ede9fe', '#4c1d95'],
  ['#ffedd5', '#7c2d12'],
  ['#cffafe', '#155e75']
];

const SPARKLINE_VB_WIDTH  = 320;
const SPARKLINE_VB_HEIGHT = 60;

// ─── Servicio ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class EstadisticasClientesVmService {
  constructor(
    private readonly sparklineSvc: SparklineGeometryService,
    private readonly gaugeSvc: GaugeGeometryService
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 02 — Quincenas en curso
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Construye los VMs de las dos cards Q1 y Q2 a partir del response de la EF
   * `stats-clients-quincenal`.
   *
   * @param today          Fecha de referencia (hoy si el período es el mes en
   *                       curso, último día del mes si es un mes pasado).
   * @param isCurrentMonth `true` si el período visualizado es el mes en curso.
   *                       Cuando es `false`, ambas quincenas son 'completa' sin
   *                       importar el día del refDate.
   */
  buildQuincenaCards(
    data: ClientesQuincenalCards,
    today = new Date(),
    isCurrentMonth = true
  ): QuincenaCardVM[] {
    return [
      this.makeQuincenaCard('q1', data.q1, today, isCurrentMonth),
      this.makeQuincenaCard('q2', data.q2, today, isCurrentMonth)
    ];
  }

  private makeQuincenaCard(
    key: QuincenaKey,
    q: QuincenaBreakdown,
    today: Date,
    isCurrentMonth: boolean
  ): QuincenaCardVM {
    const estado     = this.deriveQuincenaEstado(key, q, today, isCurrentMonth);
    const rangeBadge = this.buildQuincenaRange(key, today);

    const total      = estado === 'no_iniciada' ? 0 : q.total;
    const plan6dVal  = estado === 'no_iniciada' ? 0 : q.plan_6d;
    const plan3dVal  = estado === 'no_iniciada' ? 0 : q.plan_3d;

    const pct6d = total > 0 ? Math.round((plan6dVal / total) * 100) : 0;
    const pct3d = total > 0 ? Math.round((plan3dVal / total) * 100) : 0;

    return {
      key,
      label: key === 'q1' ? 'Pagaron Q1' : 'Pagaron Q2',
      rangeBadge,
      estado,
      total,
      delta: estado === 'no_iniciada' ? null : q.delta,
      plan6d: {
        label:    'Plan 6 días',
        color:    COLOR_PLAN_6D,
        value:    plan6dVal,
        pct:      pct6d,
        widthPct: pct6d
      },
      plan3d: {
        label:    'Plan 3 días',
        color:    COLOR_PLAN_3D,
        value:    plan3dVal,
        pct:      pct3d,
        widthPct: pct3d
      },
      isParcial: estado === 'parcial',
      inicio: estado === 'no_iniciada' ? this.buildQuincenaInicio(today) : null
    };
  }

  private deriveQuincenaEstado(
    key: QuincenaKey,
    q: QuincenaBreakdown,
    today: Date,
    isCurrentMonth: boolean
  ): QuincenaEstado {
    // Períodos pasados: ambas quincenas están cerradas.
    if (!isCurrentMonth) return 'completa';

    const day = today.getDate();
    if (key === 'q1') return day >= 16 ? 'completa' : 'parcial';
    if (day <= 15 || q.delta === null) return 'no_iniciada';
    return 'parcial';
  }

  private buildQuincenaRange(key: QuincenaKey, today: Date): string {
    const mes = MESES_CORTOS[today.getMonth()];
    if (key === 'q1') return `1 — 15 ${mes}`;
    const ultimoDia = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return `16 — ${ultimoDia} ${mes}`;
  }

  private buildQuincenaInicio(today: Date): QuincenaInicioInfo {
    const dia16       = new Date(today.getFullYear(), today.getMonth(), 16);
    const todayMid    = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffMs      = dia16.getTime() - todayMid.getTime();
    const dias        = Math.max(0, Math.round(diffMs / 86_400_000));
    const countdownLabel = dias === 0 ? 'hoy' : dias === 1 ? 'en 1 día' : `en ${dias} días`;
    const variant: 'default' | 'warn' = dias <= 3 ? 'warn' : 'default';
    // MESES_COMPLETOS es la re-exportación de MONTH_NAMES_ES (capitalizado).
    return {
      fechaLabel: `16 de ${MESES_COMPLETOS[today.getMonth()].toLowerCase()}`,
      diasRestantes: dias,
      countdownLabel,
      variant
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 03 — Estado de cartera
  // ═══════════════════════════════════════════════════════════════════════════

  buildPendientesVM(data: ClientesQuincenalCards): PendientesVM {
    const p = data.pendientes;
    return {
      total: p.total,
      secondaryText: `6d: ${p.plan_6d} · 3d: ${p.plan_3d}`
    };
  }

  buildPerdidosVM(data: ClientesQuincenalCards): PerdidosVM {
    const p     = data.perdidos;
    const delta = p.delta;

    // Inversión semántica: más perdidos = peor (positivo = rojo).
    let pillClass: string;
    let pillArrow: string;
    if (delta > 0)      { pillClass = 'cv2-pill cv2-pill--down'; pillArrow = '↑'; }
    else if (delta < 0) { pillClass = 'cv2-pill cv2-pill--up';   pillArrow = '↓'; }
    else                { pillClass = 'cv2-pill cv2-pill--flat';  pillArrow = '→'; }

    return {
      total: p.total,
      delta,
      secondaryText: `6d: ${p.plan_6d} · 3d: ${p.plan_3d}`,
      valueColorClass: p.total > 0
        ? 'cv2-perdidos__value--danger'
        : 'cv2-perdidos__value--neutral',
      pillClass,
      pillArrow,
      pillAbs: Math.abs(delta)
    };
  }

  /**
   * Construye el VM de la card oscura de retención.
   * `today` se expone como parámetro para facilitar tests y el wrapper del componente.
   */
  buildRetencionVM(data: DetalleResponse, today: Date): RetencionVM {
    const ret              = data.retencion;
    const recuperadosTotal = data.recuperados.total;

    if (ret.tasa === null) {
      return {
        tasaLabel:      '—',
        tasaColorClass: 'cv2-retencion__value--null',
        ratioBadge:     `${ret.repitieron_este_mes} de ${ret.activos_mes_anterior}`,
        primaryLine:    'Sin datos del mes anterior',
        contextLine:    'No había clientes activos para comparar.',
        isNull:         true,
        recuperadosTotal
      };
    }

    const tasaPct   = ret.tasa;
    const tasaLabel = `${tasaPct.toFixed(1)}%`;

    let tasaColorClass: RetencionVM['tasaColorClass'];
    if (tasaPct >= 80)      tasaColorClass = 'cv2-retencion__value--good';
    else if (tasaPct >= 60) tasaColorClass = 'cv2-retencion__value--ok';
    else if (tasaPct >= 40) tasaColorClass = 'cv2-retencion__value--mid';
    else                    tasaColorClass = 'cv2-retencion__value--bad';

    const primaryLine = `${ret.repitieron_este_mes} de ${ret.activos_mes_anterior} clientes repitieron`;

    const prevMonthName = this.prevMonthName(today);
    let contextLine: string;
    if (ret.activos_mes_anterior === 1) {
      contextLine = `Solo había 1 cliente vigente en ${prevMonthName}`;
    } else if (ret.activos_mes_anterior === 0) {
      contextLine = 'Sin referencia del mes anterior';
    } else {
      contextLine = `De los ${ret.activos_mes_anterior} activos en ${prevMonthName}`;
    }

    return {
      tasaLabel,
      tasaColorClass,
      ratioBadge:  `${ret.repitieron_este_mes} de ${ret.activos_mes_anterior}`,
      primaryLine,
      contextLine,
      isNull: false,
      recuperadosTotal
    };
  }

  private prevMonthName(today: Date): string {
    const idx = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
    // MESES_COMPLETOS = MONTH_NAMES_ES (capitalizado), así que se devuelve en minúsculas.
    return MESES_COMPLETOS[idx].toLowerCase();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 04 — Tendencia
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calcula la variación entre el primer y último punto de la serie Total.
   * - Si solo hay 1 punto o el primer total es 0: N/A.
   */
  buildVariacion(puntos: TendenciaResponse): VariacionVM {
    if (!puntos || puntos.length < 2) {
      return { display: 'N/A', cssClass: 'cv2-var--null', mesInicialLabel: '' };
    }

    const prev           = puntos[0].total;
    const curr           = puntos[puntos.length - 1].total;
    const mesInicialLabel = puntos[0].label;

    if (prev === 0) {
      return { display: 'N/A', cssClass: 'cv2-var--null', mesInicialLabel };
    }

    const pct      = ((curr - prev) / Math.abs(prev)) * 100;
    const arrow    = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
    const cssClass: VariacionVM['cssClass'] =
      pct > 0 ? 'cv2-var--up' : pct < 0 ? 'cv2-var--down' : 'cv2-var--flat';

    const abs       = Math.abs(pct);
    const formatted = Number.isInteger(abs)
      ? abs.toLocaleString('es-CO', { maximumFractionDigits: 0 })
      : abs.toLocaleString('es-CO', { maximumFractionDigits: 1 });

    return { display: `${arrow} ${formatted}%`, cssClass, mesInicialLabel };
  }

  /**
   * Mini leyenda con barras min→max relativas al máximo global de las 3 series.
   */
  buildSeriesLegend(puntos: TendenciaResponse): SeriesLegendRow[] {
    if (!puntos || puntos.length === 0) return [];

    const totalVals = puntos.map((p) => p.total);
    const sixVals   = puntos.map((p) => p.plan_6d);
    const threeVals = puntos.map((p) => p.plan_3d);

    const tMax = Math.max(...totalVals);
    const sMin = Math.min(...sixVals);
    const sMax = Math.max(...sixVals);
    const eMin = Math.min(...threeVals);
    const eMax = Math.max(...threeVals);

    const globalMax = Math.max(tMax, sMax, eMax) || 1;

    return [
      {
        key: 'total',
        label: 'Total',
        color: COLOR_SERIE_TOTAL,
        minLabel: Math.min(...totalVals).toString(),
        maxLabel: tMax.toString(),
        widthPct: (tMax / globalMax) * 100
      },
      {
        key: '6d',
        label: 'Plan 6 días',
        color: COLOR_SERIE_6D,
        minLabel: sMin.toString(),
        maxLabel: sMax.toString(),
        widthPct: (sMax / globalMax) * 100
      },
      {
        key: '3d',
        label: 'Plan 3 días',
        color: COLOR_SERIE_3D,
        minLabel: eMin.toString(),
        maxLabel: eMax.toString(),
        widthPct: (eMax / globalMax) * 100
      }
    ];
  }

  /**
   * ChartData para la gráfica de barras agrupadas (Total / 6d / 3d).
   * Mes actual: opacidad 0.65 + asterisco en label.
   */
  buildTendenciaChartData(puntos: TendenciaResponse): ChartData<'bar'> {
    const labels = puntos.map((p) => (p.es_mes_actual ? `${p.label} *` : p.label));
    const bgFor  = (color: string, esActual: boolean): string =>
      esActual ? this.withAlpha(color, 0.65) : color;

    return {
      labels,
      datasets: [
        {
          label: 'Total',
          data: puntos.map((p) => p.total),
          backgroundColor: puntos.map((p) => bgFor(COLOR_SERIE_TOTAL, p.es_mes_actual)),
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.85,
          categoryPercentage: 0.7
        },
        {
          label: 'Plan 6d',
          data: puntos.map((p) => p.plan_6d),
          backgroundColor: puntos.map((p) => bgFor(COLOR_SERIE_6D, p.es_mes_actual)),
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.85,
          categoryPercentage: 0.7
        },
        {
          label: 'Plan 3d',
          data: puntos.map((p) => p.plan_3d),
          backgroundColor: puntos.map((p) => bgFor(COLOR_SERIE_3D, p.es_mes_actual)),
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.85,
          categoryPercentage: 0.7
        }
      ]
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 05 — Distribución por quincena
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ChartData para la gráfica de distribución quincenal (Q1 / Q2 por mes).
   * Q2 'no_iniciada' → null (espacio vacío en la barra).
   */
  buildDistribucionChartData(
    puntos: QuincenalTendenciaResponse,
    planFilter: 'todos' | '6d' | '3d'
  ): ChartData<'bar'> {
    const labels: string[]            = [];
    const values: (number | null)[]   = [];
    const bgColors: string[]          = [];

    const pickValue = (total: number, p6d: number, p3d: number): number =>
      planFilter === '6d' ? p6d : planFilter === '3d' ? p3d : total;

    for (const p of puntos) {
      // Q1
      labels.push(p.q1_estado === 'parcial' ? `${p.label} Q1 *` : `${p.label} Q1`);
      values.push(pickValue(p.q1_total, p.q1_plan_6d, p.q1_plan_3d));
      bgColors.push(
        p.q1_estado === 'parcial' ? this.withAlpha(COLOR_DIST_Q1, 0.65) : COLOR_DIST_Q1
      );

      // Q2
      labels.push(p.q2_estado === 'parcial' ? `${p.label} Q2 *` : `${p.label} Q2`);
      if (p.q2_estado === 'no_iniciada') {
        values.push(null);
        bgColors.push(COLOR_DIST_Q2);
      } else {
        values.push(pickValue(p.q2_total, p.q2_plan_6d, p.q2_plan_3d));
        bgColors.push(
          p.q2_estado === 'parcial'
            ? COLOR_DIST_Q2.replace('0.55)', '0.4)')
            : COLOR_DIST_Q2
        );
      }
    }

    return {
      labels,
      datasets: [
        {
          label: 'Clientes',
          data: values,
          backgroundColor: bgColors,
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.8,
          categoryPercentage: 0.85
        }
      ]
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 06 — Clientes en riesgo
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Construye los VMs de la tabla de clientes en riesgo.
   *
   * @param today Fecha de referencia usada para colorear la columna
   *              "vence el" (vencido / próximo / ok). Debe coincidir con el
   *              `fecha_referencia` enviado a la EF.
   */
  buildRiesgoVMs(entries: EnRiesgoEntry[], today = new Date()): RiesgoVM[] {
    return entries.map((e) => this.buildRiesgoVM(e, today));
  }

  private buildRiesgoVM(e: EnRiesgoEntry, today: Date): RiesgoVM {
    const iniciales      = this.extractInitials(e.nombre);
    const [bg, fg]       = this.avatarColor(e.nombre);
    const planLabel      = e.plan === '6d' ? '6 días' : '3 días';
    const planClass: RiesgoVM['planClass'] =
      e.plan === '6d' ? 'cv2-plan-badge--6d' : 'cv2-plan-badge--3d';
    const venceColorClass = this.deriveVenceColor(e.vence_el, today);
    const estadoLabel     = e.estado === 'pendiente' ? 'Pendiente' : 'Por vencer';
    const estadoClass: RiesgoVM['estadoClass'] =
      e.estado === 'pendiente'
        ? 'cv2-estado-badge--pendiente'
        : 'cv2-estado-badge--por-vencer';

    return {
      cliente_id:    e.cliente_id,
      nombre:        e.nombre,
      iniciales,
      avatarBg:      bg,
      avatarFg:      fg,
      entrenador:    e.entrenador || '—',
      plan:          e.plan,
      planLabel,
      planClass,
      ultimoPagoFmt: this.formatIsoDmy(e.ultimo_pago),
      venceElFmt:    this.formatIsoDmy(e.vence_el),
      venceColorClass,
      estadoLabel,
      estadoClass
    };
  }

  /**
   * Extrae iniciales del nombre.
   * "Jefry Salgado" → "JS", "Maria del Carmen Lopez" → "ML", "Juan" → "J".
   */
  private extractInitials(nombre: string): string {
    const parts = nombre.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    const first = parts[0].charAt(0);
    const last  = parts[parts.length - 1].charAt(0);
    return `${first}${last}`.toUpperCase();
  }

  /** Color de avatar determinista basado en el primer charCode del nombre. */
  private avatarColor(nombre: string): readonly [string, string] {
    const code = nombre.length > 0 ? nombre.charCodeAt(0) : 0;
    return AVATAR_PALETTE[code % AVATAR_PALETTE.length];
  }

  /**
   * Color de la fecha "vence_el":
   *  - Vencido (< hoy)   → cv2-vence--vencido
   *  - ≤ 7 días          → cv2-vence--proximo
   *  - > 7 días          → cv2-vence--ok
   */
  private deriveVenceColor(
    venceIso: string,
    today: Date
  ): RiesgoVM['venceColorClass'] {
    const parts = venceIso.split('-');
    if (parts.length !== 3) return 'cv2-vence--ok';
    const [y, m, d] = parts.map(Number);
    if (!y || !m || !d) return 'cv2-vence--ok';

    const vence   = new Date(y, m - 1, d);
    const hoyMid  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = Math.round((vence.getTime() - hoyMid.getTime()) / 86_400_000);

    if (diffDays < 0) return 'cv2-vence--vencido';
    if (diffDays <= 7) return 'cv2-vence--proximo';
    return 'cv2-vence--ok';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GAUGE (hero card derecha)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Construye la geometría del gauge de salud de cartera.
   * El ratio activos/total_sistema se calcula aquí para encapsular la lógica.
   */
  buildGauge(cards: ClientesActivosCards): GaugeGeometry {
    const activos   = cards.total_activos_hoy.total;
    const total     = cards.total_clientes_sistema;
    const rawRatio  = total === 0 ? 0 : activos / total;
    const ratio     = Math.min(Math.max(rawRatio, 0), 1);
    const pct       = Math.round(ratio * 100);
    const enMora    = Math.max(0, total - activos);

    // Textos contextuales del dominio de clientes.
    let grade: GaugeGeometry['grade'];
    let description: string;
    if (pct >= 80) {
      grade = 'EXCELENTE';
      description = `${activos} de ${total} clientes con pago al día. ${enMora} en mora.`;
    } else if (pct >= 60) {
      grade = 'BUENO';
      description = `Buen nivel de actividad. ${enMora} clientes requieren seguimiento.`;
    } else if (pct >= 40) {
      grade = 'REGULAR';
      description = 'Nivel ajustado. Revisar clientes pendientes.';
    } else {
      grade = 'CRÍTICO';
      description = 'Nivel crítico. Muchos clientes sin renovar.';
    }

    return this.gaugeSvc.build(ratio, undefined, { grade, description });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPARKLINE hero
  // ═══════════════════════════════════════════════════════════════════════════

  /** Sparkline grande del hero — usa la serie total de la tendencia. */
  buildHeroSparkline(puntos: TendenciaResponse) {
    return this.sparklineSvc.build(
      puntos.map((p) => p.total),
      SPARKLINE_VB_WIDTH,
      SPARKLINE_VB_HEIGHT
    );
  }

  // ─── Utilidades ───────────────────────────────────────────────────────────

  /** Convierte ISO YYYY-MM-DD → DD/MM/YYYY. */
  formatIsoDmy(iso: string): string {
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [yyyy, mm, dd] = parts;
    return `${dd}/${mm}/${yyyy}`;
  }

  /** Convierte un hex color a rgba con alpha dado. */
  private withAlpha(hex: string, alpha: number): string {
    const m = hex.replace('#', '');
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
