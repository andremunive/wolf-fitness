import { Injectable } from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import { ClientMeasurement, ClientMeasurementInsert } from 'src/app/core/types/supabase';
import {
  SendMeasurementsSharePayload,
  SendShareSuccess,
  ShareErrorPayload
} from '../models/measurement-share.model';

// ─── Edge Function error helpers (local copy — not extracted to core/) ────────

/**
 * Shape of the raw error body returned by all Edge Functions.
 * { error: { code, message, details } }
 */
interface EfErrorBody {
  error: ShareErrorPayload;
}

/**
 * Asynchronous error extractor for Edge Function errors.
 *
 * Why async: FunctionsHttpError carries the raw fetch Response in `context`.
 * Reading the body requires `await response.json()`, so this helper is a
 * Promise that integrates into RxJS via `from(extractEfErrorAsync(...))`.
 *
 * Duplicated from PaymentsService intentionally — see CLAUDE.md §10.
 */
async function extractEfErrorAsync(rawError: unknown): Promise<ShareErrorPayload> {
  if (rawError && typeof rawError === 'object') {
    const anyErr = rawError as Record<string, unknown>;

    // FunctionsHttpError: context is a native fetch Response object.
    if (anyErr['context'] instanceof Response) {
      try {
        const body = await (anyErr['context'] as Response).clone().json() as EfErrorBody;
        if (body?.error && typeof body.error === 'object') {
          return body.error as ShareErrorPayload;
        }
      } catch {
        // Body was not valid JSON — fall through.
      }
    }

    // Older SDK versions: context was already a parsed object.
    if (anyErr['context'] && typeof anyErr['context'] === 'object') {
      const ctx = anyErr['context'] as Record<string, unknown>;
      if (ctx['error'] && typeof ctx['error'] === 'object') {
        return ctx['error'] as ShareErrorPayload;
      }
    }

    // Sometimes the SDK surfaces the body directly on the error object.
    if (anyErr['error'] && typeof anyErr['error'] === 'object') {
      return anyErr['error'] as ShareErrorPayload;
    }

    // Last resort: try to parse the message field as JSON.
    if (typeof anyErr['message'] === 'string') {
      try {
        const parsed = JSON.parse(anyErr['message']) as EfErrorBody;
        if (parsed?.error) return parsed.error;
      } catch {
        // Not JSON — fall through.
      }
    }
  }

  return { code: 'INTERNAL_ERROR', message: 'Unknown error', details: {} };
}

/** Wraps extractEfErrorAsync in an Observable that immediately throws the structured error. */
function efError$(rawError: unknown): Observable<never> {
  return from(extractEfErrorAsync(rawError)).pipe(
    switchMap((efErr) => throwError(() => efErr))
  );
}

@Injectable({ providedIn: 'root' })
export class MeasurementsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Fetches a paginated list of measurements for a client,
   * ordered newest first.
   */
  listByClient(
    clientId: string,
    from_index: number,
    limit = 5
  ): Observable<ClientMeasurement[]> {
    return from(
      this.supabase.client
        .from('client_measurements')
        .select('*')
        .eq('client_id', clientId)
        .order('measured_at', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from_index, from_index + limit - 1)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as ClientMeasurement[];
      }),
      catchError((err) => {
        console.error('[MeasurementsService] listByClient error:', err);
        throw err;
      })
    );
  }

  /** Returns total count of measurements for a client. */
  countByClient(clientId: string): Observable<number> {
    return from(
      this.supabase.client
        .from('client_measurements')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
    ).pipe(
      map(({ count, error }) => {
        if (error) throw error;
        return count ?? 0;
      }),
      catchError((err) => {
        console.error('[MeasurementsService] countByClient error:', err);
        throw err;
      })
    );
  }

  /** Fetches a single measurement by id. */
  getById(id: string): Observable<ClientMeasurement> {
    return from(
      this.supabase.client
        .from('client_measurements')
        .select('*')
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as ClientMeasurement;
      }),
      catchError((err) => {
        console.error('[MeasurementsService] getById error:', err);
        throw err;
      })
    );
  }

  /** Fetches two measurements in a single query — used for comparison view. */
  getByIds(ids: [string, string]): Observable<ClientMeasurement[]> {
    return from(
      this.supabase.client
        .from('client_measurements')
        .select('*')
        .in('id', ids)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as ClientMeasurement[];
      }),
      catchError((err) => {
        console.error('[MeasurementsService] getByIds error:', err);
        throw err;
      })
    );
  }

  /**
   * Calls the RPC get_client_last_field_values which returns a JSONB object
   * with the most recent known value for each measurement field.
   * Keys match the column names (weight_kg, calf_left_cm, etc.).
   */
  getLastFieldValues(
    clientId: string
  ): Observable<Record<string, number | null>> {
    return from(
      this.supabase.client.rpc('get_client_last_field_values', {
        p_client_id: clientId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? {}) as Record<string, number | null>;
      }),
      catchError((err) => {
        console.error('[MeasurementsService] getLastFieldValues error:', err);
        throw err;
      })
    );
  }

  /**
   * Inserts a new measurement row and returns the created record.
   * The trigger auto-populates registered_by from auth.uid().
   */
  register(payload: ClientMeasurementInsert): Observable<ClientMeasurement> {
    return from(
      this.supabase.client
        .from('client_measurements')
        .insert(payload)
        .select('*')
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as ClientMeasurement;
      }),
      catchError((err) => {
        console.error('[MeasurementsService] register error:', err);
        throw err;
      })
    );
  }

  /**
   * Calls send-measurements-share EF and returns an Observable that emits
   * the success payload or throws a structured ShareErrorPayload.
   *
   * Stateless: each call always attempts to send the email. The UI must
   * prevent double-invocation via the isSending guard in the modal component.
   */
  sendMeasurementsShare(payload: SendMeasurementsSharePayload): Observable<SendShareSuccess> {
    return from(
      this.supabase.client.functions.invoke<SendShareSuccess>(
        'send-measurements-share',
        { body: payload }
      )
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) return efError$(error);
        if (!data) {
          return throwError(() => ({
            code: 'INTERNAL_ERROR',
            message: 'Empty response from send-measurements-share',
            details: {}
          }));
        }
        return [data];
      }),
      catchError((err) => {
        // If already a structured EF error, re-throw as-is.
        if (err && typeof err === 'object' && 'code' in err) {
          return throwError(() => err);
        }
        return efError$(err);
      })
    );
  }
}
