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
  PeriodoModo,
  PeriodoSeleccionado
} from '../../models/estado-resultados.model';
import { FlujoCajaResponse } from '../../models/flujo-caja.model';
import { FlujoCajaService } from '../../services/flujo-caja.service';
import {
  drawPdfFooter,
  fitText,
  formatCOPAccounting,
  formatCOPForPdf,
  formatCOPMinusPrefix,
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
  data: FlujoCajaResponse;
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
  { modo: 'semestral',  label: 'Semestral' }
];

const COP_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

@Component({
  selector: 'app-flujo-caja',
  templateUrl: './flujo-caja.component.html',
  styleUrls: ['./flujo-caja.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlujoCajaComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly retry$ = new BehaviorSubject<void>(undefined);

  readonly modos: ModoOption[] = MODO_OPTIONS;

  readonly periodo$: Observable<PeriodoSeleccionado> = this.svc.periodoSeleccionado$;

  readonly state$: Observable<LoadState> = combineLatest([
    this.svc.periodoSeleccionado$,
    this.retry$
  ]).pipe(
    switchMap(([p]) =>
      this.svc.getFlujoConsolidado(p.fecha_inicio, p.fecha_fin).pipe(
        map((data): LoadState => ({ status: 'loaded', data, error: null })),
        catchError((err): Observable<LoadState> =>
          of({ status: 'error', data: null, error: err })
        ),
        startWith<LoadState>({ status: 'loading', data: null, error: null })
      )
    ),
    shareReplay(1)
  );

  protected periodoSnap: PeriodoSeleccionado = this.svc.currentPeriodo;

  // ─── Exportación a PDF ─────────────────────────────────────────────────────

  /** Última respuesta cargada — se cachea para usar al exportar PDF. */
  private currentData: FlujoCajaResponse | null = null;

  /** NIT cargado de app_config — null si no existe o no es accesible. */
  private nit: string | null = null;

  /** UI flag: true mientras se genera el PDF. */
  protected exportando = false;

  /** Banner de error transitorio al exportar. */
  protected exportError: string | null = null;

  constructor(
    private readonly svc: FlujoCajaService,
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
          console.warn('[FlujoCaja] No se pudo leer NIT de app_config:', error.message);
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

    setTimeout(() => {
      try {
        const doc = this.buildFlujoPDF(this.currentData!, this.periodoSnap, this.nit);
        doc.save(this.buildPdfFilename(this.periodoSnap));
      } catch (err) {
        console.error('[FlujoCaja] Error generando PDF:', err);
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

  private buildPdfFilename(periodo: PeriodoSeleccionado): string {
    return `WolfFitness_FlujoCaja_${slugifyLabel(periodo.label)}_${todayYmd()}.pdf`;
  }

  /**
   * Construye el PDF del Estado de Flujo de Caja con jsPDF.
   * Letter portrait, márgenes 20mm, escala de grises, Helvetica.
   */
  private buildFlujoPDF(
    data: FlujoCajaResponse,
    periodo: PeriodoSeleccionado,
    nit: string | null
  ): jsPDF {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M = 20;
    const xL = M;
    const xR = pageW - M;
    const contentW = xR - xL;

    let y = M;

    // ─── Encabezado ──────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
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
    doc.text('Estado de Flujo de Caja', xL, y);
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
    y += 8;

    // ─── Helpers de renderizado ──────────────────────────────────────────
    const checkPageBreak = (needed: number): void => {
      const limit = pageH - M - 22;
      if (y + needed > limit) {
        doc.addPage();
        y = M;
      }
    };

    const drawSaldoRow = (label: string, amountStr: string): void => {
      checkPageBreak(12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(0, 0, 0);
      doc.text(label, xL, y);
      doc.text(amountStr, xR, y, { align: 'right' });
      y += 4;
      // Separador doble debajo del saldo inicial.
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.7);
      doc.line(xL, y, xR, y);
      y += 10;
    };

    const drawSectionTitle = (title: string): void => {
      checkPageBreak(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(136, 136, 136);
      doc.text(title.toUpperCase(), xL, y);
      y += 5;
    };

    const drawSubheader = (text: string): void => {
      checkPageBreak(8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(136, 136, 136);
      doc.text('  ' + text.toUpperCase(), xL, y);
      y += 5;
    };

    const drawDetailRow = (name: string, amountStr: string, prefix?: string): void => {
      checkPageBreak(7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const label = prefix ? `${prefix} ${name}` : name;
      const safeName = fitText(doc, '  ' + sanitizeForPdf(label), contentW * 0.7);
      doc.text(safeName, xL, y);
      doc.text(amountStr, xR, y, { align: 'right' });
      y += 6;
    };

    const drawSubtotalRow = (name: string, amountStr: string): void => {
      checkPageBreak(10);
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.2);
      doc.line(xL, y - 2, xR, y - 2);
      y += 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text('  ' + name.toUpperCase(), xL, y);
      doc.text(amountStr, xR, y, { align: 'right' });
      y += 8;
    };

    const drawFlujoNeto = (label: string, amount: number): void => {
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

    // ─── SALDO INICIAL ──────────────────────────────────────────────────
    drawSaldoRow('SALDO INICIAL DE CAJA', formatCOPForPdf(data.saldo_inicial_cop));

    // ─── FLUJO OPERATIVO ────────────────────────────────────────────────
    drawSectionTitle('Flujo operativo');

    drawSubheader('Entradas');
    drawDetailRow(
      'Cobros por mensualidades',
      formatCOPForPdf(data.flujo_operativo.entradas.mensualidades_cop)
    );
    if (data.flujo_operativo.entradas.cafeteria_cop > 0) {
      drawDetailRow(
        'Cobros por cafetería',
        formatCOPForPdf(data.flujo_operativo.entradas.cafeteria_cop)
      );
    }
    drawSubtotalRow(
      'Total entradas',
      formatCOPForPdf(data.flujo_operativo.entradas.total_cop)
    );

    drawSubheader('Salidas');
    const sal = data.flujo_operativo.salidas;
    if (sal.costos_directos_cop > 0) {
      drawDetailRow('Costos directos', formatCOPMinusPrefix(sal.costos_directos_cop));
    }
    if (sal.gastos_administrativos_cop > 0) {
      drawDetailRow('Gastos administrativos', formatCOPMinusPrefix(sal.gastos_administrativos_cop));
    }
    if (sal.gastos_operativos_cop > 0) {
      drawDetailRow('Gastos operativos', formatCOPMinusPrefix(sal.gastos_operativos_cop));
    }
    // Nómina entrenadores: siempre visible aunque sea $0.
    drawDetailRow(
      'Nómina entrenadores',
      formatCOPMinusPrefix(sal.nomina_entrenadores_cop),
      '•'
    );
    if (sal.gastos_financieros_cop > 0) {
      drawDetailRow('Gastos financieros', formatCOPMinusPrefix(sal.gastos_financieros_cop));
    }
    if (sal.insumos_cafeteria_cop > 0) {
      drawDetailRow('Insumos cafetería', formatCOPMinusPrefix(sal.insumos_cafeteria_cop));
    }
    drawSubtotalRow('Total salidas', formatCOPMinusPrefix(sal.total_cop));

    drawFlujoNeto('FLUJO NETO OPERATIVO', data.flujo_operativo.flujo_neto_cop);

    // ─── FLUJO DE INVERSIÓN ─────────────────────────────────────────────
    if (data.flujo_inversion.tiene_datos) {
      drawSectionTitle('Flujo de inversión');
      drawDetailRow(
        'Inversiones y equipos',
        formatCOPMinusPrefix(data.flujo_inversion.inversiones_cop)
      );
      drawFlujoNeto('FLUJO NETO DE INVERSIÓN', data.flujo_inversion.flujo_neto_cop);
    }

    // ─── FLUJO DE FINANCIAMIENTO ────────────────────────────────────────
    if (data.flujo_financiamiento.tiene_datos) {
      drawSectionTitle('Flujo de financiamiento');
      const fin = data.flujo_financiamiento;
      if (fin.obligaciones_cop > 0) {
        drawDetailRow('Obligaciones financieras', formatCOPMinusPrefix(fin.obligaciones_cop));
      }
      if (fin.prestamos_otorgados_cop > 0) {
        drawDetailRow('Préstamos otorgados', formatCOPMinusPrefix(fin.prestamos_otorgados_cop));
      }
      if (fin.abonos_recibidos_cop > 0) {
        drawDetailRow('Abonos recibidos', formatCOPForPdf(fin.abonos_recibidos_cop));
      }
      drawFlujoNeto('FLUJO NETO DE FINANCIAMIENTO', fin.flujo_neto_cop);
    }

    // ─── BLOQUE FINAL: VARIACIÓN + SALDO FINAL ──────────────────────────
    checkPageBreak(36);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.8);
    doc.line(xL, y, xR, y);
    y += 7;

    // Variación neta.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('VARIACIÓN NETA DE CAJA', xL, y);
    doc.text(formatCOPAccounting(data.variacion_neta_cop), xR, y, { align: 'right' });
    y += 4;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(136, 136, 136);
    doc.text('(Flujo op. + Inv. + Financ.)', xL, y);
    y += 8;

    // Saldo final — el más prominente.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text('SALDO FINAL DE CAJA', xL, y);
    doc.text(formatCOPAccounting(data.saldo_final_cop), xR, y, { align: 'right' });
    y += 4;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.8);
    doc.line(xL, y, xR, y);
    y += 8;

    // ─── Footer en todas las páginas ─────────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      drawPdfFooter(doc, p, totalPages, pageW, pageH, M);
    }

    return doc;
  }

  // ─── Formato y helpers visuales ───────────────────────────────────────────

  formatCOP(amount: number): string {
    return COP_FORMATTER.format(amount);
  }

  /** Negativo con guión Unicode + paréntesis no, solo signo (consistente con P&G). */
  formatCOPSigned(amount: number): string {
    if (amount < 0) return '−' + COP_FORMATTER.format(Math.abs(amount));
    return COP_FORMATTER.format(amount);
  }

  /** Convierte ISO YYYY-MM-DD → DD/MM/YYYY. */
  formatDateDmy(iso: string): string {
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }

  /**
   * Clase para colorear un flujo neto (operativo/inversión/financiamiento)
   * o el saldo final. Reusa los modificadores del P&G.
   */
  flujoAmountClass(amount: number): string {
    if (amount > 0) return 'er-utilidad__amount--positive';
    if (amount < 0) return 'er-utilidad__amount--negative';
    return 'er-utilidad__amount--zero';
  }

  /** Alias semántico usado en el template para los flujos netos. */
  flujoNetoClass(amount: number): string {
    return this.flujoAmountClass(amount);
  }

  /** Alias semántico para el saldo final — misma lógica que `flujoAmountClass`. */
  saldoFinalClass(amount: number): string {
    return this.flujoAmountClass(amount);
  }

  /** Etiqueta dinámica del cierre. */
  saldoFinalLabel(amount: number): string {
    if (amount < 0) return 'SALDO FINAL (DÉFICIT)';
    return 'SALDO FINAL';
  }

  formatPct(value: number, base: number): string {
    if (!base) return '—';
    return ((value / base) * 100).toFixed(1) + '%';
  }

  /** true cuando el período no registró ningún movimiento. */
  isSinMovimientos(data: FlujoCajaResponse): boolean {
    return (
      data.flujo_operativo.entradas.total_cop === 0 &&
      data.flujo_operativo.salidas.total_cop === 0 &&
      !data.flujo_inversion.tiene_datos &&
      !data.flujo_financiamiento.tiene_datos
    );
  }

  // ─── trackBy ──────────────────────────────────────────────────────────────

  trackByModo(_i: number, m: ModoOption): PeriodoModo {
    return m.modo;
  }

  trackByIndex(i: number): number {
    return i;
  }
}
