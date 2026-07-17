import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import { MONTH_NAMES_ES } from 'src/app/features/app/closures/models/closure.model';
import {
  ClientesActivosCards,
  ClientesQuincenalCards,
  DetalleResponse,
  EntrenadorFilter,
  EntrenadorOption,
  OrigenDbKey,
  OrigenDetalleResponse,
  QuincenalTendenciaResponse,
  TendenciaResponse,
  VentanaQuincenal,
  VentanaTendencia
} from '../models/estadisticas.model';

/** Período mes/año navegable en el dashboard de clientes. */
export interface MesPeriodo {
  year: number;
  month: number;
}

/** Fila cruda de `profiles` para la query de entrenadores activos. */
interface EntrenadorRow {
  id: string;
  full_name: string;
}

/**
 * Shape of the raw error body returned by all Edge Functions.
 * { error: { code, message, details } }
 */
interface EfErrorCode {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

interface EfErrorBody {
  error: EfErrorCode;
}

/**
 * Extracts the structured EF error from a raw Supabase SDK error.
 *
 * The SDK wraps the HTTP response in a FunctionsHttpError whose `context` may be
 * a native fetch Response (recent SDK) or an already-parsed object (older SDK).
 * This helper mirrors the one in PaymentsService — kept in each service to avoid
 * cross-feature coupling until a shared utility module is created.
 */
async function extractEfErrorAsync(rawError: unknown): Promise<EfErrorCode> {
  if (rawError && typeof rawError === 'object') {
    const anyErr = rawError as Record<string, unknown>;

    if (anyErr['context'] instanceof Response) {
      try {
        const body = await (anyErr['context'] as Response).clone().json() as EfErrorBody;
        if (body?.error && typeof body.error === 'object') {
          return body.error as EfErrorCode;
        }
      } catch {
        // body was not valid JSON — fall through
      }
    }

    if (anyErr['context'] && typeof anyErr['context'] === 'object') {
      const ctx = anyErr['context'] as Record<string, unknown>;
      if (ctx['error'] && typeof ctx['error'] === 'object') {
        return ctx['error'] as EfErrorCode;
      }
    }

    if (anyErr['error'] && typeof anyErr['error'] === 'object') {
      return anyErr['error'] as EfErrorCode;
    }

    if (typeof anyErr['message'] === 'string') {
      try {
        const parsed = JSON.parse(anyErr['message']) as EfErrorBody;
        if (parsed?.error) return parsed.error;
      } catch {
        // not JSON — fall through
      }
    }
  }

  return { code: 'INTERNAL_ERROR', message: 'Unknown error', details: {} };
}

@Injectable({ providedIn: 'root' })
export class EstadisticasService {
  private readonly _selectedEntrenador$ = new BehaviorSubject<EntrenadorFilter>('todos');
  private readonly _ventanaTendencia$   = new BehaviorSubject<VentanaTendencia>(1);
  private readonly _ventanaQuincenal$   = new BehaviorSubject<VentanaQuincenal>(2);
  private readonly _mesPeriodo$         = new BehaviorSubject<MesPeriodo>(this.currentMonthYear());

  constructor(private readonly supabase: SupabaseService) {}

  // ─── Período mes/año ──────────────────────────────────────────────────────

  /**
   * Observable del período mes/año activo del dashboard.
   * Solo emite cuando cambia el par (year, month).
   */
  get mesPeriodo$(): Observable<MesPeriodo> {
    return this._mesPeriodo$.asObservable().pipe(
      distinctUntilChanged((a, b) => a.year === b.year && a.month === b.month)
    );
  }

  /** Snapshot sincrónico del período seleccionado. */
  get currentMesPeriodo(): MesPeriodo {
    return this._mesPeriodo$.getValue();
  }

  setPeriodo(year: number, month: number): void {
    this._mesPeriodo$.next({ year, month });
  }

  /** Devuelve "Mayo 2026" para el período dado o el actual si no se pasan args. */
  getPeriodoLabel(year?: number, month?: number): string {
    const p = this._mesPeriodo$.getValue();
    const y = year  ?? p.year;
    const m = month ?? p.month;
    return `${MONTH_NAMES_ES[m - 1]} ${y}`;
  }

  /**
   * Observable del entrenador seleccionado en el filtro global del dashboard.
   * Emite 'todos' por defecto. Solo emite cuando el valor cambia realmente.
   * Solo lectura: usa `setEntrenador()` para cambiar el valor.
   */
  get selectedEntrenador$(): Observable<EntrenadorFilter> {
    return this._selectedEntrenador$.asObservable().pipe(distinctUntilChanged());
  }

  /**
   * Actualiza el entrenador seleccionado en el filtro global del dashboard.
   * Pasa 'todos' para volver al estado sin filtro.
   */
  setEntrenador(id: EntrenadorFilter): void {
    this._selectedEntrenador$.next(id);
  }

  /**
   * Snapshot sincrónico del entrenador seleccionado. Evita subscribe().unsubscribe().
   * Útil en métodos de retry donde solo se necesita el valor actual una vez.
   */
  get currentEntrenador(): EntrenadorFilter {
    return this._selectedEntrenador$.getValue();
  }

  /**
   * Observable de la ventana temporal activa para la gráfica de tendencia.
   * Solo emite cuando el valor cambia realmente.
   */
  get ventanaTendencia$(): Observable<VentanaTendencia> {
    return this._ventanaTendencia$.asObservable().pipe(distinctUntilChanged());
  }

  /** Cambia la ventana temporal de la gráfica de tendencia. */
  setVentanaTendencia(n: VentanaTendencia): void {
    this._ventanaTendencia$.next(n);
  }

  /**
   * Observable de la ventana temporal activa para la gráfica de distribución quincenal.
   * Solo emite cuando el valor cambia realmente.
   */
  get ventanaQuincenal$(): Observable<VentanaQuincenal> {
    return this._ventanaQuincenal$.asObservable().pipe(distinctUntilChanged());
  }

  /** Cambia la ventana temporal de la gráfica de distribución quincenal. */
  setVentanaQuincenal(n: VentanaQuincenal): void {
    this._ventanaQuincenal$.next(n);
  }

  /**
   * Invoca `stats-clients-quincenal-tendencia` one-shot con los parámetros
   * explícitos. El componente orquesta el trigger vía combineLatest sobre
   * `mesPeriodo$`, `selectedEntrenador$`, `ventanaQuincenal$` y su retry$.
   */
  getQuincenalTendencia(
    entrenadorId: string | null,
    fechaReferencia: string,
    mesesAtras: VentanaQuincenal
  ): Observable<QuincenalTendenciaResponse> {
    return from(
      this.supabase.client.functions.invoke<QuincenalTendenciaResponse>(
        'stats-clients-quincenal-tendencia',
        {
          body: {
            entrenador_id:    entrenadorId,
            fecha_referencia: fechaReferencia,
            meses_atras:      mesesAtras
          }
        }
      )
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) {
          return from(extractEfErrorAsync(error)).pipe(
            switchMap((efErr) => throwError(() => efErr))
          );
        }
        if (!data) {
          return throwError(() => ({
            code: 'INTERNAL_ERROR',
            message: 'Respuesta vacía de stats-clients-quincenal-tendencia',
            details: {}
          }));
        }
        return [data];
      }),
      catchError((err) => {
        if (err && typeof err === 'object' && 'code' in err) return throwError(() => err);
        return from(extractEfErrorAsync(err)).pipe(switchMap((efErr) => throwError(() => efErr)));
      })
    );
  }

  /**
   * Devuelve la lista de entrenadores activos para poblar el dropdown del filtro.
   * Fuente: tabla `profiles`, role = 'trainer', is_active = true, ordenado por full_name.
   */
  getEntrenadores(): Observable<EntrenadorOption[]> {
    return from(
      this.supabase.client
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'trainer')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        const rows = (data ?? []) as unknown as EntrenadorRow[];
        return rows.map(
          (row): EntrenadorOption => ({
            id: row.id,
            fullName: row.full_name
          })
        );
      }),
      catchError((err) => {
        console.error('[EstadisticasService] getEntrenadores error:', err);
        throw err;
      })
    );
  }

  /**
   * Invoca `stats-clients-quincenal` one-shot. El componente orquesta el trigger
   * vía combineLatest sobre `mesPeriodo$`, `selectedEntrenador$` y su retry$.
   */
  getQuincenalCards(
    entrenadorId: string | null,
    fechaReferencia: string
  ): Observable<ClientesQuincenalCards> {
    return from(
      this.supabase.client.functions.invoke<ClientesQuincenalCards>(
        'stats-clients-quincenal',
        { body: { entrenador_id: entrenadorId, fecha_referencia: fechaReferencia } }
      )
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) {
          return from(extractEfErrorAsync(error)).pipe(
            switchMap((efErr) => throwError(() => efErr))
          );
        }
        if (!data) {
          return throwError(() => ({
            code: 'INTERNAL_ERROR',
            message: 'Respuesta vacía de stats-clients-quincenal',
            details: {}
          }));
        }
        return [data];
      }),
      catchError((err) => {
        if (err && typeof err === 'object' && 'code' in err) return throwError(() => err);
        return from(extractEfErrorAsync(err)).pipe(switchMap((efErr) => throwError(() => efErr)));
      })
    );
  }

  /**
   * Invoca `stats-clients-cards` one-shot. El componente orquesta el trigger
   * vía combineLatest sobre `mesPeriodo$`, `selectedEntrenador$` y su retry$.
   */
  getClientesActivosCards(
    entrenadorId: string | null,
    fechaReferencia: string
  ): Observable<ClientesActivosCards> {
    return from(
      this.supabase.client.functions.invoke<ClientesActivosCards>(
        'stats-clients-cards',
        { body: { entrenador_id: entrenadorId, fecha_referencia: fechaReferencia } }
      )
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) {
          return from(extractEfErrorAsync(error)).pipe(
            switchMap((efErr) => throwError(() => efErr))
          );
        }
        if (!data) {
          return throwError(() => ({
            code: 'INTERNAL_ERROR',
            message: 'Respuesta vacía de stats-clients-cards',
            details: {}
          }));
        }
        return [data];
      }),
      catchError((err) => {
        if (err && typeof err === 'object' && 'code' in err) return throwError(() => err);
        return from(extractEfErrorAsync(err)).pipe(switchMap((efErr) => throwError(() => efErr)));
      })
    );
  }

  /**
   * Invoca `stats-clients-tendencia` one-shot. El componente orquesta el trigger
   * vía combineLatest sobre `mesPeriodo$`, `selectedEntrenador$`,
   * `ventanaTendencia$` y su retry$.
   */
  getTendencia(
    entrenadorId: string | null,
    fechaReferencia: string,
    mesesAtras: VentanaTendencia
  ): Observable<TendenciaResponse> {
    return from(
      this.supabase.client.functions.invoke<TendenciaResponse>(
        'stats-clients-tendencia',
        {
          body: {
            entrenador_id:    entrenadorId,
            fecha_referencia: fechaReferencia,
            meses_atras:      mesesAtras
          }
        }
      )
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) {
          return from(extractEfErrorAsync(error)).pipe(
            switchMap((efErr) => throwError(() => efErr))
          );
        }
        if (!data) {
          return throwError(() => ({
            code: 'INTERNAL_ERROR',
            message: 'Respuesta vacía de stats-clients-tendencia',
            details: {}
          }));
        }
        return [data];
      }),
      catchError((err) => {
        if (err && typeof err === 'object' && 'code' in err) return throwError(() => err);
        return from(extractEfErrorAsync(err)).pipe(switchMap((efErr) => throwError(() => efErr)));
      })
    );
  }

  /**
   * Invoca `stats-clients-origen-detalle` one-shot. Sirve al modal de detalle
   * por origen (Publicidad, Directos, Recomendación) — devuelve resumen +
   * breakdown por entrenador + lista de clientes captados. No es reactivo:
   * el modal lo llama al abrirse.
   */
  getOrigenDetalle(
    origen: OrigenDbKey,
    entrenadorId: string | null,
    fechaReferencia: string
  ): Observable<OrigenDetalleResponse> {
    return from(
      this.supabase.client.functions.invoke<OrigenDetalleResponse>(
        'stats-clients-origen-detalle',
        {
          body: {
            entrenador_id:    entrenadorId,
            fecha_referencia: fechaReferencia,
            origen
          }
        }
      )
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) return from(extractEfErrorAsync(error)).pipe(switchMap(efErr => throwError(() => efErr)));
        if (!data) return throwError(() => ({ code: 'INTERNAL_ERROR', message: 'Respuesta vacía de stats-clients-origen-detalle', details: {} }));
        return [data];
      }),
      catchError((err) => {
        if (err && typeof err === 'object' && 'code' in err) return throwError(() => err);
        return from(extractEfErrorAsync(err)).pipe(switchMap(efErr => throwError(() => efErr)));
      })
    );
  }

  /**
   * Invoca `stats-clients-detalle` one-shot. El componente orquesta el trigger
   * vía combineLatest sobre `mesPeriodo$`, `selectedEntrenador$` y su retry$.
   */
  getDetalle(
    entrenadorId: string | null,
    fechaReferencia: string
  ): Observable<DetalleResponse> {
    return from(
      this.supabase.client.functions.invoke<DetalleResponse>(
        'stats-clients-detalle',
        { body: { entrenador_id: entrenadorId, fecha_referencia: fechaReferencia } }
      )
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) return from(extractEfErrorAsync(error)).pipe(switchMap(efErr => throwError(() => efErr)));
        if (!data) return throwError(() => ({ code: 'INTERNAL_ERROR', message: 'Respuesta vacía de stats-clients-detalle', details: {} }));
        return [data];
      }),
      catchError((err) => {
        if (err && typeof err === 'object' && 'code' in err) return throwError(() => err);
        return from(extractEfErrorAsync(err)).pipe(switchMap(efErr => throwError(() => efErr)));
      })
    );
  }

  /**
   * Construye la fecha de hoy como "YYYY-MM-DD" usando la zona local del navegador.
   * Se evita `toISOString()` porque convierte a UTC y puede desplazar el día en
   * zonas horarias con offset negativo (Colombia, UTC-5).
   */
  private todayLocalIsoDate(): string {
    const now  = new Date();
    const yyyy = now.getFullYear();
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const dd   = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * `fecha_referencia` para las Edge Functions según el período seleccionado:
   * - Mes en curso  → fecha de hoy (zona local).
   * - Mes pasado    → último día de ese mes.
   * - Mes futuro    → primer día de ese mes (los botones lo evitan, pero el
   *                   servicio no asume que el llamador respete el límite).
   */
  buildFechaReferencia(p: MesPeriodo): string {
    const now = new Date();
    const isCurrent = p.year === now.getFullYear() && p.month === now.getMonth() + 1;
    if (isCurrent) return this.todayLocalIsoDate();

    const isPast =
      p.year < now.getFullYear() ||
      (p.year === now.getFullYear() && p.month < now.getMonth() + 1);
    const day = isPast ? new Date(p.year, p.month, 0).getDate() : 1;
    const mm  = String(p.month).padStart(2, '0');
    const dd  = String(day).padStart(2, '0');
    return `${p.year}-${mm}-${dd}`;
  }

  private currentMonthYear(): MesPeriodo {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
}
