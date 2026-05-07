import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy
} from '@angular/core';
import { ChartConfiguration, ChartData } from 'chart.js';
import { combineLatest, Observable, of, Subject } from 'rxjs';
import { catchError, map, shareReplay, startWith } from 'rxjs/operators';

import { EstadisticasService } from '../../../services/estadisticas.service';
import {
  ClientesActivosCards,
  ClientesQuincenalCards,
  DetalleResponse,
  EnRiesgoEntry,
  EntrenadorFilter,
  EntrenadorOption,
  PlanFilter,
  QuincenalTendenciaPoint,
  QuincenalTendenciaResponse,
  TendenciaResponse,
  VentanaQuincenal,
  VentanaTendencia
} from '../../../models/estadisticas.model';

/** Mes anterior abreviado en español (índice 0 = enero). */
const MESES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

/** Opciones disponibles de ventana temporal en el orden de las pills. */
const VENTANAS: VentanaTendencia[] = [1, 2, 6, 12];

/** Labels legibles para cada ventana temporal de tendencia. */
const VENTANA_LABELS: Record<VentanaTendencia, string> = {
  1:  'Mes anterior',
  2:  'Últimos 2 meses',
  6:  'Últimos 6 meses',
  12: 'Últimos 12 meses'
};

/** Opciones disponibles de ventana quincenal en el orden de las pills. */
const VENTANAS_QUINCENAL: VentanaQuincenal[] = [1, 2, 3, 6];

/** Labels legibles para cada ventana quincenal. */
const VENTANA_QUINCENAL_LABELS: Record<VentanaQuincenal, string> = {
  1: 'Mes anterior',
  2: 'Últimos 2 meses',
  3: 'Últimos 3 meses',
  6: 'Últimos 6 meses'
};

/** Opciones del toggle de plan para distribución. */
const PLANES: PlanFilter[] = ['todos', '6d', '3d'];

/** Labels legibles para el toggle de plan. */
const PLAN_LABELS: Record<PlanFilter, string> = {
  todos: 'Todos',
  '6d':  '6 días',
  '3d':  '3 días'
};

// ─── Colores de la gráfica de distribución ────────────────────────────────────

/** Q1: color primario de marca. */
const COLOR_Q1 = '#228d9f';
/** Q2: variante más clara (cyan-300). */
const COLOR_Q2 = '#67e8f9';

// ─── Colores de las series de la gráfica ──────────────────────────────────────
const COLOR_TOTAL  = '#228d9f'; // brand primary
const COLOR_PLAN6D = '#0f766e'; // teal-700
const COLOR_PLAN3D = '#67e8f9'; // cyan-300

// ─── Slices intermedios para combineLatest tipado ─────────────────────────────

interface CardsSlice {
  data: ClientesActivosCards | null;
  error: boolean;
}

interface QuincenalSlice {
  data: ClientesQuincenalCards | null;
  error: boolean;
}

/**
 * Estado unificado de la sección Resumen.
 * loading=true mientras cualquiera de las dos EFs esté pendiente.
 */
export interface ResumenState {
  loading: boolean;
  cards: ClientesActivosCards | null;
  quincenal: ClientesQuincenalCards | null;
  cardsError: boolean;
  quincenalError: boolean;
}

/** Estado de la sección Tendencia emitido por el observable. */
export interface TendenciaState {
  data: TendenciaResponse | null;
  error: boolean;
}

/** Estado de la sección Distribución emitido por el observable. */
export interface QuincenalTendenciaState {
  data: QuincenalTendenciaResponse | null;
  error: boolean;
}

/** Estado de la sección Detalle emitido por el observable. */
export interface DetalleState {
  data: DetalleResponse | null;
  error: boolean;
}

@Component({
  selector: 'app-clientes-dashboard',
  templateUrl: './clientes-dashboard.component.html',
  styleUrls: ['./clientes-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientesDashboardComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();

  // ─── Constantes expuestas al template ────────────────────────────────────────

  readonly ventanas              = VENTANAS;
  readonly ventanaLabels         = VENTANA_LABELS;
  readonly ventanasQuincenal     = VENTANAS_QUINCENAL;
  readonly ventanaQuincenalLabels = VENTANA_QUINCENAL_LABELS;
  readonly planes                = PLANES;
  readonly planLabels            = PLAN_LABELS;

  // ─── Estado local — filtro de plan (solo UI, no va al servicio) ──────────────

  planFilter: PlanFilter = 'todos';

  // ─── Streams ──────────────────────────────────────────────────────────────────

  /** Lista de entrenadores activos para el dropdown de filtro. */
  readonly entrenadores$: Observable<EntrenadorOption[]> = this.svc
    .getEntrenadores()
    .pipe(
      catchError(() => of([] as EntrenadorOption[])),
      shareReplay(1)
    );

  /** Entrenador seleccionado actualmente en el filtro global. */
  readonly selectedEntrenador$: Observable<EntrenadorFilter> =
    this.svc.selectedEntrenador$;

  /** Ventana temporal activa — proxy del servicio para los bindings del template. */
  readonly ventanaTendencia$: Observable<VentanaTendencia> =
    this.svc.ventanaTendencia$;

  /**
   * Estado unificado de la sección Resumen.
   * combineLatest espera a que ambas EFs emitan al menos una vez.
   * startWith garantiza el estado loading=true en el primer render.
   * shareReplay(1) evita suscripciones duplicadas del async pipe.
   */
  readonly resumen$: Observable<ResumenState> = combineLatest([
    this.svc.getClientesActivosCards().pipe(
      map((data): CardsSlice => ({ data, error: false })),
      catchError((): Observable<CardsSlice> => of({ data: null, error: true }))
    ),
    this.svc.getQuincenalCards().pipe(
      map((data): QuincenalSlice => ({ data, error: false })),
      catchError((): Observable<QuincenalSlice> => of({ data: null, error: true }))
    )
  ]).pipe(
    map(([c, q]): ResumenState => ({
      loading: false,
      cards: c.data,
      quincenal: q.data,
      cardsError: c.error,
      quincenalError: q.error
    })),
    startWith<ResumenState>({
      loading: true,
      cards: null,
      quincenal: null,
      cardsError: false,
      quincenalError: false
    }),
    shareReplay(1)
  );

  /**
   * Estado de la sección Tendencia.
   * Reacciona a cambios de entrenador y de ventana temporal.
   * No emite startWith — el template usa *ngIf con el patrón "as tstate":
   * mientras no haya emitido, se muestra el skeleton.
   */
  readonly tendencia$: Observable<TendenciaState> = this.svc.getTendencia().pipe(
    map((data): TendenciaState => ({ data, error: false })),
    catchError((): Observable<TendenciaState> => of({ data: null, error: true })),
    shareReplay(1)
  );

  /** Ventana quincenal activa — proxy del servicio para los bindings del template. */
  readonly ventanaQuincenal$: Observable<VentanaQuincenal> =
    this.svc.ventanaQuincenal$;

  /**
   * Estado de la sección Distribución.
   * Reacciona a cambios de entrenador y de ventana quincenal.
   * No emite startWith — mientras no haya emitido se muestra el skeleton.
   * shareReplay(1) evita suscripciones duplicadas del async pipe.
   */
  readonly quincenalTendencia$: Observable<QuincenalTendenciaState> =
    this.svc.getQuincenalTendencia().pipe(
      map((data): QuincenalTendenciaState => ({ data, error: false })),
      catchError((): Observable<QuincenalTendenciaState> => of({ data: null, error: true })),
      shareReplay(1)
    );

  /**
   * Estado de la sección Detalle (cards de cohorte + tabla en riesgo).
   * Reacciona solo a cambios de entrenador seleccionado.
   * No emite startWith — mientras no haya emitido se muestra el skeleton.
   * shareReplay(1) evita suscripciones duplicadas del async pipe.
   */
  readonly detalle$: Observable<DetalleState> =
    this.svc.getDetalle().pipe(
      map((data): DetalleState => ({ data, error: false })),
      catchError((): Observable<DetalleState> => of({ data: null, error: true })),
      shareReplay(1)
    );

  // ─── Labels de delta (calculados una sola vez en el constructor) ──────────────

  /** "vs 1-X mmm" — usado por Tipo A, Tipo B, Total activos y Perdidos. */
  readonly deltaLabelMonth: string;
  /** "vs 1-15 mmm" — Q1 completa (hoy >= 16). */
  readonly deltaLabelQ1Completa: string;
  /** "vs 1-{min(día,15)} mmm" — Q1 parcial (hoy <= 15). */
  readonly deltaLabelQ1Parcial: string;
  /** "vs 16-{día_clamped} mmm" — Q2 activo (hoy >= 16). */
  readonly deltaLabelQ2: string;
  /** Fecha de hoy en formato dd/mm/yyyy. */
  readonly todayFormatted: string;

  constructor(
    private readonly svc: EstadisticasService,
    private readonly cdr: ChangeDetectorRef
  ) {
    const today = new Date();
    this.deltaLabelMonth      = this.buildDeltaLabelMonth(today);
    this.deltaLabelQ1Completa = this.buildDeltaLabelQ1Completa(today);
    this.deltaLabelQ1Parcial  = this.buildDeltaLabelQ1Parcial(today);
    this.deltaLabelQ2         = this.buildDeltaLabelQ2(today);
    this.todayFormatted       = this.buildTodayFormatted(today);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Handlers ────────────────────────────────────────────────────────────────

  onEntrenadorChange(value: EntrenadorFilter): void {
    this.svc.setEntrenador(value);
  }

  onVentanaChange(n: VentanaTendencia): void {
    this.svc.setVentanaTendencia(n);
  }

  onVentanaQuincenalChange(n: VentanaQuincenal): void {
    this.svc.setVentanaQuincenal(n);
  }

  /**
   * Cambia el filtro de plan para la gráfica de distribución.
   * Es estado local: no va al servicio.  markForCheck() garantiza que
   * OnPush detecte el cambio y re-evalúe buildQuincenalChartData() en el template.
   */
  setPlanFilter(p: PlanFilter): void {
    this.planFilter = p;
    this.cdr.markForCheck();
  }

  // ─── Gráfica — datos y opciones ──────────────────────────────────────────────

  /**
   * Convierte la respuesta de la EF en el objeto `data` de Chart.js.
   * Colores con opacidad reducida en el mes actual (es_mes_actual = true)
   * para indicar visualmente que el período está en curso.
   */
  buildChartData(puntos: TendenciaResponse): ChartData<'bar'> {
    const labels = puntos.map(p => p.es_mes_actual ? `${p.label} *` : p.label);

    const bgTotal  = puntos.map(p => p.es_mes_actual ? this.withAlpha(COLOR_TOTAL,  0.65) : COLOR_TOTAL);
    const bg6d     = puntos.map(p => p.es_mes_actual ? this.withAlpha(COLOR_PLAN6D, 0.65) : COLOR_PLAN6D);
    const bg3d     = puntos.map(p => p.es_mes_actual ? this.withAlpha(COLOR_PLAN3D, 0.65) : COLOR_PLAN3D);

    return {
      labels,
      datasets: [
        { label: 'Total',   data: puntos.map(p => p.total),   backgroundColor: bgTotal },
        { label: 'Plan 6d', data: puntos.map(p => p.plan_6d), backgroundColor: bg6d   },
        { label: 'Plan 3d', data: puntos.map(p => p.plan_3d), backgroundColor: bg3d   }
      ]
    };
  }

  /** Opciones estáticas de Chart.js para la barra agrupada. */
  readonly chartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: { mode: 'index', intersect: false }
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        ticks: { precision: 0, stepSize: 1 }
      }
    }
  };

  /**
   * Construye el ChartData para la gráfica de distribución quincenal.
   *
   * Cada QuincenalTendenciaPoint genera dos entradas en el eje X:
   *   "{label} Q1" y "{label} Q2"
   *
   * Una sola serie (single dataset).  El valor depende del planFilter:
   *   'todos' → q1_total / q2_total
   *   '6d'    → q1_plan_6d / q2_plan_6d
   *   '3d'    → q1_plan_3d / q2_plan_3d
   *
   * Color por barra (callback): Q1 → COLOR_Q1, Q2 → COLOR_Q2.
   * Opacidad reducida (0.6) si la quincena es 'parcial'.
   * Q2 'no_iniciada' → valor null (Chart.js omite la barra).
   *
   * Función pura — no tiene efectos laterales.  El template la llama
   * directamente; markForCheck() en setPlanFilter() garantiza el re-render.
   */
  buildQuincenalChartData(
    puntos: QuincenalTendenciaResponse,
    plan: PlanFilter
  ): ChartData<'bar'> {
    const labels: string[] = [];
    const values: (number | null)[] = [];
    const bgColors: string[] = [];

    for (const p of puntos) {
      // ── Q1 ──
      labels.push(`${p.label} Q1`);
      const q1Val = plan === '6d' ? p.q1_plan_6d
                  : plan === '3d' ? p.q1_plan_3d
                  : p.q1_total;
      values.push(q1Val);
      bgColors.push(
        p.q1_estado === 'parcial'
          ? this.withAlpha(COLOR_Q1, 0.6)
          : COLOR_Q1
      );

      // ── Q2 ──
      labels.push(`${p.label} Q2`);
      if (p.q2_estado === 'no_iniciada') {
        // Chart.js salta barras con valor null
        values.push(null);
        bgColors.push(COLOR_Q2);
      } else {
        const q2Val = plan === '6d' ? p.q2_plan_6d
                    : plan === '3d' ? p.q2_plan_3d
                    : p.q2_total;
        values.push(q2Val);
        bgColors.push(
          p.q2_estado === 'parcial'
            ? this.withAlpha(COLOR_Q2, 0.6)
            : COLOR_Q2
        );
      }
    }

    return {
      labels,
      datasets: [
        {
          label: 'Clientes',
          data: values,
          backgroundColor: bgColors
        }
      ]
    };
  }

  /** Opciones estáticas de Chart.js para la gráfica de distribución quincenal. */
  readonly chartOptionsQuincenal: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => items[0]?.label ?? '',
          label: (item) => {
            const value = item.raw as number | null;
            return value === null ? 'Sin datos' : `Clientes: ${value}`;
          },
          afterLabel: (item) => {
            // Recuperamos el estado de la quincena desde el dataset index.
            // El índice del punto es par → Q1, impar → Q2.
            const idx   = item.dataIndex;
            const punto = this._lastQuincenalPuntos[Math.floor(idx / 2)];
            if (!punto) return '';
            const estado = idx % 2 === 0 ? punto.q1_estado : punto.q2_estado;
            if (estado === 'parcial')     return 'En curso';
            if (estado === 'no_iniciada') return 'No iniciada';
            return '';
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        ticks: { precision: 0, stepSize: 1 }
      }
    }
  };

  /**
   * Referencia al último array de puntos recibido.
   * Usada exclusivamente por el callback afterLabel del tooltip para acceder
   * al estado de cada quincena sin clausuras problemáticas.
   * Se actualiza en quincenalMinWidth() — primer helper llamado en el template
   * una vez que los datos están disponibles.
   */
  private _lastQuincenalPuntos: QuincenalTendenciaResponse = [];

  // ─── Helpers de estado ────────────────────────────────────────────────────────

  /**
   * Devuelve true cuando hay menos de 2 meses con al menos un cliente.
   * En ese caso no tiene sentido mostrar la gráfica de tendencia.
   */
  hasInsufficientData(puntos: TendenciaResponse): boolean {
    return puntos.filter(p => p.total > 0).length < 2;
  }

  /** Devuelve true si algún punto de la serie corresponde al mes en curso. */
  hasMesActual(puntos: TendenciaResponse): boolean {
    return puntos.some(p => p.es_mes_actual);
  }

  /**
   * Devuelve true cuando todos los valores a mostrar son 0 o null.
   * Se usa para el estado vacío de la sección Distribución.
   */
  hasNoQuincenalData(puntos: QuincenalTendenciaResponse): boolean {
    return puntos.every(p =>
      p.q1_total === 0 && p.q2_total === 0 && p.q2_estado === 'no_iniciada'
    );
  }

  /** Devuelve true si hay alguna quincena parcial (para mostrar el footnote). */
  hasParcialBars(puntos: QuincenalTendenciaResponse): boolean {
    return puntos.some(p => p.q1_estado === 'parcial' || p.q2_estado === 'parcial');
  }

  /**
   * Calcula el min-width del contenedor del canvas para que cada par de barras
   * tenga espacio suficiente en mobile (64px por barra × total de barras).
   * Actualiza también _lastQuincenalPuntos para el tooltip callback.
   */
  quincenalMinWidth(puntos: QuincenalTendenciaResponse): string {
    this._lastQuincenalPuntos = puntos;
    const totalBars = puntos.length * 2;
    const computed  = totalBars * 64;
    return computed > 0 ? `max(100%, ${computed}px)` : '100%';
  }

  // ─── TrackBy ─────────────────────────────────────────────────────────────────

  trackById(_index: number, option: EntrenadorOption): string {
    return option.id;
  }

  trackByIndex(index: number, _item: unknown): number {
    return index;
  }

  trackByVentana(_i: number, v: VentanaTendencia): VentanaTendencia {
    return v;
  }

  trackByVentanaQ(_i: number, v: VentanaQuincenal): VentanaQuincenal {
    return v;
  }

  trackByPlan(_i: number, p: PlanFilter): PlanFilter {
    return p;
  }

  trackByClienteId(_i: number, e: EnRiesgoEntry): string {
    return e.cliente_id;
  }

  /**
   * Clase CSS del chip de delta para la card "Perdidos este mes".
   * Lógica INVERSA: más perdidos (delta > 0) = peor = rojo.
   */
  perdidosDeltaClass(delta: number): string {
    if (delta > 0) return 'stats-card__delta--up-bad';
    if (delta < 0) return 'stats-card__delta--down-good';
    return 'stats-card__delta--zero';
  }

  // ─── Helpers de la sección Detalle ───────────────────────────────────────────

  /**
   * Devuelve la clase semántica de color para el porcentaje de retención.
   * Verde ≥70 %, ámbar 50–69 %, rojo <50 %, gris cuando tasa es null.
   */
  retencionColor(tasa: number | null): 'verde' | 'ambar' | 'rojo' | 'gris' {
    if (tasa === null) return 'gris';
    if (tasa >= 70)   return 'verde';
    if (tasa >= 50)   return 'ambar';
    return 'rojo';
  }

  /** Convierte la abreviación de plan a etiqueta legible. */
  planLabel(p: '6d' | '3d'): string {
    return p === '6d' ? '6 días' : '3 días';
  }

  /**
   * Formatea una fecha ISO "YYYY-MM-DD" a "dd/MM/yyyy".
   * Operación puramente de string — no depende de Date ni de locale.
   */
  formatDateDmy(iso: string): string {
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [yyyy, mm, dd] = parts;
    return `${dd}/${mm}/${yyyy}`;
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────────

  /**
   * Convierte un color hex a rgba con el alpha dado.
   * Usado para reducir opacidad en las barras del mes actual.
   */
  private withAlpha(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private buildDeltaLabelMonth(today: Date): string {
    const dayToday = today.getDate();
    const monthIndex = today.getMonth();
    const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
    const prevMonthYear  = monthIndex === 0 ? today.getFullYear() - 1 : today.getFullYear();
    const lastDayOfPrevMonth = new Date(prevMonthYear, prevMonthIndex + 1, 0).getDate();
    const clampedDay = Math.min(dayToday, lastDayOfPrevMonth);
    return `vs 1-${clampedDay} ${MESES_ABREV[prevMonthIndex]}`;
  }

  private buildDeltaLabelQ1Completa(today: Date): string {
    const monthIndex = today.getMonth();
    const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
    return `vs 1-15 ${MESES_ABREV[prevMonthIndex]}`;
  }

  private buildDeltaLabelQ1Parcial(today: Date): string {
    const dayToday = today.getDate();
    const monthIndex = today.getMonth();
    const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
    const clampedDay = Math.min(dayToday, 15);
    return `vs 1-${clampedDay} ${MESES_ABREV[prevMonthIndex]}`;
  }

  private buildDeltaLabelQ2(today: Date): string {
    const dayToday = today.getDate();
    const monthIndex = today.getMonth();
    const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
    const prevMonthYear  = monthIndex === 0 ? today.getFullYear() - 1 : today.getFullYear();
    const lastDayOfPrevMonth = new Date(prevMonthYear, prevMonthIndex + 1, 0).getDate();
    const clampedDay = Math.max(16, Math.min(dayToday, lastDayOfPrevMonth));
    return `vs 16-${clampedDay} ${MESES_ABREV[prevMonthIndex]}`;
  }

  private buildTodayFormatted(today: Date): string {
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  }
}
