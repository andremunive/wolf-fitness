import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { formatAmountCop } from 'src/app/features/app/expense-records/models/expense-record.model';

import { EstadisticasService } from '../../../services/estadisticas.service';
import {
  CarteraCohortKey,
  CarteraDetalleResponse,
  CarteraEntrenadorRow,
  CarteraClienteRow
} from '../../../models/estadisticas.model';
import { MESES_CORTOS } from '../../../models/estadisticas-constants';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: CarteraDetalleResponse };

/** Título del modal según la cohorte. */
const COHORT_TITLES: Record<CarteraCohortKey, string> = {
  pendientes:   'Usuarios pendientes de pago',
  por_vencer:   'Usuarios próximos a vencer',
  no_renovaron: 'Usuarios que no renovaron'
};

/** Descripción del resumen según la cohorte. */
const COHORT_CAPTIONS: Record<CarteraCohortKey, string> = {
  pendientes:   'Clientes cuyo último pago está pendiente o parcial al día del corte',
  por_vencer:   'Clientes cuyo pago vence en los próximos días',
  no_renovaron: 'Clientes que estaban activos el mes anterior y no renovaron este mes'
};

@Component({
  selector: 'app-cartera-detalle-modal',
  templateUrl: './cartera-detalle-modal.component.html',
  styleUrls: ['./cartera-detalle-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CarteraDetalleModalComponent implements OnInit, OnDestroy {
  @Input() cohort: CarteraCohortKey = 'pendientes';
  @Input() fechaReferencia = '';
  @Input() entrenadorId: string | null = null;
  @Output() closed = new EventEmitter<void>();

  state: LoadState = { status: 'loading' };
  /** "vs jun" — label del chip de delta (mes anterior completo). */
  prevMonthLabel = '';
  title = '';
  caption = '';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly svc: EstadisticasService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.title = COHORT_TITLES[this.cohort];
    this.caption = COHORT_CAPTIONS[this.cohort];
    this.prevMonthLabel = this.buildPrevMonthLabel(this.fechaReferencia);
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.closed.emit();
  }

  load(): void {
    this.state = { status: 'loading' };
    this.cdr.markForCheck();

    this.svc
      .getCarteraDetalle(this.cohort, this.entrenadorId, this.fechaReferencia)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.state = { status: 'loaded', data };
          this.cdr.markForCheck();
        },
        error: (err) => {
          const msg =
            err && typeof err === 'object' && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'No pudimos cargar el detalle.';
          this.state = { status: 'error', message: msg };
          this.cdr.markForCheck();
        }
      });
  }

  onClose(): void {
    this.closed.emit();
  }

  onBackdropClick(): void {
    this.closed.emit();
  }

  /** "YYYY-MM-DD" → "DD/MM/YYYY". */
  formatDmy(iso: string): string {
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }

  /** Deuda formateada como COP: "$120.000". */
  formatCop(amount: number): string {
    return formatAmountCop(amount);
  }

  /**
   * Chip de delta con **semántica invertida**: mayor = peor (rojo).
   * Se usa en resumen y en el breakdown por entrenador.
   */
  invertedPill(delta: number): { class: string; arrow: string; abs: number } {
    const abs = Math.abs(delta);
    if (delta > 0) return { class: 'pdm-pill pdm-pill--down', arrow: '↑', abs };
    if (delta < 0) return { class: 'pdm-pill pdm-pill--up',   arrow: '↓', abs };
    return { class: 'pdm-pill pdm-pill--flat', arrow: '→', abs: 0 };
  }

  private buildPrevMonthLabel(refIso: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(refIso)) return '';
    const [, mStr] = refIso.split('-');
    const m = Number(mStr);                     // 1-12
    const prevIdx = m === 1 ? 11 : m - 2;        // 0-indexed prev month
    return `vs ${MESES_CORTOS[prevIdx]}`;
  }

  trackByEntrenador(_i: number, r: CarteraEntrenadorRow): string {
    return r.entrenador_id ?? `__unassigned__${r.nombre}`;
  }

  trackByCliente(_i: number, r: CarteraClienteRow): string {
    return r.cliente_id;
  }
}
