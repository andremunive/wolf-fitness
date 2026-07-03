import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { Router } from '@angular/router';
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
  switchMap,
  takeUntil
} from 'rxjs/operators';

import {
  formatAmountCop,
  formatAmountShort
} from 'src/app/features/app/expense-records/models/expense-record.model';
import { CafeteriaDashboardService } from '../../services/cafeteria-dashboard.service';
import { CafeteriaDashboardData } from '../../models/cafeteria.model';

// ─── Estado de carga ──────────────────────────────────────────────────────────

interface DashboardStateLoading {
  status: 'loading';
  data: null;
  error: null;
}
interface DashboardStateLoaded {
  status: 'loaded';
  data: CafeteriaDashboardData;
  error: null;
}
interface DashboardStateError {
  status: 'error';
  data: null;
  error: string;
}

type DashboardState =
  | DashboardStateLoading
  | DashboardStateLoaded
  | DashboardStateError;

// ─── Modo de período ──────────────────────────────────────────────────────────

export type PeriodoModo = 'mensual' | 'trimestral';

// ─── Gauge geometry ───────────────────────────────────────────────────────────

interface GaugeGeometry {
  trackD: string;
  barD: string;
  color: string;
  grade: 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'CRÍTICO' | 'SIN DATOS';
  description: string;
  pctLabel: string;
  cx: number;
  cy: number;
  r: number;
  width: number;
  height: number;
  viewBox: string;
}

// ─── Card VM ─────────────────────────────────────────────────────────────────

export interface CafeteriaCardVM {
  label: string;
  color: string;
  value: number | null;
  deltaAbsCop: number | null;
  deltaPct: number | null;
  secondaryText: string;
}

// ─── Ranking VM ──────────────────────────────────────────────────────────────

export interface RankingItemVM {
  rank: number;
  buyer_id: string;
  buyer_name: string;
  buyer_type: 'client' | 'trainer';
  total_cop: number;
  unidades: number;
  avatarBg: string;
  avatarFg: string;
  initials: string;
  barWidthPct: number;
  barWidthPctUnidades: number;
}

// ─── Producto VM ─────────────────────────────────────────────────────────────

export interface ProductoRowVM {
  product_id: string;
  product_name: string;
  size_label: string;
  unidades_vendidas: number;
  ingresos_cop: number;
  costo_proporcional_cop: number;
  utilidad_cop: number;
  margen_pct: number | null;
  margenBadgeClass: string;
}

// ─── Combo activo VM ─────────────────────────────────────────────────────────

export interface ComboActivoVM {
  purchase_id: string;
  client_name: string;
  combo_name: string;
  product_name: string;
  units_consumed: number;
  units_remaining: number;
  total_units: number;
  purchase_date: string;
  progresoPct: number;
  barColor: string;
}

// ─── Venta pendiente VM ───────────────────────────────────────────────────────

export interface VentaPendienteVM {
  sale_id: string;
  sale_type: 'individual' | 'combo';
  buyer_name: string;
  product_name: string;
  monto_pendiente_cop: number;
  dias_transcurridos: number;
  diasColorClass: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MESES_COMPLETOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
];

const GAUGE_SIZE = 160;

/**
 * Paleta determinista para avatares. Cada entrada es [bg, fg].
 * Misma paleta que clientes-dashboard para consistencia visual.
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

@Component({
  selector: 'app-cafeteria-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  // ─── Estado del período ────────────────────────────────────────────────────

  readonly modo$ = new BehaviorSubject<PeriodoModo>('mensual');
  readonly periodoSeleccionado$ = new BehaviorSubject<{ inicio: Date; fin: Date }>(
    this.rangoMesActual(new Date())
  );

  // ─── Dashboard stream ──────────────────────────────────────────────────────

  readonly dashboardState$: Observable<DashboardState> = combineLatest([
    this.modo$,
    this.periodoSeleccionado$
  ]).pipe(
    switchMap(([_modo, periodo]) =>
      this.dashboardService
        .getDashboard(this.toIsoDate(periodo.inicio), this.toIsoDate(periodo.fin))
        .pipe(
          map((data): DashboardState => ({ status: 'loaded', data, error: null })),
          catchError((err): Observable<DashboardState> =>
            of({ status: 'error', data: null, error: (err as Error).message ?? 'Error al cargar dashboard.' })
          ),
          startWith<DashboardState>({ status: 'loading', data: null, error: null })
        )
    ),
    shareReplay(1)
  );

  // ─── Estado local ──────────────────────────────────────────────────────────

  rankingToggle: 'valor' | 'unidades' = 'valor';

  periodoLabel = '';
  isAtCurrentPeriod = true;

  constructor(
    private readonly dashboardService: CafeteriaDashboardService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    combineLatest([this.modo$, this.periodoSeleccionado$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([modo, periodo]) => {
        this.periodoLabel = this.buildPeriodoLabel(modo, periodo);
        this.isAtCurrentPeriod = this.isCurrentPeriod(modo, periodo);
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Navegación de período ────────────────────────────────────────────────

  navegarPeriodo(direction: -1 | 1): void {
    const modo = this.modo$.value;
    const { inicio, fin } = this.periodoSeleccionado$.value;

    if (modo === 'mensual') {
      const ref = new Date(inicio.getFullYear(), inicio.getMonth() + direction, 1);
      this.periodoSeleccionado$.next(this.rangoMesActual(ref));
    } else {
      const refMonth = inicio.getMonth() + direction * 3;
      const refYear = inicio.getFullYear() + Math.floor(refMonth / 12);
      const normalizedMonth = ((refMonth % 12) + 12) % 12;
      const ref = new Date(refYear, normalizedMonth + 2, 1);
      this.periodoSeleccionado$.next(this.rangoTrimestral(ref));
    }
    void fin;
  }

  cambiarModo(m: PeriodoModo): void {
    this.modo$.next(m);
    const now = new Date();
    if (m === 'mensual') {
      this.periodoSeleccionado$.next(this.rangoMesActual(now));
    } else {
      this.periodoSeleccionado$.next(this.rangoTrimestral(now));
    }
  }

  onRankingToggle(t: 'valor' | 'unidades'): void {
    this.rankingToggle = t;
    this.cdr.markForCheck();
  }

  onVerVentas(): void {
    this.router.navigate(['/app/cafeteria/ventas']);
  }

  retry(): void {
    const current = this.periodoSeleccionado$.value;
    this.periodoSeleccionado$.next({ ...current });
  }

  // ─── Gauge ────────────────────────────────────────────────────────────────

  buildGauge(margenPct: number | null): GaugeGeometry {
    if (margenPct === null) {
      return this.buildEmptyGauge();
    }

    const ratio = Math.min(Math.max(margenPct / 100, 0), 1);
    const pct = Math.round(margenPct);

    let color: string;
    let grade: GaugeGeometry['grade'];
    let description: string;

    if (pct >= 80) {
      color = '#10b981';
      grade = 'EXCELENTE';
      description = 'Margen excelente. La cafetería retiene la mayoría de sus ingresos.';
    } else if (pct >= 60) {
      color = '#f59e0b';
      grade = 'BUENO';
      description = 'Buen margen. Hay oportunidad de optimizar algunos costos.';
    } else if (pct >= 40) {
      color = '#f97316';
      grade = 'REGULAR';
      description = 'Margen ajustado. Revisar composición de costos.';
    } else {
      color = '#dc2626';
      grade = 'CRÍTICO';
      description = 'Margen crítico. Los costos consumen más del 60% de los ingresos.';
    }

    const size = GAUGE_SIZE;
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

  private buildEmptyGauge(): GaugeGeometry {
    const size = GAUGE_SIZE;
    const stroke = 12;
    const r = size / 2 - stroke - 8;
    const cx = size / 2;
    const cy = size / 2 + 4;
    const width = size;
    const height = size / 2 + 12;
    return {
      trackD: this.arcPath(cx, cy, r, Math.PI, Math.PI * 2),
      barD: '',
      color: '#e5e7eb',
      grade: 'SIN DATOS',
      description: 'Sin datos de margen para este período.',
      pctLabel: '—',
      cx,
      cy,
      r,
      width,
      height,
      viewBox: `0 0 ${width} ${height}`
    };
  }

  private arcPath(cx: number, cy: number, r: number, a1: number, a2: number): string {
    const safeA2 = a2 <= a1 ? a1 + 0.001 : a2;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(safeA2);
    const y2 = cy + r * Math.sin(safeA2);
    const large = safeA2 - a1 > Math.PI ? 1 : 0;
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  }

  // ─── Cards de indicadores ─────────────────────────────────────────────────

  buildCards(data: CafeteriaDashboardData): CafeteriaCardVM[] {
    const { resumen, ingresos_anteriores } = data;

    const ingresosActual = resumen.ingresos_cop;
    const ingresosAnterior = ingresos_anteriores.ingresos_cop;
    const ingresosDelta = ingresosActual - ingresosAnterior;
    const ingresosDeltaPct = ingresosAnterior !== 0
      ? (ingresosDelta / Math.abs(ingresosAnterior)) * 100
      : null;

    const unidadesActual = resumen.unidades_vendidas;
    const unidadesAnterior = ingresos_anteriores.unidades_vendidas;
    const unidadesDelta = unidadesActual - unidadesAnterior;
    const unidadesDeltaPct = unidadesAnterior !== 0
      ? (unidadesDelta / Math.abs(unidadesAnterior)) * 100
      : null;

    const totalTransacciones = resumen.ventas_count + resumen.combos_count;

    return [
      {
        label: 'INGRESOS',
        color: '#10b981',
        value: resumen.ingresos_cop,
        deltaAbsCop: ingresosDelta,
        deltaPct: ingresosDeltaPct,
        secondaryText: `${totalTransacciones} transacciones`
      },
      {
        label: 'COSTOS',
        color: '#dc2626',
        value: resumen.costos_cop,
        deltaAbsCop: null,
        deltaPct: null,
        secondaryText: 'Total de insumos'
      },
      {
        label: 'UNIDADES VENDIDAS',
        color: '#228d9f',
        value: resumen.unidades_vendidas,
        deltaAbsCop: unidadesDelta,
        deltaPct: unidadesDeltaPct,
        secondaryText: `${data.por_producto.length} producto${data.por_producto.length !== 1 ? 's' : ''} distintos`
      },
      {
        label: 'TICKET PROMEDIO',
        color: '#6366f1',
        value: resumen.ticket_promedio_cop,
        deltaAbsCop: null,
        deltaPct: null,
        secondaryText: 'Por transacción'
      }
    ];
  }

  // ─── Tabla de productos ───────────────────────────────────────────────────

  buildProductoRows(data: CafeteriaDashboardData): ProductoRowVM[] {
    return data.por_producto.map((p) => {
      const margenPct = p.ingresos_cop > 0
        ? (p.utilidad_cop / p.ingresos_cop) * 100
        : null;

      let margenBadgeClass = 'caf-badge--neutral';
      if (margenPct !== null) {
        if (margenPct >= 50) margenBadgeClass = 'caf-badge--success';
        else if (margenPct >= 30) margenBadgeClass = 'caf-badge--amber';
        else margenBadgeClass = 'caf-badge--danger';
      }

      return {
        product_id: p.product_id,
        product_name: p.product_name,
        size_label: p.size_label,
        unidades_vendidas: p.unidades_vendidas,
        ingresos_cop: p.ingresos_cop,
        costo_proporcional_cop: p.costo_proporcional_cop,
        utilidad_cop: p.utilidad_cop,
        margen_pct: margenPct,
        margenBadgeClass
      };
    });
  }

  // ─── Ranking de compradores ───────────────────────────────────────────────

  buildRanking(
    data: CafeteriaDashboardData,
    toggle: 'valor' | 'unidades'
  ): RankingItemVM[] {
    const items = [...data.ranking_compradores];

    if (toggle === 'valor') {
      items.sort((a, b) => b.total_cop - a.total_cop);
    } else {
      items.sort((a, b) => b.unidades - a.unidades);
    }

    const sliced = items.slice(0, 10);
    const maxValor = sliced.length > 0 ? sliced[0].total_cop : 1;
    const sortedByUnidades = [...sliced].sort((a, b) => b.unidades - a.unidades);
    const maxUnidades = sortedByUnidades.length > 0 ? sortedByUnidades[0].unidades : 1;

    return sliced.map((item, idx) => {
      const [avatarBg, avatarFg] = this.avatarColors(item.buyer_name);
      return {
        rank: idx + 1,
        buyer_id: item.buyer_id,
        buyer_name: item.buyer_name,
        buyer_type: item.buyer_type,
        total_cop: item.total_cop,
        unidades: item.unidades,
        avatarBg,
        avatarFg,
        initials: this.initials(item.buyer_name),
        barWidthPct: maxValor > 0 ? (item.total_cop / maxValor) * 100 : 0,
        barWidthPctUnidades: maxUnidades > 0 ? (item.unidades / maxUnidades) * 100 : 0
      };
    });
  }

  // ─── Combos activos ───────────────────────────────────────────────────────

  buildCombosActivos(data: CafeteriaDashboardData): ComboActivoVM[] {
    return data.combos_activos.map((c) => {
      const progresoPct = c.total_units > 0
        ? Math.min((c.units_consumed / c.total_units) * 100, 100)
        : 0;
      const isNearComplete = c.units_consumed >= c.total_units * 0.8;
      const barColor = isNearComplete ? '#10b981' : '#228d9f';

      return {
        purchase_id: c.purchase_id,
        client_name: c.client_name,
        combo_name: c.combo_name,
        product_name: c.product_name,
        units_consumed: c.units_consumed,
        units_remaining: c.units_remaining,
        total_units: c.total_units,
        purchase_date: c.purchase_date,
        progresoPct,
        barColor
      };
    });
  }

  // ─── Ventas pendientes ────────────────────────────────────────────────────

  buildVentasPendientes(data: CafeteriaDashboardData): VentaPendienteVM[] {
    return data.ventas_pendientes.map((v) => {
      const dias = Math.floor(v.dias_transcurridos);
      let diasColorClass = 'caf-dias--muted';
      if (dias > 30) diasColorClass = 'caf-dias--danger';
      else if (dias > 7) diasColorClass = 'caf-dias--amber';

      return {
        sale_id: v.sale_id,
        sale_type: v.sale_type,
        buyer_name: v.buyer_name,
        product_name: v.product_name,
        monto_pendiente_cop: v.monto_pendiente_cop,
        dias_transcurridos: dias,
        diasColorClass
      };
    });
  }

  // ─── Hero delta de ingresos ───────────────────────────────────────────────

  heroDelta(data: CafeteriaDashboardData): { delta: number; arrow: string; cssClass: string; text: string } {
    const delta = data.resumen.ingresos_cop - data.ingresos_anteriores.ingresos_cop;
    const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    const cssClass = delta > 0 ? 'fv2-pill--up' : delta < 0 ? 'fv2-pill--down' : 'fv2-pill--flat';
    const text = `${arrow} ${this.formatCop(Math.abs(delta))} en ingresos vs período anterior`;
    return { delta, arrow, cssClass, text };
  }

  heroNumberClass(utilidad: number): string {
    if (utilidad > 0) return 'caf-hero__number--positive';
    if (utilidad < 0) return 'caf-hero__number--negative';
    return 'caf-hero__number--neutral';
  }

  // ─── Card delta pill ──────────────────────────────────────────────────────

  cardDeltaClass(deltaAbsCop: number | null, deltaPct: number | null): string {
    if (deltaAbsCop === null || deltaPct === null) return 'fv2-pill--flat';
    if (deltaAbsCop > 0) return 'fv2-pill--up';
    if (deltaAbsCop < 0) return 'fv2-pill--down';
    return 'fv2-pill--flat';
  }

  cardDeltaText(deltaAbsCop: number | null, deltaPct: number | null): string {
    if (deltaAbsCop === null || deltaPct === null) return 'Sin cambio';
    const arrow = deltaAbsCop > 0 ? '↑' : deltaAbsCop < 0 ? '↓' : '→';
    const pctStr = Math.abs(deltaPct).toFixed(1);
    const copStr = this.formatShort(Math.abs(deltaAbsCop));
    return `${arrow} +${pctStr}% · ${copStr}`;
  }

  // ─── Formatters ───────────────────────────────────────────────────────────

  formatCop(amount: number): string {
    return formatAmountCop(amount);
  }

  formatShort(amount: number): string {
    return formatAmountShort(amount);
  }

  formatDateDmy(iso: string): string {
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [yyyy, mm, dd] = parts;
    return `${dd}/${mm}/${yyyy}`;
  }

  // ─── Subtítulo de sección 01 ──────────────────────────────────────────────

  seccion01Subtitle(modo: PeriodoModo, periodo: { inicio: Date; fin: Date }): string {
    const mesName = MESES_COMPLETOS[periodo.inicio.getMonth()];
    const year = periodo.inicio.getFullYear();
    if (modo === 'mensual') {
      return `Mensual: ${this.capitalize(mesName)} ${year}`;
    }
    const mesInicio = MESES_CORTOS[periodo.inicio.getMonth()];
    const mesFin = MESES_CORTOS[periodo.fin.getMonth()];
    return `Trimestral: ${this.capitalize(mesInicio)}–${this.capitalize(mesFin)} ${year}`;
  }

  // ─── Utilidad del valor del card (null-safe) ──────────────────────────────

  cardValueText(value: number | null): string {
    if (value === null) return '—';
    return formatAmountCop(value);
  }

  isCardValueNumber(value: number | null): boolean {
    return value !== null;
  }

  // ─── Período helpers ──────────────────────────────────────────────────────

  private rangoMesActual(ref: Date): { inicio: Date; fin: Date } {
    const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const fin = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return { inicio, fin };
  }

  private rangoTrimestral(ref: Date): { inicio: Date; fin: Date } {
    const endMonth = ref.getMonth();
    const endYear = ref.getFullYear();
    const fin = new Date(endYear, endMonth + 1, 0);
    const startMonth = endMonth - 2;
    const startYear = startMonth < 0 ? endYear - 1 : endYear;
    const normalizedStart = ((startMonth % 12) + 12) % 12;
    const inicio = new Date(startYear, normalizedStart, 1);
    return { inicio, fin };
  }

  private buildPeriodoLabel(modo: PeriodoModo, periodo: { inicio: Date; fin: Date }): string {
    const mesName = MESES_COMPLETOS[periodo.inicio.getMonth()];
    const year = periodo.inicio.getFullYear();
    if (modo === 'mensual') {
      return `${this.capitalize(mesName)} ${year}`;
    }
    const mesInicio = MESES_CORTOS[periodo.inicio.getMonth()];
    const mesFin = MESES_CORTOS[periodo.fin.getMonth()];
    return `${this.capitalize(mesInicio)}–${this.capitalize(mesFin)} ${year}`;
  }

  private isCurrentPeriod(modo: PeriodoModo, periodo: { inicio: Date; fin: Date }): boolean {
    const now = new Date();
    if (modo === 'mensual') {
      return (
        periodo.inicio.getFullYear() === now.getFullYear() &&
        periodo.inicio.getMonth() === now.getMonth()
      );
    }
    const nowRangoFin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return periodo.fin >= nowRangoFin;
  }

  private toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ─── Avatar helpers ───────────────────────────────────────────────────────

  private avatarColors(name: string): readonly [string, string] {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % AVATAR_PALETTE.length;
    return AVATAR_PALETTE[idx];
  }

  private initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ─── trackBy helpers ──────────────────────────────────────────────────────

  trackByProductId(_i: number, p: ProductoRowVM): string {
    return p.product_id;
  }

  trackByBuyerId(_i: number, r: RankingItemVM): string {
    return r.buyer_id;
  }

  trackByComboId(_i: number, c: ComboActivoVM): string {
    return c.purchase_id;
  }

  trackBySaleId(_i: number, v: VentaPendienteVM): string {
    return v.sale_id;
  }

  trackByModo(_i: number, m: PeriodoModo): PeriodoModo {
    return m;
  }

  trackByCardLabel = (_: number, c: CafeteriaCardVM): string => c.label;

  readonly modos: PeriodoModo[] = ['mensual', 'trimestral'];
  readonly modoLabels: Record<PeriodoModo, string> = {
    mensual: 'Mensual',
    trimestral: 'Trimestral'
  };
}
