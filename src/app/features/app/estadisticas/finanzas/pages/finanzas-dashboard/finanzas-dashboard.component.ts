import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit
} from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  Subject,
  combineLatest,
  of
} from 'rxjs';
import {
  catchError,
  map,
  shareReplay,
  startWith,
  switchMap,
  takeUntil
} from 'rxjs/operators';

import { ChartConfiguration, ChartData } from 'chart.js';

import {
  formatAmountCop,
  formatAmountShort,
  PAYMENT_METHOD_LABELS
} from 'src/app/features/app/expense-records/models/expense-record.model';
import {
  FinanzasService,
  MesPeriodo
} from '../../services/finanzas.service';
import {
  ComposicionCategoriaRow,
  ComposicionIngresos,
  ComposicionProveedorRow,
  DetalleMetodoPago,
  EgresosPorTipo,
  FinanzasCajaResponse,
  FinanzasComposicionResponse,
  FinanzasDetalleResponse,
  FinanzasResumenResponse,
  FinanzasTendenciaResponse,
  MetodoPago,
  VentanaTendenciaFin
} from '../../models/finanzas.model';

// ─── Estado de carga ──────────────────────────────────────────────────────────

interface StateLoading {
  status: 'loading';
  data: null;
  error: null;
}

interface ResumenStateLoaded {
  status: 'loaded';
  data: FinanzasResumenResponse;
  error: null;
}

interface ResumenStateError {
  status: 'error';
  data: null;
  error: unknown;
}

interface ResumenStatePreApp {
  status: 'pre-app';
  data: null;
  error: null;
}

type ResumenState =
  | StateLoading
  | ResumenStateLoaded
  | ResumenStateError
  | ResumenStatePreApp;

interface TendenciaStateLoaded {
  status: 'loaded';
  data: FinanzasTendenciaResponse;
  error: null;
}

interface TendenciaStateError {
  status: 'error';
  data: null;
  error: unknown;
}

type TendenciaState = StateLoading | TendenciaStateLoaded | TendenciaStateError;

interface CajaStateLoaded {
  status: 'loaded';
  data: FinanzasCajaResponse;
  error: null;
}

interface CajaStateError {
  status: 'error';
  data: null;
  error: unknown;
}

type CajaState = StateLoading | CajaStateLoaded | CajaStateError;

interface DetalleStateLoaded {
  status: 'loaded';
  data: FinanzasDetalleResponse;
  error: null;
}

interface DetalleStateError {
  status: 'error';
  data: null;
  error: unknown;
}

interface DetalleStatePreApp {
  status: 'pre-app';
  data: null;
  error: null;
}

type DetalleState =
  | StateLoading
  | DetalleStateLoaded
  | DetalleStateError
  | DetalleStatePreApp;

interface ComposicionStateLoaded {
  status: 'loaded';
  data: FinanzasComposicionResponse;
  error: null;
}

interface ComposicionStateError {
  status: 'error';
  data: null;
  error: unknown;
}

interface ComposicionStatePreApp {
  status: 'pre-app';
  data: null;
  error: null;
}

type ComposicionState =
  | StateLoading
  | ComposicionStateLoaded
  | ComposicionStateError
  | ComposicionStatePreApp;

// ─── Vista (toggle local en sección 05) ──────────────────────────────────────

export type VistaComposicion = 'categoria' | 'proveedor' | 'origen_ingresos';

// ─── Filas de listas con barras de progreso (sección 04 y 05) ────────────────

export interface MetodoPagoRow {
  metodo: MetodoPago;
  label: string;
  total_cop: number;
  cantidad_pagos: number;
  porcentaje: number;
  color: string;
  /** Ancho de la barra como % del total general (mismo valor que porcentaje). */
  widthPct: number;
}

export interface ComposicionRow {
  id: string;
  nombre: string;
  total_cop: number;
  porcentaje: number;
  cantidad: number;
  color: string;
  /** Ancho de la barra como % del total general (mismo valor que porcentaje). */
  widthPct: number;
}

// ─── Quincena VM (sección 04) ────────────────────────────────────────────────

export interface QuincenaRow {
  key: 'q1' | 'q2';
  label: string;
  total_cop: number;
  cantidad_pagos: number;
  estado: 'completa' | 'parcial' | 'no_iniciada';
  /** "Completa" | "En curso" | "Aún no iniciada" */
  estadoLabel: string;
  /** Variante visual para el badge: 'success' | 'warn' | 'muted'. */
  estadoVariant: 'success' | 'warn' | 'muted';
  /** Ancho de la barra 0-100 sobre el max(q1, q2). */
  widthPct: number;
  /** Color de la barra según estado. */
  barColor: string;
}

// ─── Card view model ─────────────────────────────────────────────────────────

export type CardKey = 'ingresos' | 'egresos' | 'nomina' | 'caja';
export type CardStatus = 'loading' | 'loaded' | 'error' | 'pre-app';

export interface CardVM {
  key: CardKey;
  label: string;
  color: string;
  status: CardStatus;
  value: number;
  /** null = no delta to show (caja, pre-app, or first month). */
  delta: number | null;
  /** Si true, delta>0 = mal (rojo), <0 = bien (verde). Aplica a egresos/nómina. */
  deltaInverted: boolean;
  /** Texto secundario debajo del valor: "X pagos recibidos", "Capital del gimnasio". */
  secondaryText: string;
  /** Caption alternativo al delta pill (caja → "Desde 30/04/2026"). */
  caption: string | null;
  /** Geometría del sparkline o null si no hay datos suficientes. */
  sparkline: SparklineGeometry | null;
  /** Sufijo único del id del gradient SVG, para que múltiples sparklines no colisionen. */
  gradId: string;
}

// ─── Desglose de egresos (panel flotante) ─────────────────────────────────

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
  /** 0-100, proporción sobre el tipo con mayor valor (max = 100). */
  barWidthPct: number;
  badgeBg: string;
  badgeText: string;
  barFill: string;
}

// ─── Sparkline path geometry ──────────────────────────────────────────────────

interface SparklineGeometry {
  /** Path "d" para la línea (M + L). */
  linePath: string;
  /** Path "d" para el área debajo de la línea (line + Z hacia el baseline). */
  areaPath: string;
  /** Coordenadas del último punto, para dibujar el dot destacado. */
  lastX: number;
  lastY: number;
  /** Dimensiones efectivas del viewBox. */
  width: number;
  height: number;
}

// ─── Health gauge geometry ────────────────────────────────────────────────────

interface GaugeGeometry {
  /** Path del arco completo (track). */
  trackD: string;
  /** Path del arco de progreso. */
  barD: string;
  color: string;
  grade: 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'CRÍTICO';
  description: string;
  pctLabel: string;
  cx: number;
  cy: number;
  r: number;
  /** Ancho del SVG (igual a `size`). */
  width: number;
  /** Alto del SVG, igual a `size/2 + 12` para acomodar el stroke del arco. */
  height: number;
  /** viewBox precalculado: "0 0 W H". */
  viewBox: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const APP_START_YEAR = 2026;
const APP_START_MONTH = 4;

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
];

/** Ventana fija usada por la sparkline del hero. */
const SPARKLINE_WINDOW = 6;

const VENTANAS_TENDENCIA: VentanaTendenciaFin[] = [1, 2, 6];
const VENTANA_TENDENCIA_LABELS: Record<VentanaTendenciaFin, string> = {
  1: 'Mes anterior',
  2: 'Últimos 2 meses',
  6: 'Últimos 6 meses'
};

/** Mapea la ventana en N cantidad de puntos a tomar de la cola del array (current incluido). */
const VENTANA_PUNTOS: Record<VentanaTendenciaFin, number> = {
  1: 2,
  2: 3,
  6: 7
};

const COLOR_INGRESOS  = '#10b981';
const COLOR_EGRESOS   = '#dc2626';
const COLOR_UTILIDAD  = '#228d9f';

// ─── Metadatos de los expense_type para el panel de desglose ──────────────

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

/** Colores deterministas por método de pago (sección 04). */
const METODO_COLORS: Record<MetodoPago, string> = {
  transfer: '#228d9f',
  cash:     '#10b981',
  nequi:    '#8b5cf6',
  other:    '#9ca3af'
};

/** Color usado por la fila de nómina en la sección 05. */
const COLOR_NOMINA = '#6366f1';

/** Paleta determinista para composición (categorías o proveedores). */
const COMPOSICION_COLORS = [
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

const MESES_COMPLETOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

// ─── Helpers de estructura para variación / leyenda / quincena ───────────────

export interface VariacionUtilidad {
  /** % de variación; null cuando el primer punto fue 0. */
  pct: number | null;
  arrow: '↑' | '↓' | '→';
  /** "↑ 1,600%" | "N/A" */
  display: string;
  /** "fv2-var--up" | "fv2-var--down" | "fv2-var--flat" | "fv2-var--null" */
  cssClass: string;
  /** Mes inicial en el rango analizado: "enero 2026". */
  mesInicialLabel: string;
}

export interface SeriesLegendRow {
  key: 'ingresos' | 'egresos' | 'utilidad';
  label: string;
  color: string;
  minLabel: string;
  maxLabel: string;
  /** ancho relativo de la barra 0-100 sobre el max global de las 3 series. */
  widthPct: number;
}

export interface QuincenaCierreInfo {
  /** "15 mayo" | "31 mayo" — la fecha relativa al período actual (real-time). */
  cierreLabel: string;
  /** "Q1 Mayo 2026" | "Q2 Mayo 2026" — viene de cajaState$.caja_menor. */
  badgeLabel: string;
  daysRemaining: number;
  /** "en 5 días" | "hoy" | "mañana" — texto del badge de countdown. */
  countdownLabel: string;
  /** Variante visual: 'default' (≥4 días), 'warn' (≤3), 'danger' (≤1). */
  countdownVariant: 'default' | 'warn' | 'danger';
}

/** Dimensiones del SVG sparkline (viewBox). */
const SPARKLINE_VB_WIDTH = 320;
const SPARKLINE_VB_HEIGHT = 60;
const SPARKLINE_PADDING_Y = 6;

@Component({
  selector: 'app-finanzas-dashboard',
  templateUrl: './finanzas-dashboard.component.html',
  styleUrls: ['./finanzas-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FinanzasDashboardComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  // ─── Resumen ──────────────────────────────────────────────────────────────

  private readonly retryResumen$ = new BehaviorSubject<void>(undefined);

  readonly resumenState$: Observable<ResumenState> = combineLatest([
    this.svc.mesPeriodo$,
    this.retryResumen$
  ]).pipe(
    switchMap(([period]) => {
      if (this.isPreAppPeriod(period)) {
        return of<ResumenState>({ status: 'pre-app', data: null, error: null });
      }
      return this.svc.getResumen(period.year, period.month).pipe(
        map((data): ResumenState => ({ status: 'loaded', data, error: null })),
        catchError((err): Observable<ResumenState> =>
          of({ status: 'error', data: null, error: err })
        ),
        startWith<ResumenState>({ status: 'loading', data: null, error: null })
      );
    }),
    shareReplay(1)
  );

  // ─── Tendencia (sparkline) ────────────────────────────────────────────────

  private readonly retryTendencia$ = new BehaviorSubject<void>(undefined);

  readonly tendenciaState$: Observable<TendenciaState> = this.retryTendencia$.pipe(
    switchMap(() =>
      this.svc.getTendencia(SPARKLINE_WINDOW).pipe(
        map((data): TendenciaState => ({ status: 'loaded', data, error: null })),
        catchError((err): Observable<TendenciaState> =>
          of({ status: 'error', data: null, error: err })
        ),
        startWith<TendenciaState>({ status: 'loading', data: null, error: null })
      )
    ),
    shareReplay(1)
  );

  // ─── Caja (saldo consolidado, no depende del período) ────────────────────

  private readonly retryCaja$ = new BehaviorSubject<void>(undefined);

  readonly cajaState$: Observable<CajaState> = this.retryCaja$.pipe(
    switchMap(() =>
      this.svc.getCaja().pipe(
        map((data): CajaState => ({ status: 'loaded', data, error: null })),
        catchError((err): Observable<CajaState> =>
          of({ status: 'error', data: null, error: err })
        ),
        startWith<CajaState>({ status: 'loading', data: null, error: null })
      )
    ),
    shareReplay(1)
  );

  // ─── Detalle de ingresos (sección 04) ────────────────────────────────────

  private readonly retryDetalle$ = new BehaviorSubject<void>(undefined);

  readonly detalleState$: Observable<DetalleState> = combineLatest([
    this.svc.mesPeriodo$,
    this.retryDetalle$
  ]).pipe(
    switchMap(([period]) => {
      if (this.isPreAppPeriod(period)) {
        return of<DetalleState>({ status: 'pre-app', data: null, error: null });
      }
      return this.svc.getDetalle(period.year, period.month).pipe(
        map((data): DetalleState => ({ status: 'loaded', data, error: null })),
        catchError((err): Observable<DetalleState> =>
          of({ status: 'error', data: null, error: err })
        ),
        startWith<DetalleState>({ status: 'loading', data: null, error: null })
      );
    }),
    shareReplay(1)
  );

  // ─── Composición de egresos (sección 05) ─────────────────────────────────

  private readonly retryComposicion$ = new BehaviorSubject<void>(undefined);

  readonly composicionState$: Observable<ComposicionState> = combineLatest([
    this.svc.mesPeriodo$,
    this.retryComposicion$
  ]).pipe(
    switchMap(([period]) => {
      if (this.isPreAppPeriod(period)) {
        return of<ComposicionState>({ status: 'pre-app', data: null, error: null });
      }
      return this.svc.getComposicion(period.year, period.month).pipe(
        map((data): ComposicionState => ({ status: 'loaded', data, error: null })),
        catchError((err): Observable<ComposicionState> =>
          of({ status: 'error', data: null, error: err })
        ),
        startWith<ComposicionState>({ status: 'loading', data: null, error: null })
      );
    }),
    shareReplay(1)
  );

  // ─── Ventana de tendencia (sólo afecta a la sección 02) ──────────────────

  readonly ventanasTendencia: VentanaTendenciaFin[] = VENTANAS_TENDENCIA;
  readonly ventanaTendenciaLabels: Record<VentanaTendenciaFin, string> =
    VENTANA_TENDENCIA_LABELS;
  readonly ventanaTendencia$: Observable<VentanaTendenciaFin> =
    this.svc.ventanaTendencia$;

  // ─── Visibilidad de montos ────────────────────────────────────────────────

  readonly montosVisibles$: Observable<boolean> = this.svc.montosVisibles$;

  // ─── Período (snapshot sincrónico para template) ──────────────────────────

  protected periodo: MesPeriodo = {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1
  };
  periodoLabel = '';
  isAtCurrentMonth = true;
  isAtAppStartMonth = false;

  private readonly currentYear = new Date().getFullYear();
  private readonly currentMonth = new Date().getMonth() + 1;

  constructor(
    private readonly svc: FinanzasService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.svc.mesPeriodo$.pipe(takeUntil(this.destroy$)).subscribe((p) => {
      this.periodo = p;
      this.periodoLabel = this.svc.getPeriodoLabel(p.year, p.month);
      this.isAtCurrentMonth =
        p.year === this.currentYear && p.month === this.currentMonth;
      this.isAtAppStartMonth =
        p.year === APP_START_YEAR && p.month === APP_START_MONTH;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Período ──────────────────────────────────────────────────────────────

  onPrevMonth(): void {
    if (this.isAtAppStartMonth) return;
    const { year, month } = this.periodo;
    this.svc.setPeriodo(
      month === 1 ? year - 1 : year,
      month === 1 ? 12 : month - 1
    );
  }

  onNextMonth(): void {
    if (this.isAtCurrentMonth) return;
    const { year, month } = this.periodo;
    this.svc.setPeriodo(
      month === 12 ? year + 1 : year,
      month === 12 ? 1 : month + 1
    );
  }

  // ─── Toggle montos ────────────────────────────────────────────────────────

  onToggleMontos(): void {
    this.svc.toggleMontosVisibles();
  }

  // ─── Retry ────────────────────────────────────────────────────────────────

  retryResumen(): void {
    this.retryResumen$.next();
  }

  retryTendencia(): void {
    this.retryTendencia$.next();
  }

  retryCaja(): void {
    this.retryCaja$.next();
  }

  retryDetalle(): void {
    this.retryDetalle$.next();
  }

  retryComposicion(): void {
    this.retryComposicion$.next();
  }

  // ─── Vista de composición (sección 05) ───────────────────────────────────

  vistaComposicion: VistaComposicion = 'categoria';

  onVistaComposicionChange(v: VistaComposicion): void {
    this.vistaComposicion = v;
    this.cdr.markForCheck();
  }

  trackByVistaComposicion(_i: number, v: VistaComposicion): VistaComposicion {
    return v;
  }

  readonly vistasComposicionEgresos: VistaComposicion[] = ['categoria', 'proveedor'];
  readonly vistaComposicionLabels: Record<VistaComposicion, string> = {
    categoria: 'Por categoría',
    proveedor: 'Por proveedor',
    origen_ingresos: 'Origen ingresos'
  };

  /**
   * Decide si mostrar el toggle "Origen ingresos".
   * Solo visible cuando cafetería tiene participación.
   */
  shouldShowOrigenIngresos(comp: FinanzasComposicionResponse): boolean {
    return (comp.composicion_ingresos?.cafeteria_cop ?? 0) > 0;
  }

  /**
   * Devuelve las vistas disponibles según los datos del período.
   * El toggle "Origen ingresos" solo aparece cuando cafetería > 0.
   */
  vistasComposicionDisponibles(comp: FinanzasComposicionResponse | null): VistaComposicion[] {
    if (!comp) return this.vistasComposicionEgresos;
    if (this.shouldShowOrigenIngresos(comp)) {
      return [...this.vistasComposicionEgresos, 'origen_ingresos'];
    }
    return this.vistasComposicionEgresos;
  }

  // ─── Ventana de tendencia ────────────────────────────────────────────────

  onVentanaTendenciaChange(n: VentanaTendenciaFin): void {
    this.svc.setVentanaTendencia(n);
  }

  trackByVentana(_i: number, v: VentanaTendenciaFin): VentanaTendenciaFin {
    return v;
  }

  // ─── Período helpers ──────────────────────────────────────────────────────

  isPreAppPeriod(period: MesPeriodo): boolean {
    return (
      period.year < APP_START_YEAR ||
      (period.year === APP_START_YEAR && period.month < APP_START_MONTH)
    );
  }

  prevMonthLabel(period: MesPeriodo): string {
    const idx = period.month === 1 ? 11 : period.month - 2;
    return MESES_CORTOS[idx];
  }

  // ─── Formatters ───────────────────────────────────────────────────────────

  formatCop(amount: number): string {
    return formatAmountCop(amount);
  }

  formatShort(amount: number): string {
    return formatAmountShort(amount);
  }

  formatVisible(amount: number, visible: boolean | null): string {
    return visible ? formatAmountCop(amount) : '••••••';
  }

  formatVisibleShort(amount: number, visible: boolean | null): string {
    return visible ? formatAmountShort(amount) : '$••••';
  }

  /** Texto de la fórmula P&L en el hero. */
  formulaText(resumen: FinanzasResumenResponse, visible: boolean | null): string {
    const ing = this.formatVisibleShort(resumen.ingresos.total_cop, visible);
    const ops = this.formatVisibleShort(resumen.egresos_operativos.total_cop, visible);
    const nom = this.formatVisibleShort(resumen.nomina.total_cop, visible);
    return `+ Ingresos ${ing} · − Operativos ${ops} · − Nómina ${nom}`;
  }

  // ─── Delta pill ───────────────────────────────────────────────────────────

  deltaPillClass(deltaCop: number): string {
    if (deltaCop > 0) return 'fv2-pill fv2-pill--up';
    if (deltaCop < 0) return 'fv2-pill fv2-pill--down';
    return 'fv2-pill fv2-pill--flat';
  }

  deltaPillArrow(deltaCop: number): string {
    if (deltaCop > 0) return '↑';
    if (deltaCop < 0) return '↓';
    return '→';
  }

  // ─── Sparkline geometry ───────────────────────────────────────────────────

  /**
   * Construye paths SVG de línea + área para una sparkline.
   * El color y el id del gradient se aplican en el template — esta función
   * sólo calcula geometría. Devuelve null si la serie es insuficiente (<2 pts).
   */
  buildSparkline(
    values: number[],
    width = 80,
    height = 40
  ): SparklineGeometry | null {
    if (!values || values.length < 2) return null;

    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const range = max - min || 1;

    const pad = SPARKLINE_PADDING_Y;
    const innerH = height - pad * 2;
    const stepX = width / (values.length - 1);

    const coords = values.map((v, i) => {
      const x = i * stepX;
      const y = pad + innerH - ((v - min) / range) * innerH;
      return { x, y };
    });

    const linePath = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
      .join(' ');

    const first = coords[0];
    const last = coords[coords.length - 1];
    const areaPath =
      `${linePath} L${last.x.toFixed(2)},${height} L${first.x.toFixed(2)},${height} Z`;

    return {
      linePath,
      areaPath,
      lastX: last.x,
      lastY: last.y,
      width,
      height
    };
  }

  /** Sparkline grande del hero — usa la serie de utilidad. */
  buildHeroSparkline(puntos: FinanzasTendenciaResponse): SparklineGeometry | null {
    return this.buildSparkline(
      puntos.map((p) => p.utilidad_cop),
      SPARKLINE_VB_WIDTH,
      SPARKLINE_VB_HEIGHT
    );
  }

  // ─── Cards de "Indicadores del período" ──────────────────────────────────

  /**
   * Construye los 4 cards de la sección de indicadores a partir de los
   * tres streams de datos. Cada card lleva su propio status para que el
   * template pueda renderizar skeleton/error/loaded de forma independiente.
   */
  buildCards(
    rs: ResumenState | null,
    ts: TendenciaState | null,
    cs: CajaState | null
  ): CardVM[] {
    const baseCards: CardVM[] = [
      this.makeIngresosCard(rs, ts),
      this.makeEgresosCard(rs, ts),
      this.makeNominaCard(rs, ts),
      this.makeCajaCard(cs, ts)
    ];
    return baseCards;
  }

  private makeIngresosCard(
    rs: ResumenState | null,
    ts: TendenciaState | null
  ): CardVM {
    const status = this.deriveResumenCardStatus(rs);
    const value = rs?.status === 'loaded' ? rs.data!.ingresos.total_cop : 0;
    const delta = rs?.status === 'loaded' ? rs.data!.ingresos.delta_cop : null;
    const sparkVals = ts?.status === 'loaded'
      ? ts.data!.map((p) => p.ingresos_cop)
      : [];

    const secondaryText = this.buildIngresosSecondaryText(rs);

    return {
      key: 'ingresos',
      label: 'Ingresos',
      color: '#10b981',
      status,
      value,
      delta,
      deltaInverted: false,
      secondaryText,
      caption: null,
      sparkline: this.buildSparkline(sparkVals),
      gradId: 'fv2-card-spark-ingresos'
    };
  }

  /**
   * Subtexto de la card de ingresos.
   * Si cafetería aportó algo, muestra el desglose abreviado.
   * Si todo es mensualidades, muestra el conteo de pagos clásico.
   */
  private buildIngresosSecondaryText(rs: ResumenState | null): string {
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
    rs: ResumenState | null,
    ts: TendenciaState | null
  ): CardVM {
    const status = this.deriveResumenCardStatus(rs);
    const value = rs?.status === 'loaded' ? rs.data!.egresos_por_tipo.total_cop : 0;
    const delta = rs?.status === 'loaded' ? rs.data!.egresos_por_tipo.delta_cop : null;
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
      sparkline: this.buildSparkline(sparkVals),
      gradId: 'fv2-card-spark-egresos'
    };
  }

  private makeNominaCard(
    rs: ResumenState | null,
    ts: TendenciaState | null
  ): CardVM {
    const status = this.deriveResumenCardStatus(rs);
    const value = rs?.status === 'loaded' ? rs.data!.nomina.total_cop : 0;
    const delta = rs?.status === 'loaded' ? rs.data!.nomina.delta_cop : null;
    const cierres = rs?.status === 'loaded' ? rs.data!.nomina.cantidad_cierres ?? 0 : 0;

    // tendenciaState$ no expone nomina_cop directamente — derivar punto a punto.
    const sparkVals = ts?.status === 'loaded'
      ? ts.data!.map((p) =>
          Math.max(0, p.egresos_totales_cop - p.egresos_operativos_cop)
        )
      : [];

    return {
      key: 'nomina',
      label: 'Nómina pagada',
      color: '#6366f1',
      status,
      value,
      delta,
      deltaInverted: true,
      secondaryText: `${cierres} quincenas cerradas`,
      caption: null,
      sparkline: this.buildSparkline(sparkVals),
      gradId: 'fv2-card-spark-nomina'
    };
  }

  private makeCajaCard(
    cs: CajaState | null,
    ts: TendenciaState | null
  ): CardVM {
    const status: CardStatus = !cs || cs.status === 'loading'
      ? 'loading'
      : cs.status === 'error'
        ? 'error'
        : 'loaded';

    const value = cs?.status === 'loaded' ? cs.data!.caja_consolidada.saldo_cop : 0;
    const semillaFecha = cs?.status === 'loaded' ? cs.data!.caja_consolidada.semilla_fecha : null;

    const sparkVals = this.computeSaldoSeries(ts, cs);

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
      sparkline: this.buildSparkline(sparkVals),
      gradId: 'fv2-card-spark-caja'
    };
  }

  private deriveResumenCardStatus(rs: ResumenState | null): CardStatus {
    if (!rs || rs.status === 'loading') return 'loading';
    if (rs.status === 'error') return 'error';
    if (rs.status === 'pre-app') return 'pre-app';
    return 'loaded';
  }

  /** Convierte ISO YYYY-MM-DD → DD/MM/YYYY. */
  formatDateDmy(iso: string): string {
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [yyyy, mm, dd] = parts;
    return `${dd}/${mm}/${yyyy}`;
  }

  trackByCardKey(_i: number, c: CardVM): CardKey {
    return c.key;
  }

  // ─── Panel flotante de desglose de egresos ────────────────────────────────

  /** Clave de la card cuyo panel está abierto. null = ninguno abierto. */
  openCardKey: CardKey | null = null;

  @HostListener('document:keydown.escape')
  onEscKey(): void {
    if (this.openCardKey !== null) {
      this.openCardKey = null;
      this.cdr.markForCheck();
    }
  }

  /**
   * Alterna la apertura del panel de la card `key`.
   * Recibe el MouseEvent para llamar stopPropagation y evitar que el
   * HostListener de document:click cierre el panel inmediatamente.
   */
  onToggleEgresosPanel(key: CardKey, event: MouseEvent): void {
    event.stopPropagation();
    this.openCardKey = this.openCardKey === key ? null : key;
    this.cdr.markForCheck();
  }

  /** Cierra cualquier panel abierto al hacer click fuera. */
  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.openCardKey !== null) {
      this.openCardKey = null;
      this.cdr.markForCheck();
    }
  }

  /**
   * Construye las filas del desglose de egresos para el panel flotante.
   * Solo incluye tipos cuyo total_cop > 0, ordenados de mayor a menor.
   */
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

  trackByExpenseType(_i: number, r: EgresosDesgloseRow): ExpenseType {
    return r.tipo;
  }

  // ─── Saldo acumulado (compartido por card 4 y por la sección 03) ─────────

  /**
   * Calcula el saldo acumulado punto a punto desde la semilla.
   * Si tendencia o caja no están listos, devuelve [].
   */
  computeSaldoSeries(
    ts: TendenciaState | null,
    cs: CajaState | null
  ): number[] {
    if (!ts || ts.status !== 'loaded' || !cs || cs.status !== 'loaded') return [];
    const tendencia = ts.data!;
    const semilla = cs.data!.caja_consolidada.semilla_cop;
    if (tendencia.length === 0) return [semilla];

    const saldos: number[] = [semilla];
    for (let i = 1; i < tendencia.length; i++) {
      const prev = saldos[i - 1];
      saldos.push(prev + tendencia[i].ingresos_cop - tendencia[i].egresos_totales_cop);
    }
    return saldos;
  }

  // ─── Sección 02 — Tendencia ──────────────────────────────────────────────

  /**
   * Slice de la tendencia según la ventana seleccionada.
   * El backend en v2 entrega siempre 6 meses; aquí cortamos la cola.
   */
  windowedPuntos(
    puntos: FinanzasTendenciaResponse,
    ventana: VentanaTendenciaFin | null
  ): FinanzasTendenciaResponse {
    const v = ventana ?? 6;
    const n = VENTANA_PUNTOS[v];
    return puntos.length > n ? puntos.slice(-n) : puntos;
  }

  /**
   * Calcula la variación de utilidad entre primer y último punto.
   * Si la utilidad inicial es 0, no hay base de comparación → null.
   */
  buildVariacion(puntos: FinanzasTendenciaResponse): VariacionUtilidad {
    if (!puntos || puntos.length < 2) {
      return {
        pct: null,
        arrow: '→',
        display: 'N/A',
        cssClass: 'fv2-var--null',
        mesInicialLabel: ''
      };
    }
    const prev = puntos[0].utilidad_cop;
    const curr = puntos[puntos.length - 1].utilidad_cop;

    const mesInicialLabel = this.parseMesLabel(puntos[0].mes);

    if (prev === 0) {
      return {
        pct: null,
        arrow: '→',
        display: 'N/A',
        cssClass: 'fv2-var--null',
        mesInicialLabel
      };
    }

    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
    const cssClass = pct > 0 ? 'fv2-var--up' : pct < 0 ? 'fv2-var--down' : 'fv2-var--flat';
    const abs = Math.abs(pct);
    const formatted = Number.isInteger(abs)
      ? abs.toLocaleString('es-CO', { maximumFractionDigits: 0 })
      : abs.toLocaleString('es-CO', { maximumFractionDigits: 1 });

    return {
      pct,
      arrow,
      display: `${arrow} ${formatted}%`,
      cssClass,
      mesInicialLabel
    };
  }

  /**
   * Mini leyenda con barras min→max relativas al máximo global de las 3 series.
   * Las barras visualizan el techo de cada serie en la ventana.
   */
  buildSeriesLegend(puntos: FinanzasTendenciaResponse): SeriesLegendRow[] {
    if (!puntos || puntos.length === 0) return [];

    const ingresosVals = puntos.map((p) => p.ingresos_cop);
    const egresosVals  = puntos.map((p) => p.egresos_totales_cop);
    const utilidadVals = puntos.map((p) => p.utilidad_cop);

    const ingMin = Math.min(...ingresosVals);
    const ingMax = Math.max(...ingresosVals);
    const egrMin = Math.min(...egresosVals);
    const egrMax = Math.max(...egresosVals);
    const utiMin = Math.min(...utilidadVals);
    const utiMax = Math.max(...utilidadVals);

    const globalMax = Math.max(ingMax, egrMax, utiMax) || 1;

    return [
      {
        key: 'ingresos',
        label: 'Ingresos',
        color: COLOR_INGRESOS,
        minLabel: formatAmountShort(ingMin),
        maxLabel: formatAmountShort(ingMax),
        widthPct: (ingMax / globalMax) * 100
      },
      {
        key: 'egresos',
        label: 'Egresos totales',
        color: COLOR_EGRESOS,
        minLabel: formatAmountShort(egrMin),
        maxLabel: formatAmountShort(egrMax),
        widthPct: (egrMax / globalMax) * 100
      },
      {
        key: 'utilidad',
        label: 'Utilidad',
        color: COLOR_UTILIDAD,
        minLabel: formatAmountShort(utiMin),
        maxLabel: formatAmountShort(utiMax),
        widthPct: (Math.max(utiMax, 0) / globalMax) * 100
      }
    ];
  }

  /**
   * Construye el ChartData para la gráfica de barras agrupadas.
   * Mes actual: opacidad 0.65 + asterisco en label.
   */
  buildChartData(puntos: FinanzasTendenciaResponse): ChartData<'bar'> {
    const labels = puntos.map((p) => (p.es_mes_actual ? `${p.label} *` : p.label));

    const bgFor = (color: string, esActual: boolean): string =>
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

  /** Opciones de Chart.js — minimalistas para el estilo del v2 dashboard. */
  readonly chartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed.y ?? 0;
            return `${ctx.dataset.label}: ${formatAmountCop(v)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: '#6b7280',
          font: { size: 11 }
        }
      },
      y: {
        beginAtZero: true,
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: '#6b7280',
          font: { size: 11 },
          callback: (value) =>
            typeof value === 'number' ? formatAmountShort(value) : `${value}`
        }
      }
    }
  };

  /** Convierte un hex color a rgba con alpha. */
  private withAlpha(hex: string, alpha: number): string {
    const m = hex.replace('#', '');
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /** Convierte "2026-04" en "abril 2026". */
  private parseMesLabel(mes: string): string {
    const parts = mes.split('-');
    if (parts.length !== 2) return mes;
    const [y, m] = parts.map(Number);
    if (!m || m < 1 || m > 12) return mes;
    return `${MESES_COMPLETOS[m - 1]} ${y}`;
  }

  // ─── Sección 03 — Estado de caja: alerta de cierre de quincena ───────────

  /**
   * Calcula la información del cierre de quincena en curso.
   * - Si hoy ≤ 15: cierra el día 15 del mes actual.
   * - Si hoy > 15: cierra el último día del mes actual.
   * El resultado es independiente del período seleccionado en el filtro
   * (siempre se calcula contra "hoy" real).
   */
  buildQuincenaCierre(cs: CajaState | null): QuincenaCierreInfo | null {
    if (!cs || cs.status !== 'loaded') return null;

    const now = new Date();
    const today = now.getDate();
    const isQ1 = today <= 15;

    // Día de cierre y nombre del mes actual.
    const cierreDia = isQ1 ? 15 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const mesNombre = MESES_COMPLETOS[now.getMonth()];

    const target = new Date(now.getFullYear(), now.getMonth(), cierreDia, 23, 59, 59);
    const diffMs = target.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / 86_400_000));

    let countdownLabel: string;
    if (daysRemaining === 0) countdownLabel = 'hoy';
    else if (daysRemaining === 1) countdownLabel = 'en 1 día';
    else countdownLabel = `en ${daysRemaining} días`;

    let countdownVariant: QuincenaCierreInfo['countdownVariant'] = 'default';
    if (daysRemaining <= 1) countdownVariant = 'danger';
    else if (daysRemaining <= 3) countdownVariant = 'warn';

    return {
      cierreLabel: `${cierreDia} ${mesNombre}`,
      badgeLabel: cs.data!.caja_menor.quincena_label,
      daysRemaining,
      countdownLabel,
      countdownVariant
    };
  }

  // ─── Health gauge ─────────────────────────────────────────────────────────

  /** Tamaño del SVG del gauge según el viewport (responsive vía CSS — radio fijo). */
  readonly gaugeSize = 160; // base desktop; el SCSS escala en móvil

  /**
   * Construye la geometría del gauge semicircular (arc 180°).
   * El radio default es 60px (size=160 → r=60, stroke margin=20).
   */
  buildGauge(resumen: FinanzasResumenResponse): GaugeGeometry {
    const ingresos = resumen.ingresos.total_cop;
    const utilidad = resumen.utilidad.total_cop;

    // Margen utilidad / ingresos. Si ingresos = 0, ratio = 0.
    const rawRatio = ingresos === 0 ? 0 : utilidad / ingresos;
    const ratio = Math.min(Math.max(rawRatio, 0), 1);
    const pct = Math.round(ratio * 100);

    let color: string;
    let grade: GaugeGeometry['grade'];
    let description: string;

    if (pct === 100) {
      color = '#10b981';
      grade = 'EXCELENTE';
      description =
        'Sin egresos registrados, todo el ingreso es utilidad. Recordá registrar tus gastos antes del cierre.';
    } else if (pct >= 80) {
      color = '#10b981';
      grade = 'EXCELENTE';
      description =
        'Excelente margen. El gym retiene la mayoría de sus ingresos.';
    } else if (pct >= 60) {
      color = '#f59e0b';
      grade = 'BUENO';
      description =
        'Buen margen. Hay oportunidad de optimizar algunos gastos.';
    } else if (pct >= 40) {
      color = '#f97316';
      grade = 'REGULAR';
      description = 'Margen ajustado. Revisar composición de egresos.';
    } else {
      color = '#dc2626';
      grade = 'CRÍTICO';
      description =
        'Margen crítico. Los egresos consumen más del 60% de los ingresos.';
    }

    const size = this.gaugeSize;
    const stroke = 12;
    const r = size / 2 - stroke - 8;
    const cx = size / 2;
    const cy = size / 2 + 4; // ligeramente desplazado para centrar el arco

    // Arco semicircular: 180° → desde 180° (izquierda) hasta 360° (derecha).
    const startA = Math.PI;
    const endA = Math.PI * 2;
    const valA = startA + (endA - startA) * ratio;

    const width = size;
    const height = size / 2 + 12;

    return {
      trackD: this.arcPath(cx, cy, r, startA, endA),
      barD: this.arcPath(cx, cy, r, startA, valA),
      color,
      grade,
      description,
      pctLabel: pct.toString(),
      cx,
      cy,
      r,
      width,
      height,
      viewBox: `0 0 ${width} ${height}`
    };
  }

  private arcPath(
    cx: number,
    cy: number,
    r: number,
    a1: number,
    a2: number
  ): string {
    const safeA2 = a2 <= a1 ? a1 + 0.001 : a2;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(safeA2);
    const y2 = cy + r * Math.sin(safeA2);
    const large = safeA2 - a1 > Math.PI ? 1 : 0;
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECCIÓN 04 — Detalle de ingresos
  // ═══════════════════════════════════════════════════════════════════════

  // ─── Métodos de pago ──────────────────────────────────────────────────────

  /** Filas de la lista de métodos (sólo los que tienen total > 0). */
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
        datasets: [
          {
            data: [1],
            backgroundColor: ['#e5e7eb'],
            borderWidth: 0
          }
        ]
      };
    }

    const filtered = detalle.por_metodo.filter((m) => m.total_cop > 0);
    return {
      labels: filtered.map(
        (m) => PAYMENT_METHOD_LABELS[m.metodo] ?? m.label
      ),
      datasets: [
        {
          data: filtered.map((m) => m.total_cop),
          backgroundColor: filtered.map((m) => METODO_COLORS[m.metodo]),
          borderWidth: 2,
          borderColor: '#ffffff'
        }
      ]
    };
  }

  readonly metodoChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = (ctx.parsed as unknown as number) ?? 0;
            const total = ctx.dataset.data.reduce(
              (a: number, b: unknown) => a + ((b as number) ?? 0),
              0
            );
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
            return `${ctx.label}: ${formatAmountCop(value)} (${pct}%)`;
          }
        }
      }
    }
  };

  // ─── Quincenas ────────────────────────────────────────────────────────────

  buildQuincenaRows(detalle: FinanzasDetalleResponse): QuincenaRow[] {
    const q1 = detalle.quincenas.q1;
    const q2 = detalle.quincenas.q2;
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
    const q1 = detalle.quincenas.q1.total_cop;
    const q2 = detalle.quincenas.q2.total_cop;
    const q2Estado = detalle.quincenas.q2.estado;

    if (q2Estado === 'no_iniciada') {
      return 'La Q1 concentra el 100% del ingreso del mes. La Q2 aún no inició.';
    }

    const total = q1 + q2;
    if (total === 0) {
      return 'Aún no hay ingresos registrados en este período.';
    }

    if (q1 === q2) {
      return 'Ingresos distribuidos uniformemente entre quincenas.';
    }

    if (q1 > q2) {
      const pct = Math.round((q1 / total) * 100);
      return `La Q1 concentra el ${pct}% del ingreso mensual.`;
    }

    const pct = Math.round((q2 / total) * 100);
    return `La Q2 superó a Q1 este mes (${pct}% del total).`;
  }

  /** "Cierre 15 mayo · 31 mayo" basado en fecha real, no en período. */
  buildQuincenaCierreLabel(): string {
    const now = new Date();
    const today = now.getDate();
    const mesNombre = MESES_COMPLETOS[now.getMonth()];
    const ultimoDia = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    if (today <= 15) {
      return `Cierre 15 ${mesNombre} · ${ultimoDia} ${mesNombre}`;
    }
    return `Cierre ${ultimoDia} ${mesNombre}`;
  }

  /** Total de pagos del mes para el header de la card de métodos. */
  totalPagos(detalle: FinanzasDetalleResponse): number {
    return detalle.por_metodo.reduce((acc, m) => acc + m.cantidad_pagos, 0);
  }

  trackByMetodo(_i: number, m: MetodoPagoRow): MetodoPago {
    return m.metodo;
  }

  trackByQuincenaKey(_i: number, q: QuincenaRow): 'q1' | 'q2' {
    return q.key;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECCIÓN 05 — Composición de egresos
  // ═══════════════════════════════════════════════════════════════════════

  /** Filas de composición según la vista activa (categoría o proveedor). No aplica a origen_ingresos. */
  buildComposicionRows(comp: FinanzasComposicionResponse): ComposicionRow[] {
    if (!comp.tiene_datos) return [];
    if (this.vistaComposicion === 'origen_ingresos') return [];

    const rows = this.vistaComposicion === 'categoria'
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

  buildComposicionChartData(comp: FinanzasComposicionResponse): ChartData<'doughnut'> {
    if (!comp.tiene_datos) {
      return {
        labels: ['Sin datos'],
        datasets: [
          {
            data: [1],
            backgroundColor: ['#e5e7eb'],
            borderWidth: 0
          }
        ]
      };
    }

    const rows = this.buildComposicionRows(comp);
    return {
      labels: rows.map((r) => r.nombre),
      datasets: [
        {
          data: rows.map((r) => r.total_cop),
          backgroundColor: rows.map((r) => r.color),
          borderWidth: 2,
          borderColor: '#ffffff'
        }
      ]
    };
  }

  // ─── Vista "Origen ingresos" (A.3) ───────────────────────────────────────

  /** Color para la sección Mensualidades en la dona de ingresos. */
  private readonly COLOR_MENSUALIDADES = '#10b981';
  /** Color amber para Cafetería en la dona de ingresos. */
  private readonly COLOR_CAFETERIA_DONA = '#f59e0b';

  buildIngresosRows(ci: ComposicionIngresos): ComposicionRow[] {
    const rows: ComposicionRow[] = [];
    if (ci.mensualidades_cop > 0) {
      rows.push({
        id: 'mensualidades',
        nombre: 'Mensualidades',
        total_cop: ci.mensualidades_cop,
        porcentaje: ci.mensualidades_pct,
        cantidad: 0,
        color: this.COLOR_MENSUALIDADES,
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
        color: this.COLOR_CAFETERIA_DONA,
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

  readonly composicionChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = (ctx.parsed as unknown as number) ?? 0;
            const total = ctx.dataset.data.reduce(
              (a: number, b: unknown) => a + ((b as number) ?? 0),
              0
            );
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
            return `${ctx.label}: ${formatAmountCop(value)} (${pct}%)`;
          }
        }
      }
    }
  };

  trackByComposicionId(_i: number, r: ComposicionRow): string {
    return r.id;
  }

  // ─── trackBy ──────────────────────────────────────────────────────────────

  trackByIndex(index: number): number {
    return index;
  }
}
