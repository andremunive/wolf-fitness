import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { BehaviorSubject, Observable, Subject, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, takeUntil } from 'rxjs/operators';
import { ChartConfiguration, ChartData } from 'chart.js';

import { formatAmountCop, formatAmountShort, getCategoryColor } from 'src/app/features/app/expense-records/models/expense-record.model';
import { FinanzasService, MesPeriodo } from '../../services/finanzas.service';
import {
  DetalleMetodoPago,
  FinanzasCajaResponse,
  FinanzasComposicionResponse,
  FinanzasDetalleResponse,
  FinanzasResumenResponse,
  FinanzasTendenciaResponse,
  MetodoPago,
  VentanaTendenciaFin
} from '../../models/finanzas.model';

// ─── Tipos de estado de carga ─────────────────────────────────────────────────

interface StateLoading {
  status: 'loading';
  data: null;
  error: null;
}

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

type ResumenState = StateLoading | ResumenStateLoaded | ResumenStateError | ResumenStatePreApp;

// ─── Tipos de estado de Composición ───────────────────────────────────────────

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

// ─── Tipos de estado de Detalle ───────────────────────────────────────────────

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

type DetalleState = StateLoading | DetalleStateLoaded | DetalleStateError | DetalleStatePreApp;

// ─── Toggle de vista de Composición ───────────────────────────────────────────

type VistaComposicion = 'categoria' | 'proveedor';

// ─── Tipos de estado de Tendencia ─────────────────────────────────────────────

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

interface TendenciaStateEmpty {
  status: 'empty';
  data: null;
  error: null;
}

type TendenciaState = StateLoading | TendenciaStateLoaded | TendenciaStateError | TendenciaStateEmpty;

/**
 * Primer mes con datos reales en la aplicación (abril 2026).
 * Hardcoded como constante operativa — no es un detalle de UI movible.
 */
const APP_START_YEAR  = 2026;
const APP_START_MONTH = 4;

/** Etiquetas cortas de mes para el label de delta ("vs abr"). */
const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

// ─── Constantes de color para la gráfica de tendencia ────────────────────────

/** Verde — ingresos (dinero que entra). */
const COLOR_INGRESOS = '#10b981';
/** Rojo suave — egresos totales (dinero que sale). */
const COLOR_EGRESOS  = '#f87171';
/** Teal de marca — utilidad (resultado neto). */
const COLOR_UTILIDAD = '#228d9f';

/** Ventanas temporales disponibles, en el orden que se muestran en las pills. */
const VENTANAS_TENDENCIA: VentanaTendenciaFin[] = [1, 2, 6];

/** Labels legibles para cada ventana. */
const VENTANA_TENDENCIA_LABELS: Record<VentanaTendenciaFin, string> = {
  1: 'Mes anterior',
  2: 'Últimos 2 meses',
  6: 'Últimos 6 meses'
};

@Component({
  selector: 'app-finanzas-dashboard',
  templateUrl: './finanzas-dashboard.component.html',
  styleUrls: ['./finanzas-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FinanzasDashboardComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  // ─── Caja ──────────────────────────────────────────────────────────────────

  /** Disparador de (re)carga de Caja. Emitir void en el BehaviorSubject reinicia el switchMap. */
  private readonly retryCaja$ = new BehaviorSubject<void>(undefined);

  /**
   * Estado de carga de la sección Caja.
   * - Arranca en `loading` gracias a startWith.
   * - Cualquier nueva emisión de retryCaja$ cancela la llamada en vuelo (switchMap).
   * - shareReplay(1) para que el async pipe no re-ejecute al suscribirse.
   */
  readonly cajaState$: Observable<CajaState> = this.retryCaja$.pipe(
    switchMap(() =>
      this.svc.getCaja().pipe(
        map((data): CajaState => ({ status: 'loaded', data, error: null })),
        catchError((err): Observable<CajaState> => of({ status: 'error', data: null, error: err })),
        startWith<CajaState>({ status: 'loading', data: null, error: null })
      )
    ),
    shareReplay(1)
  );

  // ─── Resumen ────────────────────────────────────────────────────────────────

  /** Disparador de retry manual para la sección Resumen. */
  private readonly retryResumen$ = new BehaviorSubject<void>(undefined);

  /**
   * Estado de carga de la sección Resumen.
   *
   * Patrón elegido: combineLatest([mesPeriodo$, retryResumen$]).
   * Razón: getResumen() ya reacciona internamente a mesPeriodo$ vía switchMap,
   * pero si la suscripción del componente solo escucha retryResumen$, el cambio
   * de mes haría que el switchMap interno cancele y re-ejecute sin que el
   * startWith del inner pipe vuelva a emitir 'loading'. Al combinar ambas fuentes
   * aquí, cada cambio de mes O cada retry:
   *   1. Dispara el switchMap externo (cancela la llamada en vuelo).
   *   2. El inner pipe arranca con startWith('loading') — skeleton visible.
   *   3. getResumen() lee el período actual del BehaviorSubject directamente,
   *      así que no hay doble suscripción a mesPeriodo$.
   */
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
        catchError((err): Observable<ResumenState> => of({ status: 'error', data: null, error: err })),
        startWith<ResumenState>({ status: 'loading', data: null, error: null })
      );
    }),
    shareReplay(1)
  );

  // ─── Tendencia ─────────────────────────────────────────────────────────────

  /** Constantes de ventana y labels expuestos al template. */
  readonly ventanasTendencia: VentanaTendenciaFin[] = VENTANAS_TENDENCIA;
  readonly ventanaTendenciaLabels: Record<VentanaTendenciaFin, string> = VENTANA_TENDENCIA_LABELS;

  /** Ventana temporal activa — proxy del servicio para los bindings del template. */
  readonly ventanaTendencia$: Observable<VentanaTendenciaFin> = this.svc.ventanaTendencia$;

  /**
   * Disparador de retry manual para la sección Tendencia.
   * combineLatest lo combina con ventanaTendencia$ para que cualquier cambio
   * de ventana o un retry explícito relance la llamada a la EF.
   */
  private readonly retryTendencia$ = new BehaviorSubject<void>(undefined);

  /**
   * Estado de la sección Tendencia.
   *
   * Patrón análogo a resumenState$: combineLatest([ventanaTendencia$, retryTendencia$])
   * para que cada cambio de ventana o retry dispare el switchMap externo,
   * garantizando que startWith('loading') se emita en cada transición.
   *
   * empty → todos los puntos tienen ingresos=0 y egresos=0 (sin datos reales).
   */
  readonly tendenciaState$: Observable<TendenciaState> = combineLatest([
    this.svc.ventanaTendencia$,
    this.retryTendencia$
  ]).pipe(
    switchMap(([meses_atras]) =>
      this.svc.getTendencia(meses_atras).pipe(
        map((data): TendenciaState => {
          const allZero = data.every(
            p => p.ingresos_cop === 0 && p.egresos_totales_cop === 0
          );
          return allZero
            ? { status: 'empty', data: null, error: null }
            : { status: 'loaded', data, error: null };
        }),
        catchError((err): Observable<TendenciaState> =>
          of({ status: 'error', data: null, error: err })
        ),
        startWith<TendenciaState>({ status: 'loading', data: null, error: null })
      )
    ),
    shareReplay(1)
  );

  // ─── Composición ───────────────────────────────────────────────────────────

  /** Color fijo indigo-500 para la fila de nómina (no pasa por la paleta determinista). */
  private static readonly COLOR_NOMINA = '#6366f1';

  readonly vistasComposicion: VistaComposicion[] = ['categoria', 'proveedor'];
  readonly vistaComposicionLabels: Record<VistaComposicion, string> = {
    categoria: 'Por categoría',
    proveedor: 'Por proveedor'
  };

  vistaComposicion: VistaComposicion = 'categoria';

  private readonly retryComposicion$ = new BehaviorSubject<void>(undefined);

  /**
   * Patrón análogo a resumenState$: combineLatest([mesPeriodo$, retryComposicion$])
   * para que cada cambio de mes O cada retry dispare el switchMap externo,
   * garantizando que startWith('loading') se emita en cada transición.
   */
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

  /**
   * Cache del último array de filas activo.
   * El tooltip de la dona accede al porcentaje por índice sin necesidad de
   * incluirlo en el dataset de Chart.js (que solo acepta `number[]`).
   */
  private _composicionLastRows: Array<{ porcentaje: number }> = [];

  // ─── UI state ──────────────────────────────────────────────────────────────

  /** Observable del estado de visibilidad de montos. Expuesto al template vía async pipe. */
  readonly cajaVisible$: Observable<boolean> = this.svc.cajaVisible$;

  /** Label visible en el selector de período: "Mayo 2026". */
  periodoLabel = '';
  /** Bloquea el botón ▶ cuando el período mostrado ya es el mes real actual. */
  isAtCurrentMonth = true;
  /** Bloquea el botón ◀ cuando el período mostrado ya es el primer mes con datos (abril 2026). */
  isAtAppStartMonth = false;

  /** Snapshot del período activo, actualizado por la suscripción en ngOnInit. */
  protected periodo: MesPeriodo = { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };

  private readonly currentYear  = new Date().getFullYear();
  private readonly currentMonth = new Date().getMonth() + 1;

  constructor(
    private readonly svc: FinanzasService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.svc.mesPeriodo$.pipe(takeUntil(this.destroy$)).subscribe((p) => {
      this.periodo            = p;
      this.periodoLabel       = this.svc.getPeriodoLabel(p.year, p.month);
      this.isAtCurrentMonth   = p.year === this.currentYear && p.month === this.currentMonth;
      this.isAtAppStartMonth  = p.year === APP_START_YEAR && p.month === APP_START_MONTH;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Período ─────────────────────────────────────────────────────────────

  onPrevMonth(): void {
    if (this.isAtAppStartMonth) return;
    const { year, month } = this.periodo;
    if (month === 1) {
      this.svc.setPeriodo(year - 1, 12);
    } else {
      this.svc.setPeriodo(year, month - 1);
    }
  }

  onNextMonth(): void {
    if (this.isAtCurrentMonth) {
      return;
    }
    const { year, month } = this.periodo;
    if (month === 12) {
      this.svc.setPeriodo(year + 1, 1);
    } else {
      this.svc.setPeriodo(year, month + 1);
    }
  }

  // ─── Caja ────────────────────────────────────────────────────────────────

  retryCaja(): void {
    this.retryCaja$.next();
  }

  onToggleCaja(): void {
    this.svc.toggleCajaVisible();
  }

  // ─── Resumen ─────────────────────────────────────────────────────────────

  retryResumen(): void {
    this.retryResumen$.next();
  }

  /**
   * Devuelve true para cualquier período anterior a abril 2026 (inicio de la app).
   * Se usa para evitar llamar a la EF con datos que no existen.
   */
  isPreAppPeriod(period: MesPeriodo): boolean {
    return period.year < APP_START_YEAR ||
      (period.year === APP_START_YEAR && period.month < APP_START_MONTH);
  }

  /**
   * Etiqueta corta del mes anterior al período activo ("abr", "mar", etc.).
   * Se llama desde el template con el período resuelto del async pipe, no
   * con this.periodo, para mantener coherencia OnPush sin snapshot manual.
   */
  prevMonthLabel(period: MesPeriodo): string {
    // month es 1-indexed; MESES_CORTOS es 0-indexed.
    // mes anterior: si month=1 → dic (índice 11); si month>1 → month-2.
    const prevIndex = period.month === 1 ? 11 : period.month - 2;
    return MESES_CORTOS[prevIndex];
  }

  // ─── Delta classes ────────────────────────────────────────────────────────

  /**
   * Clases de delta para métricas directas (ingresos, utilidad):
   * subir es bueno (verde), bajar es malo (rojo).
   */
  ingresosDeltaClass(delta: number): string {
    if (delta > 0) return 'stats-card__delta--up';
    if (delta < 0) return 'stats-card__delta--down';
    return 'stats-card__delta--zero';
  }

  /**
   * Clases de delta para métricas invertidas (egresos, nómina):
   * subir es malo (rojo), bajar es bueno (verde).
   * Reutiliza las clases --up-bad y --down-good definidas en el SCSS de Clientes.
   */
  egresosDeltaClass(delta: number): string {
    if (delta > 0) return 'stats-card__delta--up-bad';
    if (delta < 0) return 'stats-card__delta--down-good';
    return 'stats-card__delta--zero';
  }

  // ─── Tendencia ───────────────────────────────────────────────────────────

  retryTendencia(): void {
    this.retryTendencia$.next();
  }

  onVentanaTendenciaChange(n: VentanaTendenciaFin): void {
    this.svc.setVentanaTendencia(n);
  }

  trackByVentanaTendencia(_i: number, v: VentanaTendenciaFin): VentanaTendenciaFin {
    return v;
  }

  /**
   * Construye el ChartData de Chart.js para la gráfica de tendencia.
   * Tres datasets: Ingresos / Egresos totales / Utilidad.
   * El mes actual se renderiza con opacidad 0.6 + asterisco en su label
   * para indicar que los datos son parciales.
   */
  buildTendenciaChartData(puntos: FinanzasTendenciaResponse): ChartData<'bar'> {
    const labels = puntos.map(p => p.es_mes_actual ? `${p.label} *` : p.label);

    const bgIngresos = puntos.map(p =>
      p.es_mes_actual ? this.withAlpha(COLOR_INGRESOS, 0.6) : COLOR_INGRESOS
    );
    const bgEgresos = puntos.map(p =>
      p.es_mes_actual ? this.withAlpha(COLOR_EGRESOS, 0.6) : COLOR_EGRESOS
    );
    const bgUtilidad = puntos.map(p =>
      p.es_mes_actual ? this.withAlpha(COLOR_UTILIDAD, 0.6) : COLOR_UTILIDAD
    );

    return {
      labels,
      datasets: [
        { label: 'Ingresos',        data: puntos.map(p => p.ingresos_cop),        backgroundColor: bgIngresos },
        { label: 'Egresos totales', data: puntos.map(p => p.egresos_totales_cop), backgroundColor: bgEgresos  },
        { label: 'Utilidad',        data: puntos.map(p => p.utilidad_cop),        backgroundColor: bgUtilidad }
      ]
    };
  }

  /** Opciones estáticas de Chart.js. Tooltip muestra monto completo; eje Y usa formato corto. */
  readonly tendenciaChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (ctx) => {
            const value = ctx.parsed.y as number;
            return `${ctx.dataset.label}: ${formatAmountCop(value)}`;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        // utilidad puede ser negativa → permitir < 0
        beginAtZero: false,
        ticks: {
          callback: (value) => formatAmountShort(value as number)
        }
      }
    }
  };

  /** True si algún punto de la serie corresponde al mes en curso (para mostrar la nota al pie). */
  hasMesActual(puntos: FinanzasTendenciaResponse): boolean {
    return puntos.some(p => p.es_mes_actual);
  }

  /** Convierte un color hex a rgba con el alpha dado. Usado para opacar el mes actual. */
  private withAlpha(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ─── Detalle ───────────────────────────────────────────────────────────────

  /** Emojis visuales por método de pago. Estáticos — no necesitan ser reactivos. */
  private static readonly METODO_EMOJIS: Record<MetodoPago, string> = {
    cash:     '💵',
    nequi:    '📱',
    transfer: '🏦',
    other:    '🔹'
  };

  /** Devuelve el emoji visual del método de pago. */
  metodoEmoji(metodo: MetodoPago): string {
    return FinanzasDashboardComponent.METODO_EMOJIS[metodo] ?? '🔹';
  }

  private readonly retryDetalle$ = new BehaviorSubject<void>(undefined);

  /**
   * Estado de la sección Detalle.
   * Patrón análogo a composicionState$: combineLatest([mesPeriodo$, retryDetalle$])
   * garantiza que startWith('loading') se emita en cada cambio de período o retry.
   */
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
        catchError((err): Observable<DetalleState> => of({ status: 'error', data: null, error: err })),
        startWith<DetalleState>({ status: 'loading', data: null, error: null })
      );
    }),
    shareReplay(1)
  );

  retryDetalle(): void { this.retryDetalle$.next(); }

  trackByMetodo(_i: number, m: DetalleMetodoPago): MetodoPago { return m.metodo; }

  /**
   * Cache de las quincenas activas para que el tooltip de la gráfica
   * pueda leer estado y cantidad de pagos por índice sin necesitar el dataset.
   * Se actualiza cada vez que el template llama a `quincenasForChart()`.
   */
  private _detalleQuincenas: FinanzasDetalleResponse['quincenas'] | null = null;

  /**
   * Memoiza las quincenas para que el tooltip pueda leerlas por índice.
   * Se llama en el template antes de pasarlas al canvas.
   */
  quincenasForChart(
    q: FinanzasDetalleResponse['quincenas']
  ): FinanzasDetalleResponse['quincenas'] {
    this._detalleQuincenas = q;
    return q;
  }

  /**
   * Construye el ChartData de Chart.js para las 2 barras de quincena.
   * Q2 en estado 'no_iniciada' usa null para que Chart.js deje la barra vacía.
   * Color con opacidad 0.5 cuando la quincena está 'parcial' (en curso).
   */
  buildQuincenasChartData(q: FinanzasDetalleResponse['quincenas']): ChartData<'bar'> {
    const q2Value: number | null = q.q2.estado === 'no_iniciada' ? null : q.q2.total_cop;

    const colorQ1 = q.q1.estado === 'parcial'
      ? this.withAlpha(COLOR_UTILIDAD, 0.5)
      : COLOR_UTILIDAD;
    const colorQ2 = q.q2.estado === 'parcial'
      ? this.withAlpha(COLOR_UTILIDAD, 0.5)
      : COLOR_UTILIDAD;

    return {
      labels: ['Q1 (1–15)', 'Q2 (16–fin)'],
      datasets: [{
        label: 'Ingresos',
        data: [q.q1.total_cop, q2Value],
        backgroundColor: [colorQ1, colorQ2],
        borderRadius: 6,
        maxBarThickness: 80
      }]
    };
  }

  readonly quincenasChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = ctx.parsed.y as number | null;
            const idx   = ctx.dataIndex;
            const q     = idx === 0
              ? this._detalleQuincenas?.q1
              : this._detalleQuincenas?.q2;
            if (!q) return '';
            if (q.estado === 'no_iniciada') return 'Aún no iniciada';
            const estadoLabel = q.estado === 'parcial' ? 'En curso' : 'Completa';
            const valStr      = value !== null ? formatAmountCop(value) : '$0';
            const pagosLabel  = q.cantidad_pagos === 1
              ? '1 pago'
              : `${q.cantidad_pagos} pagos`;
            return `${valStr} — ${pagosLabel} — ${estadoLabel}`;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
          callback: (value) => formatAmountShort(value as number)
        }
      }
    }
  };

  // ─── Composición — métodos públicos ──────────────────────────────────────

  retryComposicion(): void {
    this.retryComposicion$.next();
  }

  onVistaComposicionChange(v: VistaComposicion): void {
    this.vistaComposicion = v;
    this.cdr.markForCheck();
  }

  trackByVistaComposicion(_i: number, v: VistaComposicion): VistaComposicion {
    return v;
  }

  trackByComposicionRow(_i: number, r: { id: string }): string {
    return r.id;
  }

  /**
   * Devuelve el color de fondo (hex) para una fila de composición.
   * La nómina usa indigo fijo; el resto pasa por la paleta determinista.
   * Se usa el color `border` (más saturado) en lugar de `bg` (pastel)
   * porque en una dona y en barras de progreso el pastel queda demasiado lavado.
   */
  getRowColor(id: string): string {
    if (id === 'nomina') return FinanzasDashboardComponent.COLOR_NOMINA;
    return getCategoryColor(id).border;
  }

  /**
   * Normaliza las filas de la vista activa a un shape común para el template.
   * Memoiza el resultado en `_composicionLastRows` para que el tooltip de la
   * dona pueda leer el porcentaje por índice sin que esté en el dataset.
   */
  composicionRows(data: FinanzasComposicionResponse): Array<{
    id: string;
    nombre: string;
    emoji?: string;
    total_cop: number;
    porcentaje: number;
    cantidad: number;
  }> {
    const rows = this.vistaComposicion === 'categoria'
      ? data.por_categoria.map(r => ({
          id: r.categoria_id,
          nombre: r.nombre,
          emoji: r.emoji,
          total_cop: r.total_cop,
          porcentaje: r.porcentaje,
          cantidad: r.cantidad
        }))
      : data.por_proveedor.map(r => ({
          id: r.proveedor_id,
          nombre: r.nombre,
          emoji: undefined,
          total_cop: r.total_cop,
          porcentaje: r.porcentaje,
          cantidad: r.cantidad
        }));
    this._composicionLastRows = rows;
    return rows;
  }

  /**
   * Construye el ChartData para la dona de composición.
   * Usa el color `border` de la paleta (más saturado) para los segmentos —
   * el `bg` pastel queda lavado sobre el canvas blanco de Chart.js.
   */
  buildDoughnutData(
    rows: Array<{ id: string; nombre: string; total_cop: number; porcentaje: number }>
  ): ChartData<'doughnut'> {
    return {
      labels: rows.map(r => r.nombre),
      datasets: [{
        data: rows.map(r => r.total_cop),
        backgroundColor: rows.map(r => this.getRowColor(r.id)),
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 6
      }]
    };
  }

  /** Opciones estáticas de Chart.js para la dona. La leyenda va en la columna derecha. */
  readonly doughnutOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = (ctx.dataset.data as number[])[ctx.dataIndex];
            const pct = this._composicionLastRows[ctx.dataIndex]?.porcentaje ?? 0;
            return `${ctx.label}: ${formatAmountCop(value)} (${pct}%)`;
          }
        }
      }
    }
  };

  // ─── Formatters ──────────────────────────────────────────────────────────

  formatCop(amount: number): string {
    return formatAmountCop(amount);
  }

  formatVisible(amount: number, visible: boolean | null): string {
    return visible ? formatAmountCop(amount) : '••••••';
  }

  formatDateDmy(iso: string): string {
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [yyyy, mm, dd] = parts;
    return `${dd}/${mm}/${yyyy}`;
  }

  trackByIndex(index: number, _item: unknown): number {
    return index;
  }
}
