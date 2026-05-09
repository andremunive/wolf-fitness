import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy
} from '@angular/core';
import {
  BehaviorSubject,
  combineLatest,
  Observable,
  of,
  Subject
} from 'rxjs';
import {
  catchError,
  map,
  shareReplay,
  startWith,
  switchMap
} from 'rxjs/operators';

import {
  ChartConfiguration,
  ChartData,
  Chart as ChartJS,
  Plugin
} from 'chart.js';

import { EstadisticasService } from '../../../services/estadisticas.service';
import {
  ClientesActivosCards,
  ClientesQuincenalCards,
  CohortBreakdown,
  DetalleResponse,
  EnRiesgoEntry,
  EntrenadorFilter,
  EntrenadorOption,
  NuevosPorOrigen,
  PlanFilter,
  QuincenaBreakdown,
  QuincenalTendenciaResponse,
  TendenciaResponse,
  VentanaQuincenal,
  VentanaTendencia
} from '../../../models/estadisticas.model';

// ─── Estados ──────────────────────────────────────────────────────────────────

interface CardsStateLoading {
  status: 'loading';
  data: null;
}
interface CardsStateLoaded {
  status: 'loaded';
  data: ClientesActivosCards;
}
interface CardsStateError {
  status: 'error';
  data: null;
}
type CardsState = CardsStateLoading | CardsStateLoaded | CardsStateError;

interface SparklineStateLoading {
  status: 'loading';
  data: null;
}
interface SparklineStateLoaded {
  status: 'loaded';
  data: TendenciaResponse;
}
interface SparklineStateError {
  status: 'error';
  data: null;
}
type SparklineState =
  | SparklineStateLoading
  | SparklineStateLoaded
  | SparklineStateError;

interface DetalleStateLoading {
  status: 'loading';
  data: null;
}
interface DetalleStateLoaded {
  status: 'loaded';
  data: DetalleResponse;
}
interface DetalleStateError {
  status: 'error';
  data: null;
}
type DetalleState = DetalleStateLoading | DetalleStateLoaded | DetalleStateError;

interface QuincenalStateLoading {
  status: 'loading';
  data: null;
}
interface QuincenalStateLoaded {
  status: 'loaded';
  data: ClientesQuincenalCards;
}
interface QuincenalStateError {
  status: 'error';
  data: null;
}
type QuincenalState =
  | QuincenalStateLoading
  | QuincenalStateLoaded
  | QuincenalStateError;

interface QuincenalTendStateLoading {
  status: 'loading';
  data: null;
}
interface QuincenalTendStateLoaded {
  status: 'loaded';
  data: QuincenalTendenciaResponse;
}
interface QuincenalTendStateError {
  status: 'error';
  data: null;
}
type QuincenalTendState =
  | QuincenalTendStateLoading
  | QuincenalTendStateLoaded
  | QuincenalTendStateError;

// ─── Geometrías SVG ───────────────────────────────────────────────────────────

interface SparklineGeometry {
  linePath: string;
  areaPath: string;
  lastX: number;
  lastY: number;
  width: number;
  height: number;
}

interface GaugeGeometry {
  trackD: string;
  barD: string;
  color: string;
  grade: 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'CRÍTICO';
  description: string;
  pctLabel: string;
  cx: number;
  cy: number;
  r: number;
  width: number;
  height: number;
  viewBox: string;
}

// ─── Card VM (Sección 01 — Movimiento del mes) ────────────────────────────────

export type CardKey =
  | 'tipo_a'
  | 'tipo_b'
  | 'nuevos'
  | 'recuperados'
  | 'nuevos_referido'
  | 'nuevos_publicidad'
  | 'nuevos_directos';
export type CardStatus = 'loading' | 'loaded' | 'error';
/** Tendencia de la sparkline: arriba (verde), abajo (rojo) o plana (gris). */
export type CardTrend = 'up' | 'down' | 'flat';

export interface CardVM {
  key: CardKey;
  label: string;
  /**
   * Color del dot identificador de la card en el header (semántico de la card,
   * no de la tendencia). La sparkline usa `trendColor` aparte.
   */
  color: string;
  /** Tendencia derivada de delta. La sparkline pinta este color. */
  trend: CardTrend;
  /** Color final de la línea/area del sparkline (verde / rojo / gris). */
  trendColor: string;
  status: CardStatus;
  value: number;
  /** null = no se muestra chip de delta (Nuevos / Recuperados). */
  delta: number | null;
  /** "6d: X · 3d: X" */
  secondaryText: string;
  /** Geometría del sparkline o null si no hay datos suficientes. */
  sparkline: SparklineGeometry | null;
  /** Sufijo único del id del gradient SVG por card. */
  gradId: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const SPARKLINE_VB_WIDTH = 320;
const SPARKLINE_VB_HEIGHT = 60;
const SPARKLINE_PADDING_Y = 6;

/** Colores semánticos por card. */
const COLOR_TIPO_A      = '#10b981'; // success
const COLOR_TIPO_B      = '#228d9f'; // brand
const COLOR_NUEVOS      = '#f59e0b'; // amber
const COLOR_RECUPERADOS = '#6366f1'; // indigo

/**
 * Colores para la fila de "Nuevos por origen" — distintos entre sí y de los
 * cuatro colores de la fila superior, manteniendo la paleta general del
 * dashboard.
 */
const COLOR_NUEVOS_REFERIDO   = '#ec4899'; // pink — relacional, referidos
const COLOR_NUEVOS_PUBLICIDAD = '#06b6d4'; // cyan — canal digital
const COLOR_NUEVOS_DIRECTOS   = '#8b5cf6'; // violet — orgánico

/**
 * Meta visual de las cards "Nuevos por origen". Centraliza label, color del
 * dot y prefijo único del id de gradiente — el maker `makeOrigenCard` solo
 * lee de aquí.
 */
const ORIGEN_CARD_META: Record<
  'nuevos_referido' | 'nuevos_publicidad' | 'nuevos_directos',
  { label: string; color: string; gradId: string }
> = {
  nuevos_referido: {
    label:  'Nuevos por Recomendación',
    color:  COLOR_NUEVOS_REFERIDO,
    gradId: 'cv2-spark-nuevos-referido'
  },
  nuevos_publicidad: {
    label:  'Nuevos por Publicidad',
    color:  COLOR_NUEVOS_PUBLICIDAD,
    gradId: 'cv2-spark-nuevos-publicidad'
  },
  nuevos_directos: {
    label:  'Nuevos Directos',
    color:  COLOR_NUEVOS_DIRECTOS,
    gradId: 'cv2-spark-nuevos-directos'
  }
};

/**
 * Colores semánticos de la sparkline comparativa (sección 01).
 * up = la métrica creció vs el periodo de comparación → verde.
 * down = la métrica bajó → rojo.
 * flat = sin cambio (o sin datos para comparar) → gris.
 */
const TREND_COLORS: Record<'up' | 'down' | 'flat', string> = {
  up:   '#10b981',
  down: '#dc2626',
  flat: '#9ca3af'
};

/** Colores del desglose de planes (tokens de marca). */
const COLOR_PLAN_6D = '#228d9f';
const COLOR_PLAN_3D = '#67e8f9';

/** Sección 04 — colores de las series de la gráfica. */
const COLOR_SERIE_TOTAL = '#228d9f'; // brand
const COLOR_SERIE_6D    = '#1a7080'; // brand-dark (para diferenciarse de Total)
const COLOR_SERIE_3D    = '#67e8f9'; // cyan-300

/** Ventanas disponibles en la sección 04. */
const VENTANAS_TENDENCIA: VentanaTendencia[] = [1, 2, 6, 12];

const VENTANA_TENDENCIA_LABELS: Record<VentanaTendencia, string> = {
  1:  'Mes anterior',
  2:  'Últimos 2 meses',
  6:  'Últimos 6 meses',
  12: 'Últimos 12 meses'
};

/** Ventanas disponibles en la sección 05 (distribución quincenal). */
const VENTANAS_QUINCENAL: VentanaQuincenal[] = [1, 2, 3, 6];
const VENTANA_QUINCENAL_LABELS: Record<VentanaQuincenal, string> = {
  1: 'Mes anterior',
  2: 'Últimos 2 meses',
  3: 'Últimos 3 meses',
  6: 'Últimos 6 meses'
};

/** Filtro local de plan (sección 05). */
const PLANES: PlanFilter[] = ['todos', '6d', '3d'];
const PLAN_LABELS: Record<PlanFilter, string> = {
  todos: 'Todos',
  '6d':  '6 días',
  '3d':  '3 días'
};

/** Colores de las barras Q1 / Q2 (sección 05). */
const COLOR_DIST_Q1 = '#228d9f';
const COLOR_DIST_Q2 = 'rgba(34, 141, 159, 0.55)';

/**
 * Paleta de avatares para clientes en riesgo (sección 06).
 * Cada entrada es un par [bg, fg] — fondo suave + foreground más oscuro
 * del mismo tono. La selección por nombre es determinista.
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

// ─── Quincena VM (Sección 02) ─────────────────────────────────────────────────

export type QuincenaKey = 'q1' | 'q2';
export type QuincenaEstado = 'no_iniciada' | 'parcial' | 'completa';

/** Una columna del desglose por plan dentro de la card de quincena. */
export interface QuincenaPlanCol {
  /** Etiqueta visible: "Plan 6 días" / "Plan 3 días". */
  label: string;
  /** Color del dot/barra. */
  color: string;
  /** Cantidad de clientes en el plan. */
  value: number;
  /** Porcentaje sobre el total de la quincena (0-100). */
  pct: number;
  /** Width % de la barra (= pct, redondeado para evitar saltos). */
  widthPct: number;
}

export interface QuincenaCardVM {
  key: QuincenaKey;
  /** "PAGARON Q1" / "PAGARON Q2" */
  label: string;
  /** "1 — 15 may" / "16 — 31 may" — calculado contra el período actual. */
  rangeBadge: string;
  estado: QuincenaEstado;
  /** Total + delta + planos: solo presentes si estado != 'no_iniciada'. */
  total: number;
  delta: number | null;
  plan6d: QuincenaPlanCol;
  plan3d: QuincenaPlanCol;
  /** True si comparativa parcial (mostrar "· corte parcial"). */
  isParcial: boolean;
  /** Solo Q2 no_iniciada: información del countdown. */
  inicio: QuincenaInicioInfo | null;
}

/** Info para la alerta "La quincena inicia el 16 de mayo · en X días". */
export interface QuincenaInicioInfo {
  /** "16 de mayo" — fecha de inicio en lenguaje natural. */
  fechaLabel: string;
  /** Días restantes hasta el día 16 (inclusive si hoy = 16). */
  diasRestantes: number;
  /** "en 8 días" / "en 1 día" / "hoy". */
  countdownLabel: string;
  /** 'default' | 'warn' (≤ 3 días). */
  variant: 'default' | 'warn';
}

// ─── Sección 03 — Estado de cartera ───────────────────────────────────────────

/** Pendientes: solo informativo, sin delta. */
export interface PendientesVM {
  total: number;
  /** "6d: X · 3d: X" */
  secondaryText: string;
}

/**
 * Perdidos: con delta INVERTIDO (más perdidos = peor).
 * - Si delta > 0 → rojo (`fv2-pill--down` semántico, no por signo).
 * - Si delta < 0 → verde.
 */
export interface PerdidosVM {
  total: number;
  delta: number;
  secondaryText: string;
  /** Color del valor grande (rojo si total > 0). */
  valueColorClass: 'cv2-perdidos__value--danger' | 'cv2-perdidos__value--neutral';
  /** Clase del chip de delta ya con la inversión aplicada. */
  pillClass: string;
  /** Flecha: ↑ ↓ → */
  pillArrow: string;
  /** Magnitud absoluta del delta para el chip. */
  pillAbs: number;
}

// ─── Sección 04 — Tendencia ───────────────────────────────────────────────────

export interface VariacionVM {
  /** "↑ 2,500%" / "↓ 12%" / "N/A" */
  display: string;
  /** Clase CSS del color del valor. */
  cssClass:
    | 'cv2-var--up'
    | 'cv2-var--down'
    | 'cv2-var--flat'
    | 'cv2-var--null';
  /** "Abr 26" — etiqueta del primer mes en la ventana, o '' si N/A. */
  mesInicialLabel: string;
}

export interface SeriesLegendRow {
  key: 'total' | '6d' | '3d';
  label: string;
  color: string;
  minLabel: string;
  maxLabel: string;
  /** ancho relativo de la barra 0-100 sobre el max global. */
  widthPct: number;
}

// ─── Sección 06 — Clientes en riesgo ──────────────────────────────────────────

export interface RiesgoVM {
  cliente_id: string;
  nombre: string;
  /** "JS" — derivadas del nombre. */
  iniciales: string;
  /** Color de fondo del avatar (paleta determinista por nombre). */
  avatarBg: string;
  /** Color del texto del avatar (versión más oscura del mismo tono). */
  avatarFg: string;
  entrenador: string;
  plan: '6d' | '3d';
  /** Etiqueta del plan: "6 días" / "3 días". */
  planLabel: string;
  /** Clase del badge de plan. */
  planClass: 'cv2-plan-badge--6d' | 'cv2-plan-badge--3d';
  ultimoPagoFmt: string;     // DD/MM/YYYY
  venceElFmt: string;        // DD/MM/YYYY
  /** Color de la fecha "vence_el" según urgencia. */
  venceColorClass:
    | 'cv2-vence--vencido'
    | 'cv2-vence--proximo'
    | 'cv2-vence--ok';
  /** "Pendiente" / "Por vencer". */
  estadoLabel: string;
  /** Clase del badge de estado. */
  estadoClass: 'cv2-estado-badge--pendiente' | 'cv2-estado-badge--por-vencer';
}

/** VM de la card oscura de retención. */
export interface RetencionVM {
  /** Texto del valor: "85.5%" o "—". */
  tasaLabel: string;
  /** Clase de color sobre fondo oscuro. */
  tasaColorClass:
    | 'cv2-retencion__value--good'
    | 'cv2-retencion__value--ok'
    | 'cv2-retencion__value--mid'
    | 'cv2-retencion__value--bad'
    | 'cv2-retencion__value--null';
  /** Badge "X de Y" (X = repitieron, Y = activos mes anterior). */
  ratioBadge: string;
  /** "X de Y clientes repitieron" o variante para 0/1. */
  primaryLine: string;
  /** Línea contextual debajo (mes anterior / sin referencia). */
  contextLine: string;
  /** Si true, el valor es null y se muestra estado vacío. */
  isNull: boolean;
  /** Total de clientes recuperados (fila inferior). */
  recuperadosTotal: number;
}

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
];

const MESES_COMPLETOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

@Component({
  selector: 'app-clientes-dashboard',
  templateUrl: './clientes-dashboard.component.html',
  styleUrls: ['./clientes-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientesDashboardComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();

  // ─── Filtros ────────────────────────────────────────────────────────────────

  readonly selectedEntrenador$: Observable<EntrenadorFilter> =
    this.svc.selectedEntrenador$;

  readonly entrenadores$: Observable<EntrenadorOption[]> = this.svc
    .getEntrenadores()
    .pipe(
      catchError(() => of([] as EntrenadorOption[])),
      shareReplay(1)
    );

  // ─── Ventana de tendencia (sección 04) ──────────────────────────────────────

  readonly ventanasTendencia: VentanaTendencia[] = VENTANAS_TENDENCIA;
  readonly ventanaTendenciaLabels: Record<VentanaTendencia, string> =
    VENTANA_TENDENCIA_LABELS;
  readonly ventanaTendencia$: Observable<VentanaTendencia> =
    this.svc.ventanaTendencia$;

  // ─── Ventana + plan filter (sección 05) ────────────────────────────────────

  readonly ventanasQuincenal: VentanaQuincenal[] = VENTANAS_QUINCENAL;
  readonly ventanaQuincenalLabels: Record<VentanaQuincenal, string> =
    VENTANA_QUINCENAL_LABELS;
  readonly ventanaQuincenal$: Observable<VentanaQuincenal> =
    this.svc.ventanaQuincenal$;

  readonly planes: PlanFilter[] = PLANES;
  readonly planLabels: Record<PlanFilter, string> = PLAN_LABELS;

  /** Estado local del filtro de plan (no llama EF). */
  planFilter: PlanFilter = 'todos';

  // ─── Estado de cards (cards EF) ─────────────────────────────────────────────

  readonly cardsState$: Observable<CardsState> = this.svc
    .getClientesActivosCards()
    .pipe(
      map((data): CardsState => ({ status: 'loaded', data })),
      catchError((): Observable<CardsState> =>
        of({ status: 'error', data: null })
      ),
      startWith<CardsState>({ status: 'loading', data: null }),
      shareReplay(1)
    );

  // ─── Estado del sparkline (tendencia EF — meses_atras=6) ────────────────────

  readonly sparklineState$: Observable<SparklineState> = this.svc
    .getTendencia()
    .pipe(
      map((data): SparklineState => ({ status: 'loaded', data })),
      catchError((): Observable<SparklineState> =>
        of({ status: 'error', data: null })
      ),
      startWith<SparklineState>({ status: 'loading', data: null }),
      shareReplay(1)
    );

  // ─── Estado del detalle (nuevos / recuperados — sección 01) ─────────────────

  private readonly retryDetalle$ = new BehaviorSubject<void>(undefined);

  readonly detalleState$: Observable<DetalleState> = this.retryDetalle$.pipe(
    switchMap(() =>
      this.svc.getDetalle().pipe(
        map((data): DetalleState => ({ status: 'loaded', data })),
        catchError((): Observable<DetalleState> =>
          of({ status: 'error', data: null })
        ),
        startWith<DetalleState>({ status: 'loading', data: null })
      )
    ),
    shareReplay(1)
  );

  // ─── Estado de quincenas (sección 02) ──────────────────────────────────────

  private readonly retryQuincenal$ = new BehaviorSubject<void>(undefined);

  readonly quincenalState$: Observable<QuincenalState> = this.retryQuincenal$.pipe(
    switchMap(() =>
      this.svc.getQuincenalCards().pipe(
        map((data): QuincenalState => ({ status: 'loaded', data })),
        catchError((): Observable<QuincenalState> =>
          of({ status: 'error', data: null })
        ),
        startWith<QuincenalState>({ status: 'loading', data: null })
      )
    ),
    shareReplay(1)
  );

  // ─── Estado de la distribución quincenal (sección 05) ──────────────────────

  private readonly retryQuincenalTend$ = new BehaviorSubject<void>(undefined);

  readonly quincenalTendenciaState$: Observable<QuincenalTendState> =
    this.retryQuincenalTend$.pipe(
      switchMap(() =>
        this.svc.getQuincenalTendencia().pipe(
          map((data): QuincenalTendState => ({ status: 'loaded', data })),
          catchError((): Observable<QuincenalTendState> =>
            of({ status: 'error', data: null })
          ),
          startWith<QuincenalTendState>({ status: 'loading', data: null })
        )
      ),
      shareReplay(1)
    );

  // ─── Stream combinado para la card derecha (gauge depende de cards) ─────────

  readonly heroState$: Observable<{
    cards: CardsState;
    spark: SparklineState;
  }> = combineLatest([this.cardsState$, this.sparklineState$]).pipe(
    map(([cards, spark]) => ({ cards, spark }))
  );

  // ─── Labels precomputados ──────────────────────────────────────────────────

  /** "vs 1-X mmm" para el delta pill del hero. */
  readonly deltaLabelMonth: string;
  /** "Mayo 2026" — periodo en curso. */
  readonly periodoLabel: string;
  /** "DD/MM/YYYY" — fecha de hoy para el corte. */
  readonly cortePeriodLabel: string;
  /** "ESTADÍSTICAS — CLIENTES — MAYO 2026" */
  readonly breadcrumbCurrent: string;
  /** Subtítulo de la sección 01 — "Quiénes están aportando ... vs 1-X abr". */
  readonly subtitleSeccion01: string;

  constructor(
    private readonly svc: EstadisticasService,
    private readonly cdr: ChangeDetectorRef
  ) {
    const today = new Date();
    this.deltaLabelMonth = this.buildDeltaLabelMonth(today);
    this.periodoLabel = this.buildPeriodoLabel(today);
    this.cortePeriodLabel = this.buildCortePeriodLabel(today);
    this.breadcrumbCurrent = this.periodoLabel.toUpperCase();
    this.subtitleSeccion01 =
      `Quiénes están aportando al activo del período · datos comparados ${this.deltaLabelMonth}`;
  }

  ngOnDestroy(): void {
    // El servicio mantiene el filtro de entrenador a propósito (estado global).
    // Solo cerramos el subject local.
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Filtro de entrenador ───────────────────────────────────────────────────

  onEntrenadorChange(value: string): void {
    this.svc.setEntrenador((value || 'todos') as EntrenadorFilter);
  }

  // ─── Retry ──────────────────────────────────────────────────────────────────

  retryHero(): void {
    // Re-asignar el mismo entrenador re-dispara los streams.
    const current = this.snapshotEntrenador();
    this.svc.setEntrenador('todos');
    if (current !== 'todos') {
      this.svc.setEntrenador(current);
    } else {
      this.svc.setEntrenador('todos');
    }
  }

  retryDetalle(): void {
    this.retryDetalle$.next();
  }

  retryQuincenal(): void {
    this.retryQuincenal$.next();
  }

  /**
   * Decide qué stream re-intentar según el `key` de la card.
   * Las cards alimentadas por `detalleState$` (nuevos / recuperados / nuevos
   * por origen) reintentan el detalle; el resto reintenta el hero.
   */
  cardRetryFor(key: CardKey): void {
    if (key === 'recuperados' || key.startsWith('nuevos')) {
      this.retryDetalle();
    } else {
      this.retryHero();
    }
  }

  // ─── Ventana de tendencia (sección 04) ──────────────────────────────────────

  onVentanaTendenciaChange(n: VentanaTendencia): void {
    this.svc.setVentanaTendencia(n);
  }

  trackByVentana(_i: number, v: VentanaTendencia): VentanaTendencia {
    return v;
  }

  // ─── Sección 05 — handlers ────────────────────────────────────────────────

  onVentanaQuincenalChange(n: VentanaQuincenal): void {
    this.svc.setVentanaQuincenal(n);
  }

  onPlanFilterChange(p: PlanFilter): void {
    this.planFilter = p;
    this.cdr.markForCheck();
  }

  retryQuincenalTendencia(): void {
    this.retryQuincenalTend$.next();
  }

  trackByVentanaQ(_i: number, v: VentanaQuincenal): VentanaQuincenal {
    return v;
  }

  trackByPlan(_i: number, p: PlanFilter): PlanFilter {
    return p;
  }

  /** Snapshot sincrónico del entrenador seleccionado (para retry). */
  private snapshotEntrenador(): EntrenadorFilter {
    let value: EntrenadorFilter = 'todos';
    this.selectedEntrenador$
      .subscribe((v) => (value = v))
      .unsubscribe();
    return value;
  }

  // ─── Sparkline (igual patrón que finanzas-v2) ───────────────────────────────

  buildSparkline(
    values: number[],
    width = SPARKLINE_VB_WIDTH,
    height = SPARKLINE_VB_HEIGHT
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

  buildHeroSparkline(puntos: TendenciaResponse): SparklineGeometry | null {
    return this.buildSparkline(puntos.map((p) => p.total));
  }

  /** Etiqueta de mes corta para los extremos del sparkline ("Dic 25" / "May 26"). */
  shortMonthLabel(mes: string): string {
    const parts = mes.split('-');
    if (parts.length !== 2) return mes;
    const [y, m] = parts.map(Number);
    if (!m || m < 1 || m > 12) return mes;
    const yy = String(y).slice(-2);
    const ms = MESES_CORTOS[m - 1];
    return `${ms.charAt(0).toUpperCase()}${ms.slice(1)} ${yy}`;
  }

  // ─── Gauge de salud de cartera ──────────────────────────────────────────────

  readonly gaugeSize = 160;

  buildGauge(cards: ClientesActivosCards): GaugeGeometry {
    const activos = cards.total_activos_hoy.total;
    const total = cards.total_clientes_sistema;

    const rawRatio = total === 0 ? 0 : activos / total;
    const ratio = Math.min(Math.max(rawRatio, 0), 1);
    const pct = Math.round(ratio * 100);

    const enMora = Math.max(0, total - activos);

    let color: string;
    let grade: GaugeGeometry['grade'];
    let description: string;

    if (pct >= 80) {
      color = '#10b981';
      grade = 'EXCELENTE';
      description = `${activos} de ${total} clientes con pago al día. ${enMora} en mora.`;
    } else if (pct >= 60) {
      color = '#f59e0b';
      grade = 'BUENO';
      description = `Buen nivel de actividad. ${enMora} clientes requieren seguimiento.`;
    } else if (pct >= 40) {
      color = '#f97316';
      grade = 'REGULAR';
      description = 'Nivel ajustado. Revisar clientes pendientes.';
    } else {
      color = '#dc2626';
      grade = 'CRÍTICO';
      description = 'Nivel crítico. Muchos clientes sin renovar.';
    }

    const size = this.gaugeSize;
    const stroke = 12;
    const r = size / 2 - stroke - 8;
    const cx = size / 2;
    const cy = size / 2 + 4;

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

  // ─── Delta pill helpers ─────────────────────────────────────────────────────

  deltaPillClass(delta: number): string {
    if (delta > 0) return 'cv2-pill cv2-pill--up';
    if (delta < 0) return 'cv2-pill cv2-pill--down';
    return 'cv2-pill cv2-pill--flat';
  }

  deltaPillArrow(delta: number): string {
    if (delta > 0) return '↑';
    if (delta < 0) return '↓';
    return '→';
  }

  // ─── Etiqueta del delta del mes ("vs 1-X abr") ──────────────────────────────

  private buildDeltaLabelMonth(today: Date): string {
    const day = today.getDate();
    const prevMonthIndex = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
    const prevMonthDays = new Date(
      today.getFullYear(),
      today.getMonth(),
      0
    ).getDate();
    const dayClamped = Math.min(day, prevMonthDays);
    return `vs 1-${dayClamped} ${MESES_CORTOS[prevMonthIndex]}`;
  }

  private buildPeriodoLabel(today: Date): string {
    const m = MESES_COMPLETOS[today.getMonth()];
    return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${today.getFullYear()}`;
  }

  private buildCortePeriodLabel(today: Date): string {
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${today.getFullYear()}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 01 — Movimiento del mes (2 filas: 4 cards + 3 cards por origen)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fila superior: Tipo A, Tipo B, Nuevos, Recuperados.
   * Cada card lleva su propio status para que el template pueda renderizar
   * skeleton/error/loaded de forma independiente.
   */
  buildCards(
    cs: CardsState | null,
    ds: DetalleState | null
  ): CardVM[] {
    return [
      this.makeTipoACard(cs),
      this.makeTipoBCard(cs),
      this.makeNuevosCard(ds),
      this.makeRecuperadosCard(ds)
    ];
  }

  /**
   * Fila inferior: Nuevos por canal de captación (Recomendación, Publicidad,
   * Directos). Subdivide la cohorte `nuevos` por `clients.origin` — totales
   * suman a `nuevos.total`. Comparación: mismo rango día-a-día del mes anterior.
   */
  buildOrigenCards(ds: DetalleState | null): CardVM[] {
    return [
      this.makeOrigenCard(ds, 'nuevos_referido'),
      this.makeOrigenCard(ds, 'nuevos_publicidad'),
      this.makeOrigenCard(ds, 'nuevos_directos')
    ];
  }

  /**
   * Maker genérico para las cards de "Nuevos por origen". El `key` determina
   * el slot que se lee del response (`nuevos_por_origen.{referido | publicidad
   * | llego_solo}`), el label visible y el color del dot.
   */
  private makeOrigenCard(
    ds: DetalleState | null,
    key: 'nuevos_referido' | 'nuevos_publicidad' | 'nuevos_directos'
  ): CardVM {
    const status = this.deriveDetalleStatus(ds);
    const data   = ds?.status === 'loaded' ? ds.data : null;

    const slot = data
      ? this.pickOrigenSlot(data.nuevos_por_origen, key)
      : null;

    const value  = slot?.total   ?? 0;
    const delta  = slot?.delta   ?? null;
    const plan6d = slot?.plan_6d ?? 0;
    const plan3d = slot?.plan_3d ?? 0;

    const trend  = this.deriveTrend(data ? value : null, delta);
    const trendColor = TREND_COLORS[trend];

    const meta = ORIGEN_CARD_META[key];

    return {
      key,
      label: meta.label,
      color: meta.color,
      trend,
      trendColor,
      status,
      value,
      delta,
      secondaryText: `6d: ${plan6d} · 3d: ${plan3d}`,
      sparkline: this.buildTrendSparkline(value, delta),
      gradId: meta.gradId
    };
  }

  /** Mapea el CardKey de origen al slot correspondiente del response. */
  private pickOrigenSlot(
    porOrigen: NuevosPorOrigen,
    key: 'nuevos_referido' | 'nuevos_publicidad' | 'nuevos_directos'
  ): CohortBreakdown {
    if (key === 'nuevos_referido')   return porOrigen.referido;
    if (key === 'nuevos_publicidad') return porOrigen.publicidad;
    return porOrigen.llego_solo;
  }

  private makeTipoACard(cs: CardsState | null): CardVM {
    const status = this.deriveCardsStatus(cs);
    const data   = cs?.status === 'loaded' ? cs.data : null;
    const value  = data?.tipo_a.total ?? 0;
    const delta  = data?.tipo_a.delta ?? null;
    const plan6d = data?.tipo_a.plan_6d ?? 0;
    const plan3d = data?.tipo_a.plan_3d ?? 0;

    const trend  = this.deriveTrend(data ? value : null, delta);
    const trendColor = TREND_COLORS[trend];

    return {
      key: 'tipo_a',
      label: 'Pagaron',
      color: COLOR_TIPO_A,
      trend,
      trendColor,
      status,
      value,
      delta,
      secondaryText: `6d: ${plan6d} · 3d: ${plan3d}`,
      sparkline: this.buildTrendSparkline(value, delta),
      gradId: 'cv2-spark-tipo-a'
    };
  }

  private makeTipoBCard(cs: CardsState | null): CardVM {
    const status = this.deriveCardsStatus(cs);
    const data   = cs?.status === 'loaded' ? cs.data : null;
    const value  = data?.tipo_b.total ?? 0;
    const delta  = data?.tipo_b.delta ?? null;
    const plan6d = data?.tipo_b.plan_6d ?? 0;
    const plan3d = data?.tipo_b.plan_3d ?? 0;

    const trend  = this.deriveTrend(data ? value : null, delta);
    const trendColor = TREND_COLORS[trend];

    return {
      key: 'tipo_b',
      label: 'Vigentes mes anterior',
      color: COLOR_TIPO_B,
      trend,
      trendColor,
      status,
      value,
      delta,
      secondaryText: `6d: ${plan6d} · 3d: ${plan3d}`,
      sparkline: this.buildTrendSparkline(value, delta),
      gradId: 'cv2-spark-tipo-b'
    };
  }

  private makeNuevosCard(ds: DetalleState | null): CardVM {
    const status = this.deriveDetalleStatus(ds);
    const data   = ds?.status === 'loaded' ? ds.data : null;
    const value  = data?.nuevos.total ?? 0;
    const delta  = data?.nuevos.delta ?? null;
    const plan6d = data?.nuevos.plan_6d ?? 0;
    const plan3d = data?.nuevos.plan_3d ?? 0;

    const trend  = this.deriveTrend(data ? value : null, delta);
    const trendColor = TREND_COLORS[trend];

    return {
      key: 'nuevos',
      label: 'Nuevos',
      color: COLOR_NUEVOS,
      trend,
      trendColor,
      status,
      value,
      // El template suprime el chip de delta para nuevos/recuperados;
      // mantenemos el valor en el VM para que la sparkline lo use.
      delta,
      secondaryText: `6d: ${plan6d} · 3d: ${plan3d}`,
      sparkline: this.buildTrendSparkline(value, delta),
      gradId: 'cv2-spark-nuevos'
    };
  }

  private makeRecuperadosCard(ds: DetalleState | null): CardVM {
    const status = this.deriveDetalleStatus(ds);
    const data   = ds?.status === 'loaded' ? ds.data : null;
    const value  = data?.recuperados.total ?? 0;
    const delta  = data?.recuperados.delta ?? null;
    const plan6d = data?.recuperados.plan_6d ?? 0;
    const plan3d = data?.recuperados.plan_3d ?? 0;

    const trend  = this.deriveTrend(data ? value : null, delta);
    const trendColor = TREND_COLORS[trend];

    return {
      key: 'recuperados',
      label: 'Recuperados',
      color: COLOR_RECUPERADOS,
      trend,
      trendColor,
      status,
      value,
      delta,
      secondaryText: `6d: ${plan6d} · 3d: ${plan3d}`,
      sparkline: this.buildTrendSparkline(value, delta),
      gradId: 'cv2-spark-recuperados'
    };
  }

  /**
   * Tendencia de la card según el delta vs el periodo de comparación.
   * Cuando aún no hay datos (delta=null), por defecto plana.
   */
  private deriveTrend(current: number | null, delta: number | null): CardTrend {
    if (current === null || delta === null) return 'flat';
    if (delta > 0) return 'up';
    if (delta < 0) return 'down';
    return 'flat';
  }

  /**
   * Construye una sparkline de exactamente 2 puntos: [prev, current].
   * El layout dibuja el primer punto a la izquierda y el segundo a la derecha
   * (`buildSparkline` ya escala los valores entre min y max), por lo que la
   * pendiente refleja directamente la dirección de la tendencia.
   *
   * Caso especial: si current === prev (delta=0) ambos puntos quedarían en el
   * mismo nivel — `buildSparkline` produciría una línea recta a la mitad del
   * viewBox, justo lo que queremos para la "línea gris" de "sin cambio".
   */
  private buildTrendSparkline(
    current: number | null,
    delta: number | null
  ): SparklineGeometry | null {
    if (current === null || delta === null) return null;
    const prev = current - delta;
    return this.buildSparkline([prev, current], 80, 40);
  }

  private deriveCardsStatus(cs: CardsState | null): CardStatus {
    if (!cs || cs.status === 'loading') return 'loading';
    if (cs.status === 'error') return 'error';
    return 'loaded';
  }

  private deriveDetalleStatus(ds: DetalleState | null): CardStatus {
    if (!ds || ds.status === 'loading') return 'loading';
    if (ds.status === 'error') return 'error';
    return 'loaded';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 02 — Quincenas en curso
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Construye los VMs de las dos cards Q1 y Q2 a partir del response de la EF
   * `stats-clients-quincenal`. La EF garantiza que cuando Q2 aún no inició
   * devuelve total=0, delta=null y comparativa='parcial' — convertimos eso a
   * 'no_iniciada' acá para que el template tenga un único discriminante.
   */
  buildQuincenaCards(data: ClientesQuincenalCards): QuincenaCardVM[] {
    const today = new Date();
    return [
      this.makeQuincenaCard('q1', data.q1, today),
      this.makeQuincenaCard('q2', data.q2, today)
    ];
  }

  private makeQuincenaCard(
    key: QuincenaKey,
    q: QuincenaBreakdown,
    today: Date
  ): QuincenaCardVM {
    const estado = this.deriveQuincenaEstado(key, q, today);
    const rangeBadge = this.buildQuincenaRange(key, today);

    const total = estado === 'no_iniciada' ? 0 : q.total;
    const plan6dValue = estado === 'no_iniciada' ? 0 : q.plan_6d;
    const plan3dValue = estado === 'no_iniciada' ? 0 : q.plan_3d;

    const pct6d = total > 0 ? Math.round((plan6dValue / total) * 100) : 0;
    const pct3d = total > 0 ? Math.round((plan3dValue / total) * 100) : 0;

    return {
      key,
      label: key === 'q1' ? 'Pagaron Q1' : 'Pagaron Q2',
      rangeBadge,
      estado,
      total,
      delta: estado === 'no_iniciada' ? null : q.delta,
      plan6d: {
        label: 'Plan 6 días',
        color: COLOR_PLAN_6D,
        value: plan6dValue,
        pct: pct6d,
        widthPct: pct6d
      },
      plan3d: {
        label: 'Plan 3 días',
        color: COLOR_PLAN_3D,
        value: plan3dValue,
        pct: pct3d,
        widthPct: pct3d
      },
      isParcial: estado === 'parcial',
      inicio: estado === 'no_iniciada' ? this.buildQuincenaInicio(today) : null
    };
  }

  /**
   * Estado derivado:
   *  - Q1 siempre tiene datos (1-15 ya transcurridos al menos un día).
   *    Si hoy ≤ 15 → parcial; si hoy ≥ 16 → completa.
   *  - Q2 'no_iniciada' cuando hoy ≤ 15 (la EF devuelve delta=null).
   *    Si hoy ≥ 16 → parcial.
   */
  private deriveQuincenaEstado(
    key: QuincenaKey,
    q: QuincenaBreakdown,
    today: Date
  ): QuincenaEstado {
    const day = today.getDate();
    if (key === 'q1') {
      return day >= 16 ? 'completa' : 'parcial';
    }
    // q2
    if (day <= 15 || q.delta === null) return 'no_iniciada';
    return 'parcial';
  }

  /** Devuelve "1 — 15 may" o "16 — 31 may" según la quincena y mes actual. */
  private buildQuincenaRange(key: QuincenaKey, today: Date): string {
    const mes = MESES_CORTOS[today.getMonth()];
    if (key === 'q1') {
      return `1 — 15 ${mes}`;
    }
    const ultimoDia = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0
    ).getDate();
    return `16 — ${ultimoDia} ${mes}`;
  }

  /**
   * Calcula el countdown hasta el día 16 del mes actual.
   * Si hoy es ≥ 16, devuelve un "hoy" defensivo (nunca debería renderizarse
   * en ese caso porque la card pasa a 'parcial').
   */
  private buildQuincenaInicio(today: Date): QuincenaInicioInfo {
    const dia16 = new Date(today.getFullYear(), today.getMonth(), 16);
    const todayMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const diffMs = dia16.getTime() - todayMidnight.getTime();
    const dias = Math.max(0, Math.round(diffMs / 86_400_000));

    let countdownLabel: string;
    if (dias === 0) countdownLabel = 'hoy';
    else if (dias === 1) countdownLabel = 'en 1 día';
    else countdownLabel = `en ${dias} días`;

    const variant: 'default' | 'warn' = dias <= 3 ? 'warn' : 'default';

    return {
      fechaLabel: `16 de ${MESES_COMPLETOS[today.getMonth()]}`,
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

  /**
   * Construye el VM de "Perdidos este mes" con la lógica de delta INVERTIDA:
   * más perdidos respecto al período anterior es peor (rojo).
   */
  buildPerdidosVM(data: ClientesQuincenalCards): PerdidosVM {
    const p = data.perdidos;
    const delta = p.delta;

    // Inversión semántica: positivo = down (rojo), negativo = up (verde).
    let pillClass: string;
    let pillArrow: string;
    if (delta > 0) {
      pillClass = 'cv2-pill cv2-pill--down';
      pillArrow = '↑';
    } else if (delta < 0) {
      pillClass = 'cv2-pill cv2-pill--up';
      pillArrow = '↓';
    } else {
      pillClass = 'cv2-pill cv2-pill--flat';
      pillArrow = '→';
    }

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
   * tasa null → estado vacío con leyenda "Sin datos del mes anterior".
   */
  buildRetencionVM(data: DetalleResponse, today: Date): RetencionVM {
    const ret = data.retencion;
    const recuperadosTotal = data.recuperados.total;

    if (ret.tasa === null) {
      return {
        tasaLabel: '—',
        tasaColorClass: 'cv2-retencion__value--null',
        ratioBadge: `${ret.repitieron_este_mes} de ${ret.activos_mes_anterior}`,
        primaryLine: 'Sin datos del mes anterior',
        contextLine: 'No había clientes activos para comparar.',
        isNull: true,
        recuperadosTotal
      };
    }

    // tasa viene en 0–100; formateamos con un decimal.
    const tasaPct = ret.tasa;
    const tasaLabel = `${tasaPct.toFixed(1)}%`;

    let tasaColorClass: RetencionVM['tasaColorClass'];
    if (tasaPct >= 80)      tasaColorClass = 'cv2-retencion__value--good';
    else if (tasaPct >= 60) tasaColorClass = 'cv2-retencion__value--ok';
    else if (tasaPct >= 40) tasaColorClass = 'cv2-retencion__value--mid';
    else                    tasaColorClass = 'cv2-retencion__value--bad';

    const primaryLine =
      `${ret.repitieron_este_mes} de ${ret.activos_mes_anterior} clientes repitieron`;

    let contextLine: string;
    if (ret.activos_mes_anterior === 1) {
      contextLine = 'Solo había 1 cliente vigente en ' + this.prevMonthName(today);
    } else if (ret.activos_mes_anterior === 0) {
      contextLine = 'Sin referencia del mes anterior';
    } else {
      contextLine = `De los ${ret.activos_mes_anterior} activos en ${this.prevMonthName(today)}`;
    }

    return {
      tasaLabel,
      tasaColorClass,
      ratioBadge: `${ret.repitieron_este_mes} de ${ret.activos_mes_anterior}`,
      primaryLine,
      contextLine,
      isNull: false,
      recuperadosTotal
    };
  }

  /** Nombre completo del mes anterior al `today` recibido. */
  private prevMonthName(today: Date): string {
    const idx = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
    return MESES_COMPLETOS[idx];
  }

  /** Wrapper para que el template pueda llamar buildRetencionVM con `today`. */
  buildRetencionFromData(data: DetalleResponse): RetencionVM {
    return this.buildRetencionVM(data, new Date());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 04 — Tendencia
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calcula la variación entre el primer y último punto de la serie de Total.
   * - Si solo hay 1 punto o el primer total es 0: N/A.
   * - El % se redondea a entero si no tiene parte decimal significativa.
   */
  buildVariacion(puntos: TendenciaResponse): VariacionVM {
    if (!puntos || puntos.length < 2) {
      return {
        display: 'N/A',
        cssClass: 'cv2-var--null',
        mesInicialLabel: ''
      };
    }
    const prev = puntos[0].total;
    const curr = puntos[puntos.length - 1].total;
    const mesInicialLabel = puntos[0].label;

    if (prev === 0) {
      return { display: 'N/A', cssClass: 'cv2-var--null', mesInicialLabel };
    }

    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
    const cssClass: VariacionVM['cssClass'] =
      pct > 0 ? 'cv2-var--up'
      : pct < 0 ? 'cv2-var--down'
      : 'cv2-var--flat';

    const abs = Math.abs(pct);
    const formatted = Number.isInteger(abs)
      ? abs.toLocaleString('es-CO', { maximumFractionDigits: 0 })
      : abs.toLocaleString('es-CO', { maximumFractionDigits: 1 });

    return {
      display: `${arrow} ${formatted}%`,
      cssClass,
      mesInicialLabel
    };
  }

  /**
   * Mini leyenda con barras min→max relativas al máximo global de las 3 series.
   * Las barras visualizan el techo de cada serie en la ventana.
   */
  buildSeriesLegend(puntos: TendenciaResponse): SeriesLegendRow[] {
    if (!puntos || puntos.length === 0) return [];

    const totalVals = puntos.map((p) => p.total);
    const sixVals   = puntos.map((p) => p.plan_6d);
    const threeVals = puntos.map((p) => p.plan_3d);

    const tMin = Math.min(...totalVals);
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
        minLabel: tMin.toString(),
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

  /** True si el último punto está marcado como mes en curso. */
  ultimoEsMesActual(puntos: TendenciaResponse): boolean {
    if (!puntos || puntos.length === 0) return false;
    return puntos[puntos.length - 1].es_mes_actual === true;
  }

  /**
   * Construye el ChartData para la gráfica de barras agrupadas (Total / 6d / 3d).
   * Mes actual: opacidad 0.65 + asterisco en label.
   */
  buildTendenciaChartData(puntos: TendenciaResponse): ChartData<'bar'> {
    const labels = puntos.map((p) =>
      p.es_mes_actual ? `${p.label} *` : p.label
    );

    const bgFor = (color: string, esActual: boolean): string =>
      esActual ? this.withAlpha(color, 0.65) : color;

    return {
      labels,
      datasets: [
        {
          label: 'Total',
          data: puntos.map((p) => p.total),
          backgroundColor: puntos.map((p) =>
            bgFor(COLOR_SERIE_TOTAL, p.es_mes_actual)
          ),
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.85,
          categoryPercentage: 0.7
        },
        {
          label: 'Plan 6d',
          data: puntos.map((p) => p.plan_6d),
          backgroundColor: puntos.map((p) =>
            bgFor(COLOR_SERIE_6D, p.es_mes_actual)
          ),
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.85,
          categoryPercentage: 0.7
        },
        {
          label: 'Plan 3d',
          data: puntos.map((p) => p.plan_3d),
          backgroundColor: puntos.map((p) =>
            bgFor(COLOR_SERIE_3D, p.es_mes_actual)
          ),
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.85,
          categoryPercentage: 0.7
        }
      ]
    };
  }

  /**
   * Plugin Chart.js que dibuja el valor encima de cada barra del último mes.
   * Solo afecta al index = labels.length - 1 (el más reciente).
   */
  private readonly lastMonthValuePlugin: Plugin<'bar'> = {
    id: 'cv2-last-month-values',
    afterDatasetsDraw: (chart: ChartJS<'bar'>) => {
      const { ctx, data } = chart;
      const labels = (data.labels ?? []) as string[];
      if (labels.length === 0) return;
      const lastIdx = labels.length - 1;

      ctx.save();
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#6b7280';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      data.datasets.forEach((ds, dsIdx) => {
        const meta = chart.getDatasetMeta(dsIdx);
        const bar = meta.data[lastIdx] as
          | { x: number; y: number; tooltipPosition?: (useFinalPosition: boolean) => { x: number; y: number } }
          | undefined;
        if (!bar) return;
        const value = ds.data[lastIdx] as number | undefined;
        if (value === undefined || value === null) return;

        const tip = bar.tooltipPosition
          ? bar.tooltipPosition(false)
          : { x: bar.x, y: bar.y };
        ctx.fillText(`${value}`, tip.x, tip.y - 4);
      });

      ctx.restore();
    }
  };

  /** Plugins inyectados al canvas vía baseChart. */
  readonly tendenciaPlugins: Plugin<'bar'>[] = [this.lastMonthValuePlugin];

  /** Opciones Chart.js — minimalistas, mismo estilo finanzas-v2. */
  readonly tendenciaChartOptions: ChartConfiguration<'bar'>['options'] = {
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
            return `${ctx.dataset.label}: ${v} cliente${v === 1 ? '' : 's'}`;
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
        grid: { color: 'rgba(0, 0, 0, 0.06)' },
        border: { display: false },
        ticks: {
          color: '#6b7280',
          font: { size: 11 },
          precision: 0,
          stepSize: 1,
          callback: (value) =>
            typeof value === 'number' && Number.isInteger(value) ? `${value}` : ''
        }
      }
    },
    layout: {
      padding: { top: 18 } // espacio para los labels de valor del último mes
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

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 05 — Distribución por quincena
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Construye el ChartData para la gráfica de distribución quincenal.
   * Cada punto produce dos barras (Q1 y Q2). Una sola serie cuyo valor
   * depende del filtro de plan local. Q2 'no_iniciada' → null (espacio vacío).
   */
  buildDistribucionChartData(
    puntos: QuincenalTendenciaResponse,
    plan: PlanFilter
  ): ChartData<'bar'> {
    const labels: string[] = [];
    const values: (number | null)[] = [];
    const bgColors: string[] = [];

    const pickValue = (
      total: number,
      p6d: number,
      p3d: number
    ): number => (plan === '6d' ? p6d : plan === '3d' ? p3d : total);

    for (const p of puntos) {
      // Q1
      const q1Label = p.q1_estado === 'parcial' ? `${p.label} Q1 *` : `${p.label} Q1`;
      labels.push(q1Label);
      values.push(pickValue(p.q1_total, p.q1_plan_6d, p.q1_plan_3d));
      bgColors.push(
        p.q1_estado === 'parcial'
          ? this.withAlpha(COLOR_DIST_Q1, 0.65)
          : COLOR_DIST_Q1
      );

      // Q2
      const q2Label = p.q2_estado === 'parcial' ? `${p.label} Q2 *` : `${p.label} Q2`;
      labels.push(q2Label);
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

  /** Devuelve true si algún punto tiene Q1 o Q2 en estado parcial. */
  distribucionTieneEnCurso(puntos: QuincenalTendenciaResponse): boolean {
    return puntos.some(
      (p) => p.q1_estado === 'parcial' || p.q2_estado === 'parcial'
    );
  }

  /** Opciones Chart.js para la distribución quincenal. */
  readonly distribucionChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const v = (ctx.parsed.y ?? 0) as number;
            return `${v} cliente${v === 1 ? '' : 's'}`;
          },
          afterLabel: (ctx) => {
            const lbl = (ctx.label ?? '') as string;
            const isParcial = lbl.endsWith(' *');
            return isParcial ? 'En curso · corte parcial' : '';
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
          font: { size: 10 },
          maxRotation: 0,
          autoSkip: false
        }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0, 0, 0, 0.06)' },
        border: { display: false },
        ticks: {
          color: '#6b7280',
          font: { size: 11 },
          precision: 0,
          stepSize: 1,
          callback: (value) =>
            typeof value === 'number' && Number.isInteger(value) ? `${value}` : ''
        }
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 06 — Clientes en riesgo
  // ═══════════════════════════════════════════════════════════════════════════

  /** Construye los VMs de la tabla de clientes en riesgo. */
  buildRiesgoVMs(entries: EnRiesgoEntry[]): RiesgoVM[] {
    const today = new Date();
    return entries.map((e) => this.buildRiesgoVM(e, today));
  }

  private buildRiesgoVM(e: EnRiesgoEntry, today: Date): RiesgoVM {
    const iniciales = this.extractInitials(e.nombre);
    const [bg, fg] = this.pickAvatarColor(e.nombre);

    const planLabel = e.plan === '6d' ? '6 días' : '3 días';
    const planClass: RiesgoVM['planClass'] =
      e.plan === '6d' ? 'cv2-plan-badge--6d' : 'cv2-plan-badge--3d';

    const venceColorClass = this.deriveVenceColor(e.vence_el, today);

    const estadoLabel = e.estado === 'pendiente' ? 'Pendiente' : 'Por vencer';
    const estadoClass: RiesgoVM['estadoClass'] =
      e.estado === 'pendiente'
        ? 'cv2-estado-badge--pendiente'
        : 'cv2-estado-badge--por-vencer';

    return {
      cliente_id: e.cliente_id,
      nombre: e.nombre,
      iniciales,
      avatarBg: bg,
      avatarFg: fg,
      entrenador: e.entrenador || '—',
      plan: e.plan,
      planLabel,
      planClass,
      ultimoPagoFmt: this.formatIsoDmy(e.ultimo_pago),
      venceElFmt: this.formatIsoDmy(e.vence_el),
      venceColorClass,
      estadoLabel,
      estadoClass
    };
  }

  /**
   * Extrae iniciales del nombre. "Jefry Salgado" → "JS",
   * "Maria del Carmen Lopez" → "ML", "Juan" → "J".
   */
  private extractInitials(nombre: string): string {
    const parts = nombre.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    const first = parts[0].charAt(0);
    const last = parts[parts.length - 1].charAt(0);
    return `${first}${last}`.toUpperCase();
  }

  /** Color determinista basado en el primer charCode del nombre. */
  private pickAvatarColor(nombre: string): readonly [string, string] {
    const code = nombre.length > 0 ? nombre.charCodeAt(0) : 0;
    const idx = code % AVATAR_PALETTE.length;
    return AVATAR_PALETTE[idx];
  }

  /**
   * Color de la fecha "vence_el":
   *  - Vencido (< hoy)              → cv2-vence--vencido (rojo bold)
   *  - ≤ 7 días desde hoy            → cv2-vence--proximo (amber)
   *  - > 7 días desde hoy            → cv2-vence--ok (gris)
   */
  private deriveVenceColor(
    venceIso: string,
    today: Date
  ): RiesgoVM['venceColorClass'] {
    const parts = venceIso.split('-');
    if (parts.length !== 3) return 'cv2-vence--ok';
    const [y, m, d] = parts.map(Number);
    if (!y || !m || !d) return 'cv2-vence--ok';

    const vence = new Date(y, m - 1, d);
    const hoyMid = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const diffDays = Math.round(
      (vence.getTime() - hoyMid.getTime()) / 86_400_000
    );

    if (diffDays < 0) return 'cv2-vence--vencido';
    if (diffDays <= 7) return 'cv2-vence--proximo';
    return 'cv2-vence--ok';
  }

  /** Convierte ISO YYYY-MM-DD → DD/MM/YYYY. */
  formatIsoDmy(iso: string): string {
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [yyyy, mm, dd] = parts;
    return `${dd}/${mm}/${yyyy}`;
  }

  trackByRiesgo(_i: number, r: RiesgoVM): string {
    return r.cliente_id;
  }

  // ─── trackBy ────────────────────────────────────────────────────────────────

  trackById(_i: number, t: EntrenadorOption): string {
    return t.id;
  }

  trackByCardKey(_i: number, c: CardVM): CardKey {
    return c.key;
  }

  trackByQuincenaKey(_i: number, q: QuincenaCardVM): QuincenaKey {
    return q.key;
  }

  trackByIndex(i: number): number {
    return i;
  }
}
