import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { catchError, distinctUntilChanged, map } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';

import {
  EstadoResultadosResponse,
  PeriodoModo,
  PeriodoSeleccionado
} from '../models/estado-resultados.model';
import {
  getActualForModo,
  getMensualActual,
  getTrimestreActual,
  getSemestreActual,
  parseIsoDate,
  shiftPeriodo,
  todayLocal
} from '../shared/period-helpers';

@Injectable({ providedIn: 'root' })
export class EstadoResultadosService {
  private readonly _periodoSeleccionado$ = new BehaviorSubject<PeriodoSeleccionado>(
    getMensualActual()
  );

  constructor(private readonly supabase: SupabaseService) {}

  // ─── Período ───────────────────────────────────────────────────────────────

  get periodoSeleccionado$(): Observable<PeriodoSeleccionado> {
    return this._periodoSeleccionado$.asObservable().pipe(
      distinctUntilChanged(
        (a, b) =>
          a.modo === b.modo &&
          a.fecha_inicio === b.fecha_inicio &&
          a.fecha_fin === b.fecha_fin
      )
    );
  }

  get currentPeriodo(): PeriodoSeleccionado {
    return this._periodoSeleccionado$.getValue();
  }

  setModo(modo: PeriodoModo): void {
    this._periodoSeleccionado$.next(getActualForModo(modo));
  }

  /**
   * Navega al período anterior/siguiente en el modo activo.
   * No emite si el destino tiene `fecha_inicio` posterior a hoy
   * (no permitimos ver el futuro).
   */
  navegarPeriodo(direccion: -1 | 1): void {
    const current = this._periodoSeleccionado$.getValue();
    const next = shiftPeriodo(current, direccion);
    const hoy = todayLocal();
    const startNext = parseIsoDate(next.fecha_inicio);
    if (startNext > hoy) return;
    this._periodoSeleccionado$.next(next);
  }

  // ─── Edge Function ─────────────────────────────────────────────────────────

  getEstadoResultados(
    fecha_inicio: string,
    fecha_fin: string
  ): Observable<EstadoResultadosResponse> {
    return from(
      this.supabase.client.functions.invoke<EstadoResultadosResponse>(
        'get-estado-resultados',
        { body: { fecha_inicio, fecha_fin } }
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía de get-estado-resultados');
        return data;
      }),
      catchError((err) => {
        console.error('[EstadoResultadosService] getEstadoResultados error:', err);
        throw err;
      })
    );
  }

  // ─── Helpers de período (delegan a las funciones puras) ──────────────────

  /** @deprecated Importa `getMensualActual` del shared helper directamente. */
  getMensualActual(): PeriodoSeleccionado { return getMensualActual(); }
  /** @deprecated Importa `getTrimestreActual` del shared helper directamente. */
  getTrimestreActual(): PeriodoSeleccionado { return getTrimestreActual(); }
  /** @deprecated Importa `getSemestreActual` del shared helper directamente. */
  getSemestreActual(): PeriodoSeleccionado { return getSemestreActual(); }
}
