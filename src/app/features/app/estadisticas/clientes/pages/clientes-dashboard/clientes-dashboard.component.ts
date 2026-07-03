import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
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
  DetalleResponse,
  EntrenadorFilter,
  EntrenadorOption,
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
import { NuevosOrigenRow } from '../../../services/estadisticas-clientes-vm.service';

import { MESES_CORTOS, MESES_COMPLETOS } from '../../../models/estadisticas-constants';

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

// ─── Card VM (Sección 01 — Movimiento del mes) ────────────────────────────────

export type CardKey = 'tipo_a' | 'tipo_b' | 'nuevos' | 'recuperados';
export type CardStatus = 'loading' | 'loaded' | 'error';
/** Tendencia de la sparkline: arriba (verde), abajo (rojo) o plana (gris). */
export type CardTrend = 'up' | 'down' | 'flat';

export interface CardVM {
  key: CardKey;
  label: string;
  /** Color del dot identificador de la card en el header (semántico). */
  color: string;
  /** Tendencia derivada de delta — usada para colorear el chip. */
  trend: CardTrend;
  status: CardStatus;
  value: number;
  /** null = no se muestra chip de delta. */
  delta: number | null;
  /** Clientes en plan 6 días (plan breakdown). */
  plan6d: number;
  /** Clientes en plan 3 días (plan breakdown). */
  plan3d: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const SPARKLINE_VB_WIDTH  = 320;
const SPARKLINE_VB_HEIGHT = 60;

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

  /** Array de CardVM para la fila de movimiento del mes. */
  readonly cardsVM$: Observable<CardVM[]> = combineLatest([
    this.cardsState$,
    this.detalleState$
  ]).pipe(
    map(([cs, ds]) => {
      // vmSvc acepta los estados completos y deriva el status por card
      return this.vmSvc.buildCards(cs, ds);
    })
  );

  /** VMs de las dos cards de quincena (Q1 + Q2). */
  readonly quincenaCardsVM$: Observable<QuincenaCardVM[] | null> =
    this.quincenalState$.pipe(
      map((qs) =>
        qs.status === 'loaded'
          ? this.vmSvc.buildQuincenaCards(qs.data)
          : null
      )
    );

  /** Filas del panel flotante "Nuevos por origen". */
  readonly nuevosOrigenes$: Observable<NuevosOrigenRow[]> =
    this.detalleState$.pipe(
      map((ds) => this.vmSvc.buildNuevosOrigenes(ds))
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
  readonly retencionVM$: Observable<RetencionVM | null> =
    this.detalleState$.pipe(
      map((ds) =>
        ds.status === 'loaded'
          ? this.vmSvc.buildRetencionVM(ds.data, new Date())
          : null
      )
    );

  /** VMs de la tabla de clientes en riesgo (sección 06). */
  readonly riesgoVMs$: Observable<RiesgoVM[]> =
    this.detalleState$.pipe(
      map((ds) =>
        ds.status === 'loaded'
          ? this.vmSvc.buildRiesgoVMs(ds.data.en_riesgo)
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

  /** Clave de la card cuyo panel flotante está abierto. null = ninguno. */
  openCardKey: CardKey | null = null;

  constructor(
    private readonly svc: EstadisticasService,
    private readonly vmSvc: EstadisticasClientesVmService,
    private readonly sparklineSvc: SparklineGeometryService,
    private readonly gaugeSvc: GaugeGeometryService,
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

  // ─── Panel flotante (Nuevos por origen) ────────────────────────────────────

  @HostListener('document:keydown.escape')
  onEscKey(): void {
    if (this.openCardKey !== null) {
      this.openCardKey = null;
      this.cdr.markForCheck();
    }
  }

  /**
   * Alterna la apertura del panel de la card "nuevos".
   * Llama stopPropagation para evitar que el HostListener de document:click
   * cierre el panel inmediatamente tras abrirlo.
   */
  onToggleNuevosPanel(event: MouseEvent): void {
    event.stopPropagation();
    this.openCardKey = this.openCardKey === 'nuevos' ? null : 'nuevos';
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

  // ─── Filtro de entrenador ───────────────────────────────────────────────────

  onEntrenadorChange(value: string): void {
    this.svc.setEntrenador((value || 'todos') as EntrenadorFilter);
  }

  // ─── Retry ──────────────────────────────────────────────────────────────────

  retryHero(): void {
    // Re-asignar el mismo entrenador re-dispara los streams.
    // Usa el getter sincrónico del servicio en lugar de suscribirse.
    const current = this.svc.currentEntrenador;
    this.svc.setEntrenador('todos');
    if (current !== 'todos') {
      this.svc.setEntrenador(current);
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
    this.planFilter$.next(p);
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

  // ─── trackBy ────────────────────────────────────────────────────────────────

  trackByRiesgo(_i: number, r: RiesgoVM): string {
    return r.cliente_id;
  }

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
