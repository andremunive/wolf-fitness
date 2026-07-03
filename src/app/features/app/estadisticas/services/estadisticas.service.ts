import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, from, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import {
  ClientesActivosCards,
  ClientesQuincenalCards,
  DetalleResponse,
  EntrenadorFilter,
  EntrenadorOption,
  QuincenalTendenciaResponse,
  TendenciaResponse,
  VentanaQuincenal,
  VentanaTendencia
} from '../models/estadisticas.model';

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

  constructor(private readonly supabase: SupabaseService) {}

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
   * Retorna un Observable que emite `QuincenalTendenciaResponse` cada vez que
   * cambia el entrenador seleccionado o la ventana quincenal activa.
   *
   * - combineLatest reacciona a cualquiera de los dos triggers.
   * - switchMap cancela la llamada en vuelo si alguno de los dos cambia antes de
   *   que la EF responda.
   * - `fecha_referencia` se construye con la zona local del navegador (no UTC).
   */
  getQuincenalTendencia(): Observable<QuincenalTendenciaResponse> {
    return combineLatest([this.selectedEntrenador$, this.ventanaQuincenal$]).pipe(
      switchMap(([selected, ventana]) => {
        const entrenadorId: string | null = selected === 'todos' ? null : selected;
        return from(
          this.supabase.client.functions.invoke<QuincenalTendenciaResponse>(
            'stats-clients-quincenal-tendencia',
            {
              body: {
                entrenador_id:    entrenadorId,
                fecha_referencia: this.todayLocalIsoDate(),
                meses_atras:      ventana
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
   * Retorna un Observable que emite `ClientesQuincenalCards` cada vez que cambia
   * el filtro de entrenador seleccionado.
   *
   * - Cada cambio de `selectedEntrenador$` cancela la llamada anterior (switchMap).
   * - `fecha_referencia` se construye con la zona local del navegador (no UTC) para
   *   evitar el desplazamiento de día en zonas con offset negativo como Colombia (UTC-5).
   * - `entrenador_id`: 'todos' se convierte a null (todos los entrenadores).
   * - No usa shareReplay: el componente decide la estrategia de caché.
   */
  getQuincenalCards(): Observable<ClientesQuincenalCards> {
    return this.selectedEntrenador$.pipe(
      switchMap((selected) => {
        const entrenadorId: string | null = selected === 'todos' ? null : selected;
        return from(
          this.supabase.client.functions.invoke<ClientesQuincenalCards>(
            'stats-clients-quincenal',
            { body: { entrenador_id: entrenadorId, fecha_referencia: this.todayLocalIsoDate() } }
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
      })
    );
  }

  /**
   * Retorna un Observable que emite `ClientesActivosCards` cada vez que cambia
   * el filtro de entrenador seleccionado.
   *
   * - Cada cambio de `selectedEntrenador$` cancela la llamada anterior (switchMap).
   * - `fecha_referencia` se construye con la zona local del navegador (no UTC).
   * - `entrenador_id`: 'todos' se convierte a null (todos los entrenadores).
   * - No usa shareReplay: el componente decide la estrategia de caché.
   */
  getClientesActivosCards(): Observable<ClientesActivosCards> {
    return this.selectedEntrenador$.pipe(
      switchMap((selected) => {
        const entrenadorId: string | null = selected === 'todos' ? null : selected;
        return from(
          this.supabase.client.functions.invoke<ClientesActivosCards>(
            'stats-clients-cards',
            { body: { entrenador_id: entrenadorId, fecha_referencia: this.todayLocalIsoDate() } }
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
      })
    );
  }

  /**
   * Retorna un Observable que emite `TendenciaResponse` cada vez que cambia el
   * entrenador seleccionado o la ventana temporal activa.
   *
   * - combineLatest reacciona a cualquiera de los dos triggers.
   * - switchMap cancela la llamada en vuelo si alguno de los dos cambia antes de
   *   que la EF responda.
   * - `fecha_referencia` se construye con la zona local del navegador (no UTC).
   */
  getTendencia(): Observable<TendenciaResponse> {
    return combineLatest([this.selectedEntrenador$, this.ventanaTendencia$]).pipe(
      switchMap(([selected, ventana]) => {
        const entrenadorId: string | null = selected === 'todos' ? null : selected;
        return from(
          this.supabase.client.functions.invoke<TendenciaResponse>(
            'stats-clients-tendencia',
            {
              body: {
                entrenador_id:    entrenadorId,
                fecha_referencia: this.todayLocalIsoDate(),
                meses_atras:      ventana
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
      })
    );
  }

  /**
   * Retorna un Observable que emite `DetalleResponse` cada vez que cambia el
   * entrenador seleccionado.
   *
   * - Depende solo de `selectedEntrenador$`, no de una ventana adicional.
   * - `fecha_referencia` usa la zona local del navegador (no UTC).
   */
  getDetalle(): Observable<DetalleResponse> {
    return this.selectedEntrenador$.pipe(
      switchMap((selected) => {
        const entrenadorId = selected === 'todos' ? null : selected;
        const fechaReferencia = this.todayLocalIsoDate();
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
          })
        );
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
}
