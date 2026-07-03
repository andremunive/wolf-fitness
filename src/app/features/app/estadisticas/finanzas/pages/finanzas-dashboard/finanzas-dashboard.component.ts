import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy
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
  switchMap
} from 'rxjs/operators';

import { ChartConfiguration } from 'chart.js';

import { formatAmountCop, formatAmountShort } from 'src/app/features/app/expense-records/models/expense-record.model';
import { FinanzasService, MesPeriodo } from '../../services/finanzas.service';
import { FinanzasVmService, CardKey, CardVM, ExpenseType, EgresosDesgloseRow, VistaComposicion } from '../../services/finanzas-vm.service';
import { SparklineGeometryService } from '../../../services/sparkline-geometry.service';
import { GaugeGeometryService } from '../../../services/gauge-geometry.service';
import {
  FinanzasCajaResponse,
  FinanzasComposicionResponse,
  FinanzasDetalleResponse,
  FinanzasResumenResponse,
  FinanzasTendenciaResponse,
  VentanaTendenciaFin
} from '../../models/finanzas.model';
import { MESES_CORTOS, MESES_COMPLETOS } from '../../../models/estadisticas-constants';

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

// ─── Quincena cierre info (solo para el bloque de caja de recaudo) ────────────

interface QuincenaCierreInfo {
  cierreLabel: string;
  badgeLabel: string;
  daysRemaining: number;
  countdownLabel: string;
  countdownVariant: 'default' | 'warn' | 'danger';
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const APP_START_YEAR  = 2026;
const APP_START_MONTH = 4;

const SPARKLINE_WINDOW = 6;

const VENTANAS_TENDENCIA: VentanaTendenciaFin[] = [1, 2, 6];
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
export class FinanzasDashboardComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();

  // ─── State streams ────────────────────────────────────────────────────────

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

  // ─── Ventana de tendencia ─────────────────────────────────────────────────

  readonly ventanasTendencia: VentanaTendenciaFin[] = VENTANAS_TENDENCIA;
  readonly ventanaTendenciaLabels: Record<VentanaTendenciaFin, string> = VENTANA_TENDENCIA_LABELS;
  readonly ventanaTendencia$: Observable<VentanaTendenciaFin> = this.svc.ventanaTendencia$;

  // ─── Montos visibles ──────────────────────────────────────────────────────

  readonly montosVisibles$: Observable<boolean> = this.svc.montosVisibles$;

  // ─── Período como Observables declarativos ────────────────────────────────

  private readonly currentYear  = new Date().getFullYear();
  private readonly currentMonth = new Date().getMonth() + 1;

  readonly periodo$ = this.svc.mesPeriodo$;

  readonly periodoLabel$ = this.svc.mesPeriodo$.pipe(
    map((p) => this.svc.getPeriodoLabel(p.year, p.month))
  );

  readonly isAtCurrentMonth$ = this.svc.mesPeriodo$.pipe(
    map((p) => p.year === this.currentYear && p.month === this.currentMonth)
  );

  readonly isAtAppStartMonth$ = this.svc.mesPeriodo$.pipe(
    map((p) => p.year === APP_START_YEAR && p.month === APP_START_MONTH)
  );

  readonly prevMonthLabel$ = this.svc.mesPeriodo$.pipe(
    map((p) => {
      const prevMonthIdx = p.month === 1 ? 11 : p.month - 2; // 0-indexed
      return MESES_CORTOS[prevMonthIdx];
    })
  );

  // ─── Vista de composición (BehaviorSubject para OnPush) ───────────────────

  private readonly _vistaComposicion$ = new BehaviorSubject<VistaComposicion>('categoria');
  readonly vistaComposicion$ = this._vistaComposicion$.asObservable();

  readonly vistaComposicionLabels: Record<VistaComposicion, string> = {
    categoria: 'Por categoría',
    proveedor: 'Por proveedor',
    origen_ingresos: 'Origen ingresos'
  };

  // ─── Observables derivados del VM service ────────────────────────────────

  readonly heroSparkline$ = this.tendenciaState$.pipe(
    map((ts) =>
      ts.status === 'loaded' && ts.data
        ? this.vmSvc.buildHeroSparkline(ts.data)
        : null
    )
  );

  readonly gaugeVM$ = this.resumenState$.pipe(
    map((rs) =>
      rs.status === 'loaded' && rs.data
        ? this.vmSvc.buildGauge(rs.data)
        : null
    )
  );

  readonly cardsVM$ = combineLatest([
    this.resumenState$,
    this.tendenciaState$,
    this.cajaState$
  ]).pipe(
    map(([rs, ts, cs]) =>
      this.vmSvc.buildCards(rs, ts, cs)
    )
  );

  readonly windowedPuntos$ = combineLatest([
    this.tendenciaState$,
    this.svc.ventanaTendencia$
  ]).pipe(
    map(([ts, ventana]) =>
      ts.status === 'loaded' && ts.data
        ? this.vmSvc.windowedPuntos(ts.data, ventana)
        : null
    )
  );

  readonly variacion$ = this.windowedPuntos$.pipe(
    map((p) => (p ? this.vmSvc.buildVariacion(p) : null))
  );

  readonly seriesLegend$ = this.windowedPuntos$.pipe(
    map((p) => (p ? this.vmSvc.buildSeriesLegend(p) : []))
  );

  readonly tendenciaChartData$ = this.windowedPuntos$.pipe(
    map((p) => (p ? this.vmSvc.buildChartData(p) : null))
  );

  readonly metodoRows$ = this.detalleState$.pipe(
    map((ds) => (ds.status === 'loaded' ? this.vmSvc.buildMetodoRows(ds.data!) : []))
  );

  readonly metodoChartData$ = this.detalleState$.pipe(
    map((ds) =>
      ds.status === 'loaded' ? this.vmSvc.buildMetodoChartData(ds.data!) : null
    )
  );

  readonly totalPagos$ = this.detalleState$.pipe(
    map((ds) => (ds.status === 'loaded' ? this.vmSvc.totalPagos(ds.data!) : 0))
  );

  readonly quincenaRows$ = this.detalleState$.pipe(
    map((ds) => (ds.status === 'loaded' ? this.vmSvc.buildQuincenaRows(ds.data!) : []))
  );

  readonly quincenaInsight$ = this.detalleState$.pipe(
    map((ds) => (ds.status === 'loaded' ? this.vmSvc.buildQuincenaInsight(ds.data!) : ''))
  );

  readonly composicionRows$ = combineLatest([
    this.composicionState$,
    this.vistaComposicion$
  ]).pipe(
    map(([cs, vista]) =>
      cs.status === 'loaded' ? this.vmSvc.buildComposicionRows(cs.data!, vista) : []
    )
  );

  readonly composicionChartData$ = combineLatest([
    this.composicionState$,
    this.vistaComposicion$
  ]).pipe(
    map(([cs, vista]) =>
      cs.status === 'loaded' ? this.vmSvc.buildComposicionChartData(cs.data!, vista) : undefined
    )
  );

  readonly ingresosRows$ = this.composicionState$.pipe(
    map((cs) =>
      cs.status === 'loaded' ? this.vmSvc.buildIngresosRows(cs.data!.composicion_ingresos) : []
    )
  );

  readonly ingresosChartData$ = this.composicionState$.pipe(
    map((cs) =>
      cs.status === 'loaded'
        ? this.vmSvc.buildIngresosChartData(cs.data!.composicion_ingresos)
        : undefined
    )
  );

  readonly egresosDesglose$ = this.resumenState$.pipe(
    map((rs) =>
      rs.status === 'loaded'
        ? this.vmSvc.buildEgresosDesglose(rs.data!.egresos_por_tipo)
        : []
    )
  );

  readonly vistasComposicionDisponibles$ = this.composicionState$.pipe(
    map((cs) =>
      this.vmSvc.vistasComposicionDisponibles(
        cs.status === 'loaded' ? cs.data : null
      )
    )
  );

  // ─── Inyección ────────────────────────────────────────────────────────────

  constructor(
    private readonly svc: FinanzasService,
    private readonly vmSvc: FinanzasVmService,
    private readonly sparklineSvc: SparklineGeometryService,
    private readonly gaugeSvc: GaugeGeometryService
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Período ──────────────────────────────────────────────────────────────

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

  // ─── Toggle montos ────────────────────────────────────────────────────────

  onToggleMontos(): void {
    this.svc.toggleMontosVisibles();
  }

  // ─── Retry ────────────────────────────────────────────────────────────────

  retryResumen(): void     { this.retryResumen$.next(); }
  retryTendencia(): void   { this.retryTendencia$.next(); }
  retryCaja(): void        { this.retryCaja$.next(); }
  retryDetalle(): void     { this.retryDetalle$.next(); }
  retryComposicion(): void { this.retryComposicion$.next(); }

  // ─── Vista de composición ─────────────────────────────────────────────────

  onVistaComposicionChange(v: VistaComposicion): void {
    this._vistaComposicion$.next(v);
  }

  // ─── Ventana de tendencia ─────────────────────────────────────────────────

  onVentanaTendenciaChange(n: VentanaTendenciaFin): void {
    this.svc.setVentanaTendencia(n);
  }

  // ─── Panel flotante de egresos ────────────────────────────────────────────

  openCardKey: CardKey | null = null;

  @HostListener('document:keydown.escape')
  onEscKey(): void {
    this.openCardKey = null;
  }

  onToggleEgresosPanel(key: CardKey, event: MouseEvent): void {
    event.stopPropagation();
    this.openCardKey = this.openCardKey === key ? null : key;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.openCardKey = null;
  }

  // ─── Período helper ───────────────────────────────────────────────────────

  isPreAppPeriod(period: MesPeriodo): boolean {
    return (
      period.year < APP_START_YEAR ||
      (period.year === APP_START_YEAR && period.month < APP_START_MONTH)
    );
  }

  // ─── Cierre de quincena (depende de "hoy", no del período) ───────────────

  buildQuincenaCierre(cs: CajaState | null): QuincenaCierreInfo | null {
    if (!cs || cs.status !== 'loaded') return null;

    const now    = new Date();
    const today  = now.getDate();
    const isQ1   = today <= 15;

    const cierreDia  = isQ1 ? 15 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const mesNombre  = MESES_COMPLETOS[now.getMonth()].toLowerCase();

    const target     = new Date(now.getFullYear(), now.getMonth(), cierreDia, 23, 59, 59);
    const diffMs     = target.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / 86_400_000));

    let countdownLabel: string;
    if (daysRemaining === 0)      countdownLabel = 'hoy';
    else if (daysRemaining === 1) countdownLabel = 'en 1 día';
    else                          countdownLabel = `en ${daysRemaining} días`;

    let countdownVariant: QuincenaCierreInfo['countdownVariant'] = 'default';
    if (daysRemaining <= 1)      countdownVariant = 'danger';
    else if (daysRemaining <= 3) countdownVariant = 'warn';

    return {
      cierreLabel: `${cierreDia} ${mesNombre}`,
      badgeLabel: cs.data!.caja_menor.quincena_label,
      daysRemaining,
      countdownLabel,
      countdownVariant
    };
  }

  buildQuincenaCierreLabel(): string {
    const now       = new Date();
    const today     = now.getDate();
    const mesNombre = MESES_COMPLETOS[now.getMonth()].toLowerCase();
    const ultimoDia = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    if (today <= 15) return `Cierre 15 ${mesNombre} · ${ultimoDia} ${mesNombre}`;
    return `Cierre ${ultimoDia} ${mesNombre}`;
  }

  // ─── Texto de la fórmula P&L ──────────────────────────────────────────────

  formulaText(resumen: FinanzasResumenResponse, visible: boolean | null): string {
    const fmt = (v: number) => visible ? formatAmountShort(v) : '$••••';
    return `+ Ingresos ${fmt(resumen.ingresos.total_cop)} · − Operativos ${fmt(resumen.egresos_operativos.total_cop)} · − Nómina ${fmt(resumen.nomina.total_cop)}`;
  }

  // ─── Chart options (no lógica de negocio, van en el componente) ───────────

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
        ticks: { color: '#6b7280', font: { size: 11 } }
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

  // ─── TrackBy ──────────────────────────────────────────────────────────────

  trackByCardKey(_i: number, c: CardVM): CardKey      { return c.key; }
  trackByExpenseType(_i: number, r: EgresosDesgloseRow): ExpenseType { return r.tipo; }
  trackByVistaComposicion(_i: number, v: VistaComposicion): VistaComposicion { return v; }
  trackByVentana(_i: number, v: VentanaTendenciaFin): VentanaTendenciaFin { return v; }
  trackByIndex(index: number): number { return index; }
  trackByMetodo(_i: number, r: { metodo: string }): string { return r.metodo; }
  trackByQuincenaKey(_i: number, q: { key: string }): string { return q.key; }
  trackByComposicionId(_i: number, r: { id: string }): string { return r.id; }
}
