import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { catchError, distinctUntilChanged, map } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import { MONTH_NAMES_ES } from 'src/app/features/app/closures/models/closure.model';
import {
  FinanzasCajaResponse,
  FinanzasComposicionResponse,
  FinanzasDetalleResponse,
  FinanzasResumenResponse,
  FinanzasTendenciaResponse,
  VentanaTendenciaFin
} from '../models/finanzas.model';

export interface MesPeriodo {
  year: number;
  month: number;
}

@Injectable({ providedIn: 'root' })
export class FinanzasService {
  private readonly _mesPeriodo$ = new BehaviorSubject<MesPeriodo>(this.currentMonthYear());

  /**
   * Ocultar/mostrar valores monetarios de Caja.
   * Arranca en false (oculto) — comportamiento tipo app bancaria.
   */
  private readonly _cajaVisible$ = new BehaviorSubject<boolean>(false);

  /**
   * Ventana temporal de la gráfica de tendencia.
   * No depende de mesPeriodo$ — siempre va desde hoy hacia atrás.
   */
  private readonly _ventanaTendencia$ = new BehaviorSubject<VentanaTendenciaFin>(1);

  constructor(private readonly supabase: SupabaseService) {}

  // ─── Período ───────────────────────────────────────────────────────────────

  get mesPeriodo$(): Observable<MesPeriodo> {
    return this._mesPeriodo$.asObservable().pipe(
      distinctUntilChanged((a, b) => a.year === b.year && a.month === b.month)
    );
  }

  /** Snapshot sincrónico del período actual — usado por helpers de label en el componente. */
  get currentMesPeriodo(): MesPeriodo {
    return this._mesPeriodo$.getValue();
  }

  setPeriodo(year: number, month: number): void {
    this._mesPeriodo$.next({ year, month });
  }

  /**
   * Devuelve "Mayo 2026" para el período indicado.
   * Si no se pasan argumentos, usa el valor actual del BehaviorSubject.
   */
  getPeriodoLabel(year?: number, month?: number): string {
    const periodo = this._mesPeriodo$.getValue();
    const y = year  ?? periodo.year;
    const m = month ?? periodo.month;
    // month es 1-indexed; MONTH_NAMES_ES es 0-indexed.
    return `${MONTH_NAMES_ES[m - 1]} ${y}`;
  }

  // ─── Caja visible toggle ───────────────────────────────────────────────────

  /** Observable de solo lectura: true cuando los montos de Caja son visibles. */
  get cajaVisible$(): Observable<boolean> {
    return this._cajaVisible$.asObservable().pipe(distinctUntilChanged());
  }

  /** Alterna entre mostrar y ocultar los valores monetarios de Caja. */
  toggleCajaVisible(): void {
    this._cajaVisible$.next(!this._cajaVisible$.getValue());
  }

  // ─── Edge Function: stats-finanzas-resumen ────────────────────────────────

  /**
   * Invoca `stats-finanzas-resumen` one-shot con los parámetros explícitos.
   * El componente controla el trigger vía combineLatest([mesPeriodo$, retryResumen$]).
   */
  getResumen(year: number, month: number): Observable<FinanzasResumenResponse> {
    return from(
      this.supabase.client.functions.invoke<FinanzasResumenResponse>(
        'stats-finanzas-resumen',
        { body: { year, month } }
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía de stats-finanzas-resumen');
        return data;
      }),
      catchError((err) => {
        console.error('[FinanzasService] getResumen error:', err);
        throw err;
      })
    );
  }

  // ─── Edge Function: stats-finanzas-caja ───────────────────────────────────

  /**
   * Invoca la Edge Function `stats-finanzas-caja` una sola vez y devuelve el
   * estado actual de caja (no depende del período seleccionado).
   * El componente controla el retry vía un BehaviorSubject<void> externo.
   */
  getCaja(): Observable<FinanzasCajaResponse> {
    return from(
      this.supabase.client.functions.invoke<FinanzasCajaResponse>(
        'stats-finanzas-caja',
        { body: {} }
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía de stats-finanzas-caja');
        return data;
      }),
      catchError((err) => {
        console.error('[FinanzasService] getCaja error:', err);
        throw err;
      })
    );
  }

  // ─── Tendencia ────────────────────────────────────────────────────────────

  /** Observable de solo lectura: ventana temporal activa para la gráfica. */
  get ventanaTendencia$(): Observable<VentanaTendenciaFin> {
    return this._ventanaTendencia$.asObservable().pipe(distinctUntilChanged());
  }

  /** Cambia la ventana temporal de la gráfica de tendencia. */
  setVentanaTendencia(n: VentanaTendenciaFin): void {
    this._ventanaTendencia$.next(n);
  }

  /**
   * Invoca `stats-finanzas-tendencia` one-shot con la ventana explícita.
   * El componente controla el trigger vía combineLatest([ventanaTendencia$, retryTendencia$]).
   */
  getTendencia(meses_atras: VentanaTendenciaFin): Observable<FinanzasTendenciaResponse> {
    return from(
      this.supabase.client.functions.invoke<FinanzasTendenciaResponse>(
        'stats-finanzas-tendencia',
        { body: { meses_atras } }
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía de stats-finanzas-tendencia');
        return data;
      }),
      catchError((err) => {
        console.error('[FinanzasService] getTendencia error:', err);
        throw err;
      })
    );
  }

  // ─── Edge Function: stats-finanzas-composicion ───────────────────────────

  /**
   * Invoca `stats-finanzas-composicion` one-shot con los parámetros explícitos.
   * El componente controla el trigger vía combineLatest([mesPeriodo$, retryComposicion$]).
   */
  getComposicion(year: number, month: number): Observable<FinanzasComposicionResponse> {
    return from(
      this.supabase.client.functions.invoke<FinanzasComposicionResponse>(
        'stats-finanzas-composicion',
        { body: { year, month } }
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía de stats-finanzas-composicion');
        return data;
      }),
      catchError((err) => {
        console.error('[FinanzasService] getComposicion error:', err);
        throw err;
      })
    );
  }

  // ─── Edge Function: stats-finanzas-detalle ───────────────────────────────

  /**
   * Invoca `stats-finanzas-detalle` one-shot con los parámetros explícitos.
   * El componente controla el trigger vía combineLatest([mesPeriodo$, retryDetalle$]).
   */
  getDetalle(year: number, month: number): Observable<FinanzasDetalleResponse> {
    return from(
      this.supabase.client.functions.invoke<FinanzasDetalleResponse>(
        'stats-finanzas-detalle',
        { body: { year, month } }
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía de stats-finanzas-detalle');
        return data;
      }),
      catchError((err) => {
        console.error('[FinanzasService] getDetalle error:', err);
        throw err;
      })
    );
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private currentMonthYear(): MesPeriodo {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
}
