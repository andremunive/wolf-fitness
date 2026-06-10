import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { catchError, distinctUntilChanged, map } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';

import {
  PeriodoModo,
  PeriodoSeleccionado
} from '../models/estado-resultados.model';
import { FlujoCajaResponse } from '../models/flujo-caja.model';
import {
  getActualForModo,
  getMensualActual,
  parseIsoDate,
  shiftPeriodo,
  todayLocal
} from '../shared/period-helpers';

@Injectable({ providedIn: 'root' })
export class FlujoCajaService {
  /** Estado del período independiente del de Estado de Resultados —
   * el usuario puede tener selección distinta en cada informe. */
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
   * No emite si el destino tiene `fecha_inicio` posterior a hoy.
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

  getFlujoConsolidado(
    fecha_inicio: string,
    fecha_fin: string
  ): Observable<FlujoCajaResponse> {
    return from(
      this.supabase.client.functions.invoke<FlujoCajaResponse>(
        'get-flujo-de-caja',
        { body: { fecha_inicio, fecha_fin } }
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía de get-flujo-de-caja');
        return data;
      }),
      catchError((err) => {
        console.error('[FlujoCajaService] getFlujoConsolidado error:', err);
        throw err;
      })
    );
  }
}
