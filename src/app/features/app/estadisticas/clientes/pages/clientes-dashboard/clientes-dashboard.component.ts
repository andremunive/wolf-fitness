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

import { EstadisticasService, MesPeriodo } from '../../../services/estadisticas.service';
import {
  ClientesActivosCards,
  ClientesQuincenalCards,
  DetalleResponse,
  EntrenadorFilter,
  EntrenadorOption,
  OrigenDbKey,
  PlanFilter,
  QuincenaBreakdown,
  QuincenalTendenciaResponse,
  TendenciaResponse,
  VentanaQuincenal,
  VentanaTendencia
} from '../../../models/estadisticas.model';

import { EstadisticasClientesVmService } from '../../../services/estadisticas-clientes-vm.service';
import { SparklineGeometryService, SparklineGeometry } from '../../../services/sparkline-geometry.service';
import { GaugeGeometryService, GaugeGeometry } from '../../../services/gauge-geometry.service';

import { MESES_CORTOS } from '../../../models/estadisticas-constants';

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

/** Estado de carga de una card individual (loading / loaded / error). */
export type CardStatus = 'loading' | 'loaded' | 'error';

// ─── Constantes ───────────────────────────────────────────────────────────────

const SPARKLINE_VB_WIDTH  = 320;
const SPARKLINE_VB_HEIGHT = 60;

/** Límite inferior del navegador de meses (fecha en que arrancó la app). */
const APP_START_YEAR  = 2026;
const APP_START_MONTH = 4;

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

// ─── Sección 01 — Usuarios nuevos (origen) ────────────────────────────────────

export type OrigenKey = 'publicidad' | 'directos' | 'recomendacion';

/**
 * VM de una card de la fila "Usuarios nuevos" (sección 01).
 * Réplica visual de `CardVM` pero limitada a los datos que sí aplican al
 * origen: total, delta y desglose por plan. `status` permite render por card
 * (skeleton / error / loaded) cuando la data proviene de una EF.
 */
export interface OrigenCardVM {
  key: OrigenKey;
  label: string;
  color: string;
  status: CardStatus;
  value: number;
  delta: number | null;
  plan6d: number;
  plan3d: number;
}

// ─── Sección 07 — Clientes en riesgo ──────────────────────────────────────────

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

  /** BehaviorSubject del filtro de plan local — necesario para derivar distribucionChartData$. */
  readonly planFilter$ = new BehaviorSubject<PlanFilter>('todos');

  // ─── Estado de cards (cards EF) ─────────────────────────────────────────────

  private readonly retryCards$ = new BehaviorSubject<void>(undefined);

  readonly cardsState$: Observable<CardsState> = combineLatest([
    this.svc.selectedEntrenador$,
    this.svc.mesPeriodo$,
    this.retryCards$
  ]).pipe(
    switchMap(([selected, periodo]) => {
      const entrenadorId = selected === 'todos' ? null : selected;
      const fechaRef = this.svc.buildFechaReferencia(periodo);
      return this.svc.getClientesActivosCards(entrenadorId, fechaRef).pipe(
        map((data): CardsState => ({ status: 'loaded', data })),
        catchError((): Observable<CardsState> => of({ status: 'error', data: null })),
        startWith<CardsState>({ status: 'loading', data: null })
      );
    }),
    shareReplay(1)
  );

  // ─── Estado del sparkline (tendencia EF — sección 04) ──────────────────────

  private readonly retryTendencia$ = new BehaviorSubject<void>(undefined);

  readonly sparklineState$: Observable<SparklineState> = combineLatest([
    this.svc.selectedEntrenador$,
    this.svc.mesPeriodo$,
    this.svc.ventanaTendencia$,
    this.retryTendencia$
  ]).pipe(
    switchMap(([selected, periodo, ventana]) => {
      const entrenadorId = selected === 'todos' ? null : selected;
      const fechaRef = this.svc.buildFechaReferencia(periodo);
      return this.svc.getTendencia(entrenadorId, fechaRef, ventana).pipe(
        map((data): SparklineState => ({ status: 'loaded', data })),
        catchError((): Observable<SparklineState> => of({ status: 'error', data: null })),
        startWith<SparklineState>({ status: 'loading', data: null })
      );
    }),
    shareReplay(1)
  );

  // ─── Estado del detalle (nuevos / recuperados — sección 01) ─────────────────

  private readonly retryDetalle$ = new BehaviorSubject<void>(undefined);

  readonly detalleState$: Observable<DetalleState> = combineLatest([
    this.svc.selectedEntrenador$,
    this.svc.mesPeriodo$,
    this.retryDetalle$
  ]).pipe(
    switchMap(([selected, periodo]) => {
      const entrenadorId = selected === 'todos' ? null : selected;
      const fechaRef = this.svc.buildFechaReferencia(periodo);
      return this.svc.getDetalle(entrenadorId, fechaRef).pipe(
        map((data): DetalleState => ({ status: 'loaded', data })),
        catchError((): Observable<DetalleState> => of({ status: 'error', data: null })),
        startWith<DetalleState>({ status: 'loading', data: null })
      );
    }),
    shareReplay(1)
  );

  // ─── Estado de quincenas (sección 02) ──────────────────────────────────────

  private readonly retryQuincenal$ = new BehaviorSubject<void>(undefined);

  readonly quincenalState$: Observable<QuincenalState> = combineLatest([
    this.svc.selectedEntrenador$,
    this.svc.mesPeriodo$,
    this.retryQuincenal$
  ]).pipe(
    switchMap(([selected, periodo]) => {
      const entrenadorId = selected === 'todos' ? null : selected;
      const fechaRef = this.svc.buildFechaReferencia(periodo);
      return this.svc.getQuincenalCards(entrenadorId, fechaRef).pipe(
        map((data): QuincenalState => ({ status: 'loaded', data })),
        catchError((): Observable<QuincenalState> => of({ status: 'error', data: null })),
        startWith<QuincenalState>({ status: 'loading', data: null })
      );
    }),
    shareReplay(1)
  );

  // ─── Estado de la distribución quincenal (sección 05) ──────────────────────

  private readonly retryQuincenalTend$ = new BehaviorSubject<void>(undefined);

  readonly quincenalTendenciaState$: Observable<QuincenalTendState> = combineLatest([
    this.svc.selectedEntrenador$,
    this.svc.mesPeriodo$,
    this.svc.ventanaQuincenal$,
    this.retryQuincenalTend$
  ]).pipe(
    switchMap(([selected, periodo, ventana]) => {
      const entrenadorId = selected === 'todos' ? null : selected;
      const fechaRef = this.svc.buildFechaReferencia(periodo);
      return this.svc.getQuincenalTendencia(entrenadorId, fechaRef, ventana).pipe(
        map((data): QuincenalTendState => ({ status: 'loaded', data })),
        catchError((): Observable<QuincenalTendState> => of({ status: 'error', data: null })),
        startWith<QuincenalTendState>({ status: 'loading', data: null })
      );
    }),
      shareReplay(1)
    );

  // ─── Stream combinado para la card derecha (gauge depende de cards) ─────────

  readonly heroState$: Observable<{
    cards: CardsState;
    spark: SparklineState;
  }> = combineLatest([this.cardsState$, this.sparklineState$]).pipe(
    map(([cards, spark]) => ({ cards, spark }))
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Observables derivados — declarados antes de ngOnInit para ser declarativos
  // ═══════════════════════════════════════════════════════════════════════════

  /** Geometría SVG del hero sparkline (null cuando no hay datos suficientes). */
  readonly heroSparkline$: Observable<SparklineGeometry | null> =
    this.sparklineState$.pipe(
      map((ss) =>
        ss.status === 'loaded'
          ? this.sparklineSvc.build(
              ss.data.map((p) => p.total),
              SPARKLINE_VB_WIDTH,
              SPARKLINE_VB_HEIGHT
            )
          : null
      )
    );

  /** Geometría del gauge de salud de cartera (null cuando no hay datos). */
  readonly gaugeVM$: Observable<GaugeGeometry | null> =
    this.cardsState$.pipe(
      map((cs) =>
        cs.status === 'loaded'
          ? this.vmSvc.buildGauge(cs.data)
          : null
      )
    );

  /** VMs de las dos cards de quincena (Q1 + Q2). */
  readonly quincenaCardsVM$: Observable<QuincenaCardVM[] | null> = combineLatest([
    this.quincenalState$,
    this.svc.mesPeriodo$
  ]).pipe(
    map(([qs, p]) =>
      qs.status === 'loaded'
        ? this.vmSvc.buildQuincenaCards(qs.data, this.buildRefDate(p), this.isCurrentPeriod(p))
        : null
    )
  );

  /** VM de "Pendientes de pago" (sección 03). */
  readonly pendientesVM$: Observable<PendientesVM | null> =
    this.quincenalState$.pipe(
      map((qs) =>
        qs.status === 'loaded'
          ? this.vmSvc.buildPendientesVM(qs.data)
          : null
      )
    );

  /** VM de "Perdidos este mes" con delta invertido (sección 03). */
  readonly perdidosVM$: Observable<PerdidosVM | null> =
    this.quincenalState$.pipe(
      map((qs) =>
        qs.status === 'loaded'
          ? this.vmSvc.buildPerdidosVM(qs.data)
          : null
      )
    );

  /** VM de la card oscura de retención (sección 03). */
  readonly retencionVM$: Observable<RetencionVM | null> = combineLatest([
    this.detalleState$,
    this.svc.mesPeriodo$
  ]).pipe(
    map(([ds, p]) =>
      ds.status === 'loaded'
        ? this.vmSvc.buildRetencionVM(ds.data, this.buildRefDate(p))
        : null
    )
  );

  /** VMs de la tabla de clientes en riesgo (sección 06). */
  readonly riesgoVMs$: Observable<RiesgoVM[]> = combineLatest([
    this.detalleState$,
    this.svc.mesPeriodo$
  ]).pipe(
    map(([ds, p]) =>
      ds.status === 'loaded'
        ? this.vmSvc.buildRiesgoVMs(ds.data.en_riesgo, this.buildRefDate(p))
        : []
    )
  );

  /**
   * VM de variación entre el primer y último punto de la serie Total.
   * La sección 04 usa sparklineState$ directamente (ya viene filtrado por ventana
   * desde EstadisticasService.getTendencia que observa ventanaTendencia$).
   */
  readonly variacion$: Observable<VariacionVM | null> =
    this.sparklineState$.pipe(
      map((ss) =>
        ss.status === 'loaded'
          ? this.vmSvc.buildVariacion(ss.data)
          : null
      )
    );

  /** Filas de la mini leyenda con rangos por serie (sección 04). */
  readonly seriesLegend$: Observable<SeriesLegendRow[]> =
    this.sparklineState$.pipe(
      map((ss) =>
        ss.status === 'loaded'
          ? this.vmSvc.buildSeriesLegend(ss.data)
          : []
      )
    );

  /** ChartData para la gráfica de barras agrupadas de tendencia (sección 04). */
  readonly tendenciaChartData$: Observable<ChartData<'bar'> | null> =
    this.sparklineState$.pipe(
      map((ss) =>
        ss.status === 'loaded'
          ? this.vmSvc.buildTendenciaChartData(ss.data)
          : null
      )
    );

  /** True si el último punto está marcado como mes en curso (footnote). */
  readonly ultimoEsMesActual$: Observable<boolean> =
    this.sparklineState$.pipe(
      map((ss) => {
        if (ss.status !== 'loaded' || ss.data.length === 0) return false;
        return ss.data[ss.data.length - 1].es_mes_actual === true;
      })
    );

  /** ChartData para la gráfica de distribución quincenal (sección 05). */
  readonly distribucionChartData$: Observable<ChartData<'bar'> | null> =
    combineLatest([this.quincenalTendenciaState$, this.planFilter$]).pipe(
      map(([qts, planFilter]) =>
        qts.status === 'loaded'
          ? this.vmSvc.buildDistribucionChartData(qts.data, planFilter)
          : null
      )
    );

  /** True si alguna quincena está en estado parcial — footnote de sección 05. */
  readonly distribucionTieneEnCurso$: Observable<boolean> =
    this.quincenalTendenciaState$.pipe(
      map((qts) => {
        if (qts.status !== 'loaded') return false;
        return qts.data.some(
          (p) => p.q1_estado === 'parcial' || p.q2_estado === 'parcial'
        );
      })
    );

  // ─── Período mes/año ────────────────────────────────────────────────────────

  private readonly currentYear  = new Date().getFullYear();
  private readonly currentMonth = new Date().getMonth() + 1;

  readonly periodo$: Observable<MesPeriodo> = this.svc.mesPeriodo$;

  readonly periodoLabel$: Observable<string> = this.svc.mesPeriodo$.pipe(
    map((p) => this.svc.getPeriodoLabel(p.year, p.month))
  );

  readonly isAtCurrentMonth$: Observable<boolean> = this.svc.mesPeriodo$.pipe(
    map((p) => p.year === this.currentYear && p.month === this.currentMonth)
  );

  readonly isAtAppStartMonth$: Observable<boolean> = this.svc.mesPeriodo$.pipe(
    map((p) => p.year === APP_START_YEAR && p.month === APP_START_MONTH)
  );

  // ─── Labels reactivos derivados del período ────────────────────────────────

  /** "vs 1-X mmm" para el delta pill del hero (según refDate del período). */
  readonly deltaLabelMonth$: Observable<string> = this.svc.mesPeriodo$.pipe(
    map((p) => this.buildDeltaLabelMonth(this.buildRefDate(p)))
  );

  /** "DD/MM/YYYY" — fecha del corte del período visualizado. */
  readonly cortePeriodLabel$: Observable<string> = this.svc.mesPeriodo$.pipe(
    map((p) => this.buildCortePeriodLabel(this.buildRefDate(p)))
  );

  /** "ESTADÍSTICAS — CLIENTES — MAYO 2026" */
  readonly breadcrumbCurrent$: Observable<string> = this.periodoLabel$.pipe(
    map((s) => s.toUpperCase())
  );

  /** True si el modal de detalle por origen está visible. */
  origenModalOpen = false;

  /**
   * Snapshot de los parámetros de la EF en el momento de abrir el modal.
   * Congelamos `fecha_referencia`, `entrenador_id` y `origen` para que el
   * contenido del modal no cambie si el usuario navega meses después.
   */
  origenModalFecha = '';
  origenModalEntrenadorId: string | null = null;
  origenModalOrigen: OrigenDbKey = 'publicidad';

  // ─── Sección 01 — Usuarios nuevos ─────────────────────────────────────────
  //
  // Publicidad → datos reales de detalleState$ (delta vs mes anterior COMPLETO).
  // Directos / Recomendación → dummy pendiente de spec.
  readonly origenCardsVM$: Observable<OrigenCardVM[]> = this.detalleState$.pipe(
    map((ds) => this.buildOrigenCards(ds))
  );

  /** "vs jun" — label del delta para las cards de origen (mes anterior completo). */
  readonly deltaLabelFullPrevMonth$: Observable<string> = this.svc.mesPeriodo$.pipe(
    map((p) => {
      const refDate = this.buildRefDate(p);
      const prevMonthIndex = refDate.getMonth() === 0 ? 11 : refDate.getMonth() - 1;
      return `vs ${MESES_CORTOS[prevMonthIndex]}`;
    })
  );

  constructor(
    private readonly svc: EstadisticasService,
    private readonly vmSvc: EstadisticasClientesVmService,
    private readonly sparklineSvc: SparklineGeometryService,
    private readonly gaugeSvc: GaugeGeometryService,
    private readonly cdr: ChangeDetectorRef
  ) {}

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

  // ─── Navegación de período ─────────────────────────────────────────────────

  onPrevMonth(periodo: MesPeriodo, isAtAppStartMonth: boolean): void {
    if (isAtAppStartMonth) return;
    const { year, month } = periodo;
    this.svc.setPeriodo(
      month === 1 ? year - 1 : year,
      month === 1 ? 12 : month - 1
    );
  }

  onNextMonth(periodo: MesPeriodo, isAtCurrentMonth: boolean): void {
    if (isAtCurrentMonth) return;
    const { year, month } = periodo;
    this.svc.setPeriodo(
      month === 12 ? year + 1 : year,
      month === 12 ? 1 : month + 1
    );
  }

  /** True si el período seleccionado es el mes en curso local. */
  isCurrentPeriod(p: MesPeriodo): boolean {
    return p.year === this.currentYear && p.month === this.currentMonth;
  }

  /**
   * Fecha de referencia como `Date` para labels/VMs:
   * - Mes en curso → hoy.
   * - Mes pasado   → último día de ese mes.
   * - Mes futuro   → primer día (no debería ocurrir; UI lo bloquea).
   */
  buildRefDate(p: MesPeriodo): Date {
    if (this.isCurrentPeriod(p)) return new Date();
    const isPast =
      p.year < this.currentYear ||
      (p.year === this.currentYear && p.month < this.currentMonth);
    const day = isPast ? new Date(p.year, p.month, 0).getDate() : 1;
    return new Date(p.year, p.month - 1, day);
  }

  // ─── Retry ──────────────────────────────────────────────────────────────────

  retryCards(): void       { this.retryCards$.next(); }
  retryTendencia(): void   { this.retryTendencia$.next(); }
  retryDetalle(): void     { this.retryDetalle$.next(); }
  retryQuincenal(): void   { this.retryQuincenal$.next(); }
  retryQuincenalTendencia(): void { this.retryQuincenalTend$.next(); }

  /** Retry combinado del hero (cards + sparkline). */
  retryHero(): void {
    this.retryCards$.next();
    this.retryTendencia$.next();
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
    this.planFilter$.next(p);
  }

  trackByVentanaQ(_i: number, v: VentanaQuincenal): VentanaQuincenal {
    return v;
  }

  trackByPlan(_i: number, p: PlanFilter): PlanFilter {
    return p;
  }

  // ─── Plugin + opciones Chart.js (no dependen de estado reactivo) ────────────

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

  // ─── Labels precomputados (privados) ────────────────────────────────────────

  private buildDeltaLabelMonth(refDate: Date): string {
    const day = refDate.getDate();
    const prevMonthIndex = refDate.getMonth() === 0 ? 11 : refDate.getMonth() - 1;
    const prevMonthDays = new Date(
      refDate.getFullYear(),
      refDate.getMonth(),
      0
    ).getDate();
    const dayClamped = Math.min(day, prevMonthDays);
    return `vs 1-${dayClamped} ${MESES_CORTOS[prevMonthIndex]}`;
  }

  private buildCortePeriodLabel(refDate: Date): string {
    const dd = String(refDate.getDate()).padStart(2, '0');
    const mm = String(refDate.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${refDate.getFullYear()}`;
  }

  // ─── trackBy ────────────────────────────────────────────────────────────────

  trackByRiesgo(_i: number, r: RiesgoVM): string {
    return r.cliente_id;
  }

  trackById(_i: number, t: EntrenadorOption): string {
    return t.id;
  }

  trackByOrigenKey(_i: number, c: OrigenCardVM): OrigenKey {
    return c.key;
  }

  // ─── Modal Origen (Publicidad / Directos / Recomendación) ─────────────────

  /** Mapa UI-key → DB-key para consultar la EF de detalle por origen. */
  private readonly ORIGEN_UI_TO_DB: Record<OrigenKey, OrigenDbKey> = {
    publicidad:    'publicidad',
    directos:      'llego_solo',
    recomendacion: 'referido'
  };

  /**
   * Abre el modal de detalle para el origen indicado.
   * Congela `fecha_referencia`, `entrenador_id` y `origen` al momento del
   * click para que el modal siga mostrando el mismo período aunque el usuario
   * navegue en el dashboard mientras el modal esté abierto.
   */
  openOrigenModal(uiKey: OrigenKey): void {
    this.origenModalOrigen = this.ORIGEN_UI_TO_DB[uiKey];
    this.origenModalFecha  = this.svc.buildFechaReferencia(this.svc.currentMesPeriodo);
    const sel = this.svc.currentEntrenador;
    this.origenModalEntrenadorId = sel === 'todos' ? null : sel;
    this.origenModalOpen = true;
    this.cdr.markForCheck();
  }

  closeOrigenModal(): void {
    this.origenModalOpen = false;
    this.cdr.markForCheck();
  }

  /**
   * Construye las 3 cards de la sección 01 (Usuarios nuevos).
   * - Publicidad / Directos: reales, alimentadas por
   *   `detalleState$.nuevos_por_origen.{publicidad,llego_solo}`.
   * - Recomendación: dummy (pendiente de definir lógica).
   */
  private buildOrigenCards(ds: DetalleState): OrigenCardVM[] {
    const status: CardStatus =
      ds.status === 'loading' ? 'loading' :
      ds.status === 'error'   ? 'error'   : 'loaded';
    const pub = ds.status === 'loaded' ? ds.data.nuevos_por_origen.publicidad : null;
    const dir = ds.status === 'loaded' ? ds.data.nuevos_por_origen.llego_solo : null;

    return [
      {
        key:    'publicidad',
        label:  'Publicidad',
        color:  '#06b6d4',
        status,
        value:  pub?.total ?? 0,
        delta:  pub?.delta ?? null,
        plan6d: pub?.plan_6d ?? 0,
        plan3d: pub?.plan_3d ?? 0
      },
      {
        key:    'directos',
        label:  'Directos',
        color:  '#8b5cf6',
        status,
        value:  dir?.total ?? 0,
        delta:  dir?.delta ?? null,
        plan6d: dir?.plan_6d ?? 0,
        plan3d: dir?.plan_3d ?? 0
      },
      // TODO(recomendacion): reemplazar por datos reales cuando definamos la lógica.
      {
        key:    'recomendacion',
        label:  'Recomendación',
        color:  '#ec4899',
        status: 'loaded',
        value:  15,
        delta:  6,
        plan6d: 10,
        plan3d: 5
      }
    ];
  }

  trackByQuincenaKey(_i: number, q: QuincenaCardVM): QuincenaKey {
    return q.key;
  }

  trackByIndex(i: number): number {
    return i;
  }
}
