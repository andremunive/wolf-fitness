import { Injectable } from '@angular/core';
import { ChartData } from 'chart.js';

import {
  formatAmountCop,
  formatAmountShort,
  PAYMENT_METHOD_LABELS
} from 'src/app/features/app/expense-records/models/expense-record.model';
import { SparklineGeometryService } from '../../services/sparkline-geometry.service';
import { GaugeGeometryService } from '../../services/gauge-geometry.service';

import {
  ComposicionIngresos,
  EgresosPorTipo,
  FinanzasCajaResponse,
  FinanzasComposicionResponse,
  FinanzasDetalleResponse,
  FinanzasResumenResponse,
  FinanzasTendenciaResponse,
  MetodoPago,
  VentanaTendenciaFin
} from '../models/finanzas.model';

import {
  COLOR_INGRESOS,
  COLOR_EGRESOS,
  COLOR_UTILIDAD,
  COLOR_NOMINA,
  COMPOSICION_COLORS,
  MESES_COMPLETOS
} from '../../models/estadisticas-constants';

// ─── Re-exportamos los tipos de geometría para que el componente los use ──────
export { SparklineGeometry } from '../../services/sparkline-geometry.service';
export { GaugeGeometry } from '../../services/gauge-geometry.service';

// ─── Vista de composición ─────────────────────────────────────────────────────

export type VistaComposicion = 'categoria' | 'proveedor' | 'origen_ingresos';

// ─── VM de cards ──────────────────────────────────────────────────────────────

export type CardKey = 'ingresos' | 'egresos' | 'nomina' | 'caja';
export type CardStatus = 'loading' | 'loaded' | 'error' | 'pre-app';

export interface CardVM {
  key: CardKey;
  label: string;
  color: string;
  status: CardStatus;
  value: number;
  /** null = no delta (caja, pre-app, primer mes). */
  delta: number | null;
  /** Si true, delta>0 = negativo (egresos/nómina). */
  deltaInverted: boolean;
  secondaryText: string;
  /** Caption alternativo al delta pill (ej. "Desde 30/04/2026"). */
  caption: string | null;
  sparkline: import('../../services/sparkline-geometry.service').SparklineGeometry | null;
  /** Id del gradient SVG para que múltiples sparklines no colisionen. */
  gradId: string;
}

// ─── Rows de listas ───────────────────────────────────────────────────────────

export interface MetodoPagoRow {
  metodo: MetodoPago;
  label: string;
  total_cop: number;
  cantidad_pagos: number;
  porcentaje: number;
  color: string;
  widthPct: number;
}

export interface ComposicionRow {
  id: string;
  nombre: string;
  total_cop: number;
  porcentaje: number;
  cantidad: number;
  color: string;
  widthPct: number;
}

export interface QuincenaRow {
  key: 'q1' | 'q2';
  label: string;
  total_cop: number;
  cantidad_pagos: number;
  estado: 'completa' | 'parcial' | 'no_iniciada';
  estadoLabel: string;
  estadoVariant: 'success' | 'warn' | 'muted';
  widthPct: number;
  barColor: string;
}

// ─── Desglose de egresos ──────────────────────────────────────────────────────

export type ExpenseType =
  | 'costo_directo'
  | 'gasto_operativo'
  | 'gasto_administrativo'
  | 'gasto_financiero'
  | 'inversion'
  | 'deuda';

export interface EgresosDesgloseRow {
  tipo: ExpenseType;
  label: string;
  total_cop: number;
  barWidthPct: number;
  badgeBg: string;
  badgeText: string;
  barFill: string;
}

// ─── Variación y leyenda de series ────────────────────────────────────────────

export interface VariacionUtilidad {
  pct: number | null;
  arrow: '↑' | '↓' | '→';
  display: string;
  cssClass: string;
  mesInicialLabel: string;
}

export interface SeriesLegendRow {
  key: 'ingresos' | 'egresos' | 'utilidad';
  label: string;
  color: string;
  minLabel: string;
  maxLabel: string;
  widthPct: number;
}

// ─── Estado shape mínimo que el servicio necesita conocer ────────────────────
// (El componente pasa los states completos; solo necesitamos el subconjunto usado aquí.)

interface StateWithData<T> { status: string; data: T | null; }

// ─── Constantes locales ───────────────────────────────────────────────────────

const SPARKLINE_VB_WIDTH  = 320;
const SPARKLINE_VB_HEIGHT = 60;

/** Mapea la ventana en N cantidad de puntos a tomar de la cola del array. */
const VENTANA_PUNTOS: Record<VentanaTendenciaFin, number> = {
  1: 2,
  2: 3,
  6: 7
};

/** Colores deterministas por método de pago. */
const METODO_COLORS: Record<MetodoPago, string> = {
  transfer: '#228d9f',
  cash:     '#10b981',
  nequi:    '#8b5cf6',
  other:    '#9ca3af'
};

interface ExpenseTypeMeta {
  label: string;
  badgeBg: string;
  badgeText: string;
  barFill: string;
}

const EXPENSE_TYPE_META: Record<ExpenseType, ExpenseTypeMeta> = {
  costo_directo:        { label: 'Costo directo',        badgeBg: '#d1fae5', badgeText: '#065f46', barFill: '#065f46' },
  gasto_operativo:      { label: 'Gasto operativo',      badgeBg: '#e0e7ff', badgeText: '#3730a3', barFill: '#3730a3' },
  gasto_administrativo: { label: 'Gasto administrativo', badgeBg: '#c7d2fe', badgeText: '#1e1b4b', barFill: '#1e1b4b' },
  gasto_financiero:     { label: 'Gasto financiero',     badgeBg: '#fee2e2', badgeText: '#7f1d1d', barFill: '#7f1d1d' },
  inversion:            { label: 'Inversión',            badgeBg: '#fef3c7', badgeText: '#92400e', barFill: '#92400e' },
  deuda:                { label: 'Deuda',                badgeBg: '#fecaca', badgeText: '#991b1b', barFill: '#991b1b' }
};

const COLOR_MENSUALIDADES   = '#10b981';
const COLOR_CAFETERIA_DONA  = '#f59e0b';

// ─── Servicio ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class FinanzasVmService {
  constructor(
    private readonly sparklineSvc: SparklineGeometryService,
    private readonly gaugeSvc: GaugeGeometryService
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // HERO SPARKLINE
  // ═══════════════════════════════════════════════════════════════════════════

  /** Sparkline grande del hero — serie de utilidad, dimensiones 320×60. */
  buildHeroSparkline(puntos: FinanzasTendenciaResponse) {
    return this.sparklineSvc.build(
      puntos.map((p) => p.utilidad_cop),
      SPARKLINE_VB_WIDTH,
      SPARKLINE_VB_HEIGHT
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GAUGE — salud financiera
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Construye la geometría del gauge de salud financiera.
   * El ratio es utilidad/ingresos; cuando pct===100, el texto de descripción
   * indica que no hay egresos registrados (caso especial de finanzas).
   */
  buildGauge(resumen: FinanzasResumenResponse) {
    const ingresos = resumen.ingresos.total_cop;
    const utilidad = resumen.utilidad.total_cop;

    const rawRatio = ingresos === 0 ? 0 : utilidad / ingresos;
    const ratio    = Math.min(Math.max(rawRatio, 0), 1);
    const pct      = Math.round(ratio * 100);

    // Caso especial: 100% sin egresos registrados (lógica exclusiva de finanzas).
    if (pct === 100) {
      return this.gaugeSvc.build(ratio, undefined, {
        grade: 'EXCELENTE',
        description:
          'Sin egresos registrados, todo el ingreso es utilidad. Recordá registrar tus gastos antes del cierre.'
      });
    }

    // Los demás casos tienen textos de dominio financiero.
    let grade: import('../../services/gauge-geometry.service').GaugeGeometry['grade'];
    let description: string;

    if (pct >= 80) {
      grade = 'EXCELENTE';
      description = 'Excelente margen. El gym retiene la mayoría de sus ingresos.';
    } else if (pct >= 60) {
      grade = 'BUENO';
      description = 'Buen margen. Hay oportunidad de optimizar algunos gastos.';
    } else if (pct >= 40) {
      grade = 'REGULAR';
      description = 'Margen ajustado. Revisar composición de egresos.';
    } else {
      grade = 'CRÍTICO';
      description = 'Margen crítico. Los egresos consumen más del 60% de los ingresos.';
    }

    return this.gaugeSvc.build(ratio, undefined, { grade, description });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CARDS DE INDICADORES (sección 01)
  // ═══════════════════════════════════════════════════════════════════════════

  buildCards(
    rs: StateWithData<FinanzasResumenResponse> | null,
    ts: StateWithData<FinanzasTendenciaResponse> | null,
    cs: StateWithData<FinanzasCajaResponse> | null
  ): CardVM[] {
    return [
      this.makeIngresosCard(rs, ts),
      this.makeEgresosCard(rs, ts),
      this.makeNominaCard(rs, ts),
      this.makeCajaCard(cs, ts)
    ];
  }

  private makeIngresosCard(
    rs: StateWithData<FinanzasResumenResponse> | null,
    ts: StateWithData<FinanzasTendenciaResponse> | null
  ): CardVM {
    const status = this.deriveResumenCardStatus(rs);
    const value  = rs?.status === 'loaded' ? rs.data!.ingresos.total_cop : 0;
    const delta  = rs?.status === 'loaded' ? rs.data!.ingresos.delta_cop : null;
    const sparkVals = ts?.status === 'loaded'
      ? ts.data!.map((p) => p.ingresos_cop)
      : [];

    return {
      key: 'ingresos',
      label: 'Ingresos',
      color: '#10b981',
      status,
      value,
      delta,
      deltaInverted: false,
      secondaryText: this.buildIngresosSecondaryText(rs),
      caption: null,
      sparkline: this.sparklineSvc.build(sparkVals),
      gradId: 'fv2-card-spark-ingresos'
    };
  }

  /**
   * Subtexto de la card de ingresos.
   * Si cafetería aportó algo, muestra el desglose abreviado.
   * Si solo mensualidades, muestra el conteo de pagos clásico.
   */
  private buildIngresosSecondaryText(
    rs: StateWithData<FinanzasResumenResponse> | null
  ): string {
    if (rs?.status !== 'loaded') return '';
    const { ingresos } = rs.data!;
    const cafeteriaCop = ingresos.cafeteria_cop ?? 0;
    if (cafeteriaCop > 0) {
      const mens = formatAmountShort(ingresos.mensualidades_cop ?? 0);
      const cafe = formatAmountShort(cafeteriaCop);
      return `Mensualidades ${mens} · Cafetería ${cafe}`;
    }
    return `${ingresos.cantidad_pagos ?? 0} pagos recibidos`;
  }

  private makeEgresosCard(
    rs: StateWithData<FinanzasResumenResponse> | null,
    ts: StateWithData<FinanzasTendenciaResponse> | null
  ): CardVM {
    const status   = this.deriveResumenCardStatus(rs);
    const value    = rs?.status === 'loaded' ? rs.data!.egresos_por_tipo.total_cop : 0;
    const delta    = rs?.status === 'loaded' ? rs.data!.egresos_por_tipo.delta_cop : null;
    const cantidad = rs?.status === 'loaded' ? rs.data!.egresos_por_tipo.cantidad_registros : 0;
    const sparkVals = ts?.status === 'loaded'
      ? ts.data!.map((p) => p.egresos_totales_cop)
      : [];

    return {
      key: 'egresos',
      label: 'Egresos',
      color: '#dc2626',
      status,
      value,
      delta,
      deltaInverted: true,
      secondaryText: `${cantidad} registros`,
      caption: null,
      sparkline: this.sparklineSvc.build(sparkVals),
      gradId: 'fv2-card-spark-egresos'
    };
  }

  private makeNominaCard(
    rs: StateWithData<FinanzasResumenResponse> | null,
    ts: StateWithData<FinanzasTendenciaResponse> | null
  ): CardVM {
    const status  = this.deriveResumenCardStatus(rs);
    const value   = rs?.status === 'loaded' ? rs.data!.nomina.total_cop : 0;
    const delta   = rs?.status === 'loaded' ? rs.data!.nomina.delta_cop : null;
    const cierres = rs?.status === 'loaded' ? rs.data!.nomina.cantidad_cierres ?? 0 : 0;

    // tendencia no expone nomina_cop directamente — se deriva punto a punto.
    const sparkVals = ts?.status === 'loaded'
      ? ts.data!.map((p) =>
          Math.max(0, p.egresos_totales_cop - p.egresos_operativos_cop)
        )
      : [];

    return {
      key: 'nomina',
      label: 'Nómina pagada',
      color: COLOR_NOMINA,
      status,
      value,
      delta,
      deltaInverted: true,
      secondaryText: `${cierres} quincenas cerradas`,
      caption: null,
      sparkline: this.sparklineSvc.build(sparkVals),
      gradId: 'fv2-card-spark-nomina'
    };
  }

  private makeCajaCard(
    cs: StateWithData<FinanzasCajaResponse> | null,
    ts: StateWithData<FinanzasTendenciaResponse> | null
  ): CardVM {
    const status: CardStatus = !cs || cs.status === 'loading'
      ? 'loading'
      : cs.status === 'error'
        ? 'error'
        : 'loaded';

    const value       = cs?.status === 'loaded' ? cs.data!.caja_consolidada.saldo_cop : 0;
    const semillaFecha = cs?.status === 'loaded' ? cs.data!.caja_consolidada.semilla_fecha : null;
    const sparkVals   = this.computeSaldoSeries(ts, cs);

    return {
      key: 'caja',
      label: 'Caja consolidada',
      color: '#228d9f',
      status,
      value,
      delta: null,
      deltaInverted: false,
      secondaryText: 'Capital del gimnasio',
      caption: semillaFecha ? `Desde ${this.formatDateDmy(semillaFecha)}` : null,
      sparkline: this.sparklineSvc.build(sparkVals),
      gradId: 'fv2-card-spark-caja'
    };
  }

  private deriveResumenCardStatus(
    rs: StateWithData<FinanzasResumenResponse> | null
  ): CardStatus {
    if (!rs || rs.status === 'loading') return 'loading';
    if (rs.status === 'error') return 'error';
    if (rs.status === 'pre-app') return 'pre-app';
    return 'loaded';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SALDO ACUMULADO (compartido por card caja + sección 03)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calcula el saldo acumulado punto a punto desde la semilla.
   * Devuelve [] si tendencia o caja no están listos.
   */
  computeSaldoSeries(
    ts: StateWithData<FinanzasTendenciaResponse> | null,
    cs: StateWithData<FinanzasCajaResponse> | null
  ): number[] {
    if (!ts || ts.status !== 'loaded' || !cs || cs.status !== 'loaded') return [];
    const tendencia = ts.data!;
    const semilla   = cs.data!.caja_consolidada.semilla_cop;
    if (tendencia.length === 0) return [semilla];

    const saldos: number[] = [semilla];
    for (let i = 1; i < tendencia.length; i++) {
      const prev = saldos[i - 1];
      saldos.push(prev + tendencia[i].ingresos_cop - tendencia[i].egresos_totales_cop);
    }
    return saldos;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PANEL FLOTANTE — desglose de egresos
  // ═══════════════════════════════════════════════════════════════════════════

  /** Solo incluye tipos con total_cop > 0, ordenados de mayor a menor. */
  buildEgresosDesglose(ept: EgresosPorTipo): EgresosDesgloseRow[] {
    const entries: Array<{ tipo: ExpenseType; total_cop: number }> = [
      { tipo: 'costo_directo',        total_cop: ept.costo_directo_cop },
      { tipo: 'gasto_operativo',      total_cop: ept.gasto_operativo_cop },
      { tipo: 'gasto_administrativo', total_cop: ept.gasto_administrativo_cop },
      { tipo: 'gasto_financiero',     total_cop: ept.gasto_financiero_cop },
      { tipo: 'inversion',            total_cop: ept.inversion_cop },
      { tipo: 'deuda',                total_cop: ept.deuda_cop }
    ];

    const withValue = entries.filter((e) => e.total_cop > 0);
    if (withValue.length === 0) return [];

    withValue.sort((a, b) => b.total_cop - a.total_cop);
    const maxVal = withValue[0].total_cop;

    return withValue.map((e) => {
      const meta = EXPENSE_TYPE_META[e.tipo];
      return {
        tipo: e.tipo,
        label: meta.label,
        total_cop: e.total_cop,
        barWidthPct: maxVal > 0 ? (e.total_cop / maxVal) * 100 : 0,
        badgeBg: meta.badgeBg,
        badgeText: meta.badgeText,
        barFill: meta.barFill
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 02 — TENDENCIA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Slice de la tendencia según la ventana seleccionada.
   * El backend entrega siempre 6 meses; aquí cortamos la cola.
   */
  windowedPuntos(
    puntos: FinanzasTendenciaResponse,
    ventana: VentanaTendenciaFin | null
  ): FinanzasTendenciaResponse {
    const v = ventana ?? 6;
    const n = VENTANA_PUNTOS[v];
    return puntos.length > n ? puntos.slice(-n) : puntos;
  }

  /** Variación de utilidad entre primer y último punto del rango. */
  buildVariacion(puntos: FinanzasTendenciaResponse): VariacionUtilidad {
    if (!puntos || puntos.length < 2) {
      return { pct: null, arrow: '→', display: 'N/A', cssClass: 'fv2-var--null', mesInicialLabel: '' };
    }

    const prev = puntos[0].utilidad_cop;
    const curr = puntos[puntos.length - 1].utilidad_cop;
    const mesInicialLabel = this.parseMesLabel(puntos[0].mes);

    if (prev === 0) {
      return { pct: null, arrow: '→', display: 'N/A', cssClass: 'fv2-var--null', mesInicialLabel };
    }

    const pct      = ((curr - prev) / Math.abs(prev)) * 100;
    const arrow    = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
    const cssClass = pct > 0 ? 'fv2-var--up' : pct < 0 ? 'fv2-var--down' : 'fv2-var--flat';
    const abs      = Math.abs(pct);
    const formatted = Number.isInteger(abs)
      ? abs.toLocaleString('es-CO', { maximumFractionDigits: 0 })
      : abs.toLocaleString('es-CO', { maximumFractionDigits: 1 });

    return { pct, arrow, display: `${arrow} ${formatted}%`, cssClass, mesInicialLabel };
  }

  /** Mini leyenda con barras min→max relativas al máximo global de las 3 series. */
  buildSeriesLegend(puntos: FinanzasTendenciaResponse): SeriesLegendRow[] {
    if (!puntos || puntos.length === 0) return [];

    const ingresosVals = puntos.map((p) => p.ingresos_cop);
    const egresosVals  = puntos.map((p) => p.egresos_totales_cop);
    const utilidadVals = puntos.map((p) => p.utilidad_cop);

    const ingMax   = Math.max(...ingresosVals);
    const egrMax   = Math.max(...egresosVals);
    const utiMax   = Math.max(...utilidadVals);
    const globalMax = Math.max(ingMax, egrMax, utiMax) || 1;

    return [
      {
        key: 'ingresos',
        label: 'Ingresos',
        color: COLOR_INGRESOS,
        minLabel: formatAmountShort(Math.min(...ingresosVals)),
        maxLabel: formatAmountShort(ingMax),
        widthPct: (ingMax / globalMax) * 100
      },
      {
        key: 'egresos',
        label: 'Egresos totales',
        color: COLOR_EGRESOS,
        minLabel: formatAmountShort(Math.min(...egresosVals)),
        maxLabel: formatAmountShort(egrMax),
        widthPct: (egrMax / globalMax) * 100
      },
      {
        key: 'utilidad',
        label: 'Utilidad',
        color: COLOR_UTILIDAD,
        minLabel: formatAmountShort(Math.min(...utilidadVals)),
        maxLabel: formatAmountShort(utiMax),
        widthPct: (Math.max(utiMax, 0) / globalMax) * 100
      }
    ];
  }

  /** ChartData para la gráfica de barras agrupadas de tendencia. */
  buildChartData(puntos: FinanzasTendenciaResponse): ChartData<'bar'> {
    const labels = puntos.map((p) => (p.es_mes_actual ? `${p.label} *` : p.label));
    const bgFor  = (color: string, esActual: boolean): string =>
      esActual ? this.withAlpha(color, 0.65) : color;

    return {
      labels,
      datasets: [
        {
          label: 'Ingresos',
          data: puntos.map((p) => p.ingresos_cop),
          backgroundColor: puntos.map((p) => bgFor(COLOR_INGRESOS, p.es_mes_actual)),
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.85,
          categoryPercentage: 0.7
        },
        {
          label: 'Egresos totales',
          data: puntos.map((p) => p.egresos_totales_cop),
          backgroundColor: puntos.map((p) => bgFor(COLOR_EGRESOS, p.es_mes_actual)),
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.85,
          categoryPercentage: 0.7
        },
        {
          label: 'Utilidad',
          data: puntos.map((p) => Math.max(p.utilidad_cop, 0)),
          backgroundColor: puntos.map((p) => bgFor(COLOR_UTILIDAD, p.es_mes_actual)),
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.85,
          categoryPercentage: 0.7
        }
      ]
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 04 — DETALLE DE INGRESOS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Filas de la lista de métodos (solo los que tienen total > 0). */
  buildMetodoRows(detalle: FinanzasDetalleResponse): MetodoPagoRow[] {
    if (!detalle.tiene_datos) return [];
    return detalle.por_metodo
      .filter((m) => m.total_cop > 0)
      .map((m) => ({
        metodo: m.metodo,
        label: PAYMENT_METHOD_LABELS[m.metodo] ?? m.label,
        total_cop: m.total_cop,
        cantidad_pagos: m.cantidad_pagos,
        porcentaje: m.porcentaje,
        color: METODO_COLORS[m.metodo],
        widthPct: m.porcentaje
      }))
      .sort((a, b) => b.total_cop - a.total_cop);
  }

  /** ChartData para la dona de métodos de pago. */
  buildMetodoChartData(detalle: FinanzasDetalleResponse): ChartData<'doughnut'> {
    if (!detalle.tiene_datos || detalle.por_metodo.every((m) => m.total_cop === 0)) {
      return {
        labels: ['Sin datos'],
        datasets: [{ data: [1], backgroundColor: ['#e5e7eb'], borderWidth: 0 }]
      };
    }

    const filtered = detalle.por_metodo.filter((m) => m.total_cop > 0);
    return {
      labels: filtered.map((m) => PAYMENT_METHOD_LABELS[m.metodo] ?? m.label),
      datasets: [{
        data: filtered.map((m) => m.total_cop),
        backgroundColor: filtered.map((m) => METODO_COLORS[m.metodo]),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    };
  }

  /** Total de pagos del mes para el header de la card de métodos. */
  totalPagos(detalle: FinanzasDetalleResponse): number {
    return detalle.por_metodo.reduce((acc, m) => acc + m.cantidad_pagos, 0);
  }

  buildQuincenaRows(detalle: FinanzasDetalleResponse): QuincenaRow[] {
    const q1  = detalle.quincenas.q1;
    const q2  = detalle.quincenas.q2;
    const max = Math.max(q1.total_cop, q2.total_cop, 1);

    const mapEstado = (
      e: 'completa' | 'parcial' | 'no_iniciada'
    ): { label: string; variant: 'success' | 'warn' | 'muted'; color: string } => {
      if (e === 'completa') return { label: 'Completa', variant: 'success', color: '#228d9f' };
      if (e === 'parcial')  return { label: 'En curso', variant: 'warn',    color: '#f59e0b' };
      return { label: 'Aún no iniciada', variant: 'muted', color: '#e5e7eb' };
    };

    const e1 = mapEstado(q1.estado);
    const e2 = mapEstado(q2.estado);

    return [
      {
        key: 'q1',
        label: 'Q1 (1–15)',
        total_cop: q1.total_cop,
        cantidad_pagos: q1.cantidad_pagos,
        estado: q1.estado,
        estadoLabel: e1.label,
        estadoVariant: e1.variant,
        widthPct: (q1.total_cop / max) * 100,
        barColor: e1.color
      },
      {
        key: 'q2',
        label: 'Q2 (16–fin)',
        total_cop: q2.estado === 'no_iniciada' ? 0 : q2.total_cop,
        cantidad_pagos: q2.cantidad_pagos,
        estado: q2.estado,
        estadoLabel: e2.label,
        estadoVariant: e2.variant,
        widthPct: q2.estado === 'no_iniciada' ? 0 : (q2.total_cop / max) * 100,
        barColor: e2.color
      }
    ];
  }

  /** Texto de insight automático debajo de la lista de quincenas. */
  buildQuincenaInsight(detalle: FinanzasDetalleResponse): string {
    const q1      = detalle.quincenas.q1.total_cop;
    const q2      = detalle.quincenas.q2.total_cop;
    const q2Estado = detalle.quincenas.q2.estado;

    if (q2Estado === 'no_iniciada') {
      return 'La Q1 concentra el 100% del ingreso del mes. La Q2 aún no inició.';
    }

    const total = q1 + q2;
    if (total === 0) return 'Aún no hay ingresos registrados en este período.';
    if (q1 === q2) return 'Ingresos distribuidos uniformemente entre quincenas.';

    if (q1 > q2) {
      const pct = Math.round((q1 / total) * 100);
      return `La Q1 concentra el ${pct}% del ingreso mensual.`;
    }

    const pct = Math.round((q2 / total) * 100);
    return `La Q2 superó a Q1 este mes (${pct}% del total).`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 05 — COMPOSICIÓN DE EGRESOS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Devuelve las vistas disponibles según los datos del período.
   * "Origen ingresos" solo aparece cuando cafetería > 0.
   */
  vistasComposicionDisponibles(comp: FinanzasComposicionResponse | null): VistaComposicion[] {
    const base: VistaComposicion[] = ['categoria', 'proveedor'];
    if (!comp) return base;
    if ((comp.composicion_ingresos?.cafeteria_cop ?? 0) > 0) {
      return [...base, 'origen_ingresos'];
    }
    return base;
  }

  /** Filas de composición según la vista activa (categoría o proveedor). No aplica a origen_ingresos. */
  buildComposicionRows(comp: FinanzasComposicionResponse, vista: VistaComposicion): ComposicionRow[] {
    if (!comp.tiene_datos || vista === 'origen_ingresos') return [];

    const rows = vista === 'categoria'
      ? comp.por_categoria.map((r, i) => ({
          id: r.categoria_id,
          nombre: r.nombre,
          total_cop: r.total_cop,
          porcentaje: r.porcentaje,
          cantidad: r.cantidad,
          color: r.categoria_id === 'nomina'
            ? COLOR_NOMINA
            : COMPOSICION_COLORS[i % COMPOSICION_COLORS.length],
          widthPct: r.porcentaje
        }))
      : comp.por_proveedor.map((r, i) => ({
          id: r.proveedor_id,
          nombre: r.nombre,
          total_cop: r.total_cop,
          porcentaje: r.porcentaje,
          cantidad: r.cantidad,
          color: COMPOSICION_COLORS[i % COMPOSICION_COLORS.length],
          widthPct: r.porcentaje
        }));

    return rows.sort((a, b) => b.total_cop - a.total_cop);
  }

  /** ChartData para la dona de composición de egresos. */
  buildComposicionChartData(
    comp: FinanzasComposicionResponse,
    vista: VistaComposicion
  ): ChartData<'doughnut'> {
    if (!comp.tiene_datos) {
      return {
        labels: ['Sin datos'],
        datasets: [{ data: [1], backgroundColor: ['#e5e7eb'], borderWidth: 0 }]
      };
    }

    const rows = this.buildComposicionRows(comp, vista);
    return {
      labels: rows.map((r) => r.nombre),
      datasets: [{
        data: rows.map((r) => r.total_cop),
        backgroundColor: rows.map((r) => r.color),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    };
  }

  // ─── Vista "Origen ingresos" ───────────────────────────────────────────────

  buildIngresosRows(ci: ComposicionIngresos): ComposicionRow[] {
    const rows: ComposicionRow[] = [];
    if (ci.mensualidades_cop > 0) {
      rows.push({
        id: 'mensualidades',
        nombre: 'Mensualidades',
        total_cop: ci.mensualidades_cop,
        porcentaje: ci.mensualidades_pct,
        cantidad: 0,
        color: COLOR_MENSUALIDADES,
        widthPct: ci.mensualidades_pct
      });
    }
    if (ci.cafeteria_cop > 0) {
      rows.push({
        id: 'cafeteria',
        nombre: 'Cafetería',
        total_cop: ci.cafeteria_cop,
        porcentaje: ci.cafeteria_pct,
        cantidad: 0,
        color: COLOR_CAFETERIA_DONA,
        widthPct: ci.cafeteria_pct
      });
    }
    return rows.sort((a, b) => b.total_cop - a.total_cop);
  }

  buildIngresosChartData(ci: ComposicionIngresos): ChartData<'doughnut'> {
    const rows = this.buildIngresosRows(ci);
    if (rows.length === 0) {
      return {
        labels: ['Sin datos'],
        datasets: [{ data: [1], backgroundColor: ['#e5e7eb'], borderWidth: 0 }]
      };
    }
    return {
      labels: rows.map((r) => r.nombre),
      datasets: [{
        data: rows.map((r) => r.total_cop),
        backgroundColor: rows.map((r) => r.color),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    };
  }

  // ─── Utilidades privadas ───────────────────────────────────────────────────

  /** Convierte ISO YYYY-MM-DD → DD/MM/YYYY (usado en caption de card caja). */
  private formatDateDmy(iso: string): string {
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [yyyy, mm, dd] = parts;
    return `${dd}/${mm}/${yyyy}`;
  }

  /** Convierte "2026-04" en "abril 2026" (usado en buildVariacion). */
  private parseMesLabel(mes: string): string {
    const parts = mes.split('-');
    if (parts.length !== 2) return mes;
    const [y, m] = parts.map(Number);
    if (!m || m < 1 || m > 12) return mes;
    return `${MESES_COMPLETOS[m - 1].toLowerCase()} ${y}`;
  }

  /** Convierte hex a rgba con alpha (usado en buildChartData). */
  private withAlpha(hex: string, alpha: number): string {
    const m = hex.replace('#', '');
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
