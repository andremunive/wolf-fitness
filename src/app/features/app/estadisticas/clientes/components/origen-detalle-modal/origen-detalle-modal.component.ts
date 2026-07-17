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

import { EstadisticasService } from '../../../services/estadisticas.service';
import {
  OrigenDbKey,
  OrigenDetalleResponse,
  OrigenEntrenadorRow,
  OrigenClienteRow
} from '../../../models/estadisticas.model';
import { MESES_CORTOS } from '../../../models/estadisticas-constants';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: OrigenDetalleResponse };

/** Título del modal según el origen. */
const ORIGEN_TITLES: Record<OrigenDbKey, string> = {
  publicidad: 'Usuarios obtenidos por publicidad',
  llego_solo: 'Usuarios obtenidos directamente',
  referido:   'Usuarios obtenidos por recomendación'
};

/** Descripción del resumen según el origen. */
const ORIGEN_CAPTIONS: Record<OrigenDbKey, string> = {
  publicidad: 'Nuevos clientes captados por publicidad en el mes seleccionado',
  llego_solo: 'Nuevos clientes que llegaron directamente en el mes seleccionado',
  referido:   'Nuevos clientes captados por recomendación en el mes seleccionado'
};

@Component({
  selector: 'app-origen-detalle-modal',
  templateUrl: './origen-detalle-modal.component.html',
  styleUrls: ['./origen-detalle-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrigenDetalleModalComponent implements OnInit, OnDestroy {
  @Input() origen: OrigenDbKey = 'publicidad';
  @Input() fechaReferencia = '';
  @Input() entrenadorId: string | null = null;
  @Output() closed = new EventEmitter<void>();

  state: LoadState = { status: 'loading' };
  /** "vs jun" — label del chip de delta (mes anterior completo). */
  prevMonthLabel = '';
  /** Título dinámico según origen. */
  title = '';
  /** Descripción del resumen. */
  caption = '';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly svc: EstadisticasService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.title = ORIGEN_TITLES[this.origen];
    this.caption = ORIGEN_CAPTIONS[this.origen];
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
      .getOrigenDetalle(this.origen, this.entrenadorId, this.fechaReferencia)
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

  private buildPrevMonthLabel(refIso: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(refIso)) return '';
    const [, mStr] = refIso.split('-');
    const m = Number(mStr);                    // 1-12
    const prevIdx = m === 1 ? 11 : m - 2;       // 0-indexed prev month
    return `vs ${MESES_CORTOS[prevIdx]}`;
  }

  trackByEntrenador(_i: number, r: OrigenEntrenadorRow): string {
    return r.entrenador_id ?? `__unassigned__${r.nombre}`;
  }

  trackByCliente(_i: number, r: OrigenClienteRow): string {
    return r.cliente_id;
  }
}
