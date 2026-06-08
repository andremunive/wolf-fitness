import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
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

import { jsPDF } from 'jspdf';

import { SupabaseService } from 'src/app/core/services/supabase.service';

import {
  EstadoResultadosResponse,
  PeriodoModo,
  PeriodoSeleccionado
} from '../../models/estado-resultados.model';
import { EstadoResultadosService } from '../../services/estado-resultados.service';
import {
  drawPdfFooter,
  fitText,
  formatCOPAccounting,
  nowDmyHm,
  sanitizeForPdf,
  slugifyLabel,
  todayYmd
} from '../../shared/pdf-helpers';

// ─── Estado de carga ──────────────────────────────────────────────────────────

interface LoadStateLoading {
  status: 'loading';
  data: null;
  error: null;
}

interface LoadStateLoaded {
  status: 'loaded';
  data: EstadoResultadosResponse;
  error: null;
}

interface LoadStateError {
  status: 'error';
  data: null;
  error: unknown;
}

export type LoadState = LoadStateLoading | LoadStateLoaded | LoadStateError;

// ─── Selector de modo ────────────────────────────────────────────────────────

interface ModoOption {
  modo: PeriodoModo;
  label: string;
}

const MODO_OPTIONS: ModoOption[] = [
  { modo: 'mensual',    label: 'Mensual' },
  { modo: 'trimestral', label: 'Trimestral' },
  { modo: 'semestral', label: 'Semestral' }
];

const COP_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

@Component({
  selector: 'app-estado-resultados',
  templateUrl: './estado-resultados.component.html',
  styleUrls: ['./estado-resultados.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EstadoResultadosComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly retry$ = new BehaviorSubject<void>(undefined);

  readonly modos: ModoOption[] = MODO_OPTIONS;

  readonly periodo$: Observable<PeriodoSeleccionado> = this.svc.periodoSeleccionado$;

  readonly state$: Observable<LoadState> = combineLatest([
    this.svc.periodoSeleccionado$,
    this.retry$
  ]).pipe(
    switchMap(([p]) =>
      this.svc.getEstadoResultados(p.fecha_inicio, p.fecha_fin).pipe(
        map((data): LoadState => ({ status: 'loaded', data, error: null })),
        catchError((err): Observable<LoadState> =>
          of({ status: 'error', data: null, error: err })
        ),
        startWith<LoadState>({ status: 'loading', data: null, error: null })
      )
    ),
    shareReplay(1)
  );

  // Snapshot para el template (subtítulo + estado de botones).
  protected periodoSnap: PeriodoSeleccionado = this.svc.currentPeriodo;

  // ─── Exportación a PDF ─────────────────────────────────────────────────────

  /** Última respuesta cargada — se cachea para usar al exportar PDF. */
  private currentData: EstadoResultadosResponse | null = null;

  /** NIT cargado de app_config — null si no existe o no es accesible. */
  private nit: string | null = null;

  /** UI flag: true mientras se genera el PDF. */
  protected exportando = false;

  /** Banner de error transitorio al exportar. */
  protected exportError: string | null = null;

  constructor(
    private readonly svc: EstadoResultadosService,
    private readonly supabase: SupabaseService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.svc.periodoSeleccionado$.pipe(takeUntil(this.destroy$)).subscribe((p) => {
      this.periodoSnap = p;
      this.cdr.markForCheck();
    });

    // Cachear la última respuesta cargada para el export.
    this.state$.pipe(takeUntil(this.destroy$)).subscribe((s) => {
      if (s.status === 'loaded') {
        this.currentData = s.data;
      }
    });

    // Cargar NIT de app_config (silencioso si no existe).
    this.loadNit();
  }

  private loadNit(): void {
    this.supabase.client
      .from('app_config')
      .select('value')
      .eq('key', 'nit')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.warn('[EstadoResultados] No se pudo leer NIT de app_config:', error.message);
          return;
        }
        this.nit = (data?.value as string | undefined) ?? null;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Handlers ──────────────────────────────────────────────────────────────

  onCambiarModo(modo: PeriodoModo): void {
    this.svc.setModo(modo);
  }

  onPeriodoAnterior(): void {
    this.svc.navegarPeriodo(-1);
  }

  onPeriodoSiguiente(): void {
    if (this.periodoSnap.es_actual) return;
    this.svc.navegarPeriodo(1);
  }

  onRetry(): void {
    this.retry$.next();
  }

  onExportarPdf(): void {
    if (this.exportando) return;
    if (!this.currentData) {
      this.exportError = 'Espera a que cargue el documento antes de exportar.';
      this.cdr.markForCheck();
      return;
    }

    this.exportando = true;
    this.exportError = null;
    this.cdr.markForCheck();

    // Pequeño delay para que el spinner sea visible incluso en docs pequeños.
    setTimeout(() => {
      try {
        const doc = this.buildPDF(this.currentData!, this.periodoSnap, this.nit);
        doc.save(this.buildPdfFilename(this.periodoSnap));
      } catch (err) {
        console.error('[EstadoResultados] Error generando PDF:', err);
        this.exportError = 'No se pudo generar el PDF. Intenta de nuevo.';
      } finally {
        this.exportando = false;
        this.cdr.markForCheck();
      }
    }, 80);
  }

  dismissExportError(): void {
    this.exportError = null;
    this.cdr.markForCheck();
  }

  // ─── PDF Builder ──────────────────────────────────────────────────────────

  /**
   * Construye el archivo PDF programáticamente con jsPDF.
   * Letter portrait, márgenes 20mm, escala de grises, Helvetica.
   */
  private buildPDF(
    data: EstadoResultadosResponse,
    periodo: PeriodoSeleccionado,
    nit: string | null
  ): jsPDF {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M = 20;             // margen
    const xL = M;             // x izquierda
    const xR = pageW - M;     // x derecha
    const contentW = xR - xL;

    let y = M;

    // ─── Encabezado ──────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    // letter-spacing programático: separar letras con un espacio fino.
    doc.text('W O L F   F I T N E S S', xL, y);
    y += 5;

    if (nit) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(85, 85, 85);
      doc.text(`NIT: ${nit}`, xL, y);
      y += 5;
    }

    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text('Estado de Resultados', xL, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(85, 85, 85);
    doc.text(`Período: ${sanitizeForPdf(periodo.label)}`, xL, y);
    y += 5;

    doc.setFontSize(9);
    doc.setTextColor(136, 136, 136);
    doc.text(`Generado el: ${nowDmyHm()}`, xL, y);
    y += 4;

    if (data.periodo.es_parcial) {
      doc.text(
        `Período en curso · datos hasta ${this.formatDateDmy(data.periodo.fecha_corte)}`,
        xL,
        y
      );
      y += 4;
    }

    y += 3;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(xL, y, xR, y);
    y += 6;

    // ─── Sin movimientos ────────────────────────────────────────────────
    if (this.isSinMovimientos(data)) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(11);
      doc.setTextColor(120, 120, 120);
      doc.text('Sin movimientos registrados en este período.', pageW / 2, y + 10, {
        align: 'center'
      });
      drawPdfFooter(doc, 1, 1, pageW, pageH, M);
      return doc;
    }

    // ─── Helpers de renderizado de secciones ────────────────────────────
    const checkPageBreak = (needed: number): void => {
      const limit = pageH - M - 22; // reservar espacio para footer
      if (y + needed > limit) {
        doc.addPage();
        y = M;
      }
    };

    const drawSectionTitle = (title: string): void => {
      checkPageBreak(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(136, 136, 136);
      doc.text(title.toUpperCase(), xL, y);
      y += 5;
    };

    const drawDetailRow = (name: string, amount: string, prefix?: string): void => {
      checkPageBreak(7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const label = prefix ? `${prefix} ${name}` : name;
      // Truncar nombre largo para no chocar contra el monto.
      const maxNameW = contentW * 0.7;
      const safeName = fitText(doc, sanitizeForPdf(label), maxNameW);
      doc.text(safeName, xL, y);
      doc.text(amount, xR, y, { align: 'right' });
      y += 6;
    };

    const drawTotalRow = (name: string, amount: string): void => {
      checkPageBreak(10);
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.2);
      doc.line(xL, y - 2, xR, y - 2);
      y += 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(0, 0, 0);
      doc.text(name.toUpperCase(), xL, y);
      doc.text(amount, xR, y, { align: 'right' });
      y += 8;
    };

    const drawUtilidad = (label: string, amount: number): void => {
      // El bloque de utilidad operativa NUNCA debe cortarse.
      checkPageBreak(20);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.8);
      doc.line(xL, y - 1, xR, y - 1);
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(label, xL, y);
      doc.text(formatCOPAccounting(amount), xR, y, { align: 'right' });
      y += 4;
      doc.line(xL, y, xR, y);
      y += 8;
    };

    // ─── SECCIÓN 1: INGRESOS ────────────────────────────────────────────
    drawSectionTitle('Ingresos');
    drawDetailRow('Ingresos por mensualidades', this.formatCOP(data.ingresos.mensualidades_cop));
    drawTotalRow('Total ingresos', this.formatCOP(data.ingresos.total_cop));

    // ─── SECCIÓN 2: COSTOS DIRECTOS ─────────────────────────────────────
    drawSectionTitle('Costos directos');
    if (data.costos_directos.lineas.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(136, 136, 136);
      doc.text('Sin costos directos en este período.', xL, y);
      y += 6;
    } else {
      for (const linea of data.costos_directos.lineas) {
        drawDetailRow(linea.categoria, this.formatCOP(linea.total_cop));
      }
    }
    drawTotalRow('Total costos directos', this.formatCOP(data.costos_directos.total_cop));

    // ─── BLOQUE: UTILIDAD BRUTA ─────────────────────────────────────────
    drawUtilidad('UTILIDAD BRUTA', data.utilidad_bruta_cop);

    // ─── SECCIÓN 3: GASTOS ADMINISTRATIVOS ──────────────────────────────
    drawSectionTitle('Gastos administrativos');
    if (data.gastos_administrativos.lineas.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(136, 136, 136);
      doc.text('Sin gastos administrativos en este período.', xL, y);
      y += 6;
    } else {
      for (const linea of data.gastos_administrativos.lineas) {
        drawDetailRow(linea.categoria, this.formatCOP(linea.total_cop));
      }
    }
    drawTotalRow('Total gastos administrativos', this.formatCOP(data.gastos_administrativos.total_cop));

    // ─── SECCIÓN 4: GASTOS OPERATIVOS ───────────────────────────────────
    drawSectionTitle('Gastos operativos');
    for (const linea of data.gastos_operativos.lineas) {
      if (linea.es_nomina_entrenadores) {
        drawDetailRow(linea.categoria, this.formatCOP(linea.total_cop), '•'); // bullet •
      } else if (linea.total_cop > 0) {
        drawDetailRow(linea.categoria, this.formatCOP(linea.total_cop));
      }
    }
    drawTotalRow('Total gastos operativos', this.formatCOP(data.gastos_operativos.total_cop));

    // ─── BLOQUE: UTILIDAD / PÉRDIDA OPERATIVA ───────────────────────────
    drawUtilidad(
      this.utilidadOperativaLabel(data.utilidad_operativa_cop),
      data.utilidad_operativa_cop
    );

    // ─── SECCIÓN 5: GASTOS FINANCIEROS ──────────────────────────────────
    drawSectionTitle('Gastos financieros');
    if (data.gastos_financieros.lineas.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(136, 136, 136);
      doc.text('Sin gastos financieros en este período.', xL, y);
      y += 6;
    } else {
      for (const linea of data.gastos_financieros.lineas) {
        drawDetailRow(linea.categoria, this.formatCOP(linea.total_cop));
      }
    }
    drawTotalRow('Total gastos financieros', this.formatCOP(data.gastos_financieros.total_cop));

    // ─── BLOQUE FINAL: RESULTADO DEL PERÍODO ────────────────────────────
    drawUtilidad(
      this.resultadoPeriodoLabel(data.resultado_periodo_cop),
      data.resultado_periodo_cop
    );

    // ─── Footer en todas las páginas ────────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      drawPdfFooter(doc, p, totalPages, pageW, pageH, M);
    }

    return doc;
  }

  /** Nombre de archivo PDF: "WolfFitness_EstadoResultados_<periodo>_<YYYYMMDD>.pdf". */
  private buildPdfFilename(periodo: PeriodoSeleccionado): string {
    return `WolfFitness_EstadoResultados_${slugifyLabel(periodo.label)}_${todayYmd()}.pdf`;
  }

  // ─── Formato y helpers visuales ───────────────────────────────────────────

  formatCOP(amount: number): string {
    return COP_FORMATTER.format(amount);
  }

  /**
   * Variante con signo explícito anterior al símbolo de moneda.
   * Para utilidades/pérdidas: "−$13.000.000" en vez de "$-13.000.000".
   */
  formatCOPSigned(amount: number): string {
    if (amount < 0) {
      return '−' + COP_FORMATTER.format(Math.abs(amount));
    }
    return COP_FORMATTER.format(amount);
  }

  /** Etiqueta del bloque intermedio según el signo de la utilidad operativa. */
  utilidadOperativaLabel(amount: number): string {
    if (amount > 0) return 'UTILIDAD OPERATIVA';
    if (amount < 0) return 'PÉRDIDA OPERATIVA';
    return 'RESULTADO OPERATIVO';
  }

  /** Etiqueta del bloque final (resultado del período tras gastos financieros). */
  resultadoPeriodoLabel(amount: number): string {
    if (amount > 0) return 'RESULTADO DEL PERÍODO';
    if (amount < 0) return 'PÉRDIDA DEL PERÍODO';
    return 'RESULTADO DEL PERÍODO';
  }

  /** true cuando el período no registró ningún movimiento financiero. */
  isSinMovimientos(data: EstadoResultadosResponse): boolean {
    return (
      data.ingresos.total_cop === 0 &&
      data.costos_directos.total_cop === 0 &&
      data.gastos_administrativos.total_cop === 0 &&
      data.gastos_operativos.total_cop === 0 &&
      data.gastos_financieros.total_cop === 0
    );
  }

  /** Convierte ISO YYYY-MM-DD → DD/MM/YYYY para el chip "datos hasta …". */
  formatDateDmy(iso: string): string {
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }

  /**
   * Clase para colorear el monto de utilidad (bruta u operativa).
   * > 0 → success, < 0 → danger, = 0 → muted.
   */
  utilidadAmountClass(amount: number): string {
    if (amount > 0) return 'er-utilidad__amount--positive';
    if (amount < 0) return 'er-utilidad__amount--negative';
    return 'er-utilidad__amount--zero';
  }

  // ─── trackBy ──────────────────────────────────────────────────────────────

  trackByModo(_i: number, m: ModoOption): PeriodoModo {
    return m.modo;
  }

  trackByLineaCategoria(_i: number, linea: { categoria: string }): string {
    return linea.categoria;
  }

  trackByIndex(i: number): number {
    return i;
  }
}
