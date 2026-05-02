import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import { ClientMeasurement, ClientMeasurementInsert } from 'src/app/core/types/supabase';

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
}
