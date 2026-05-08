import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import { ClientWeightLog, ClientWeightLogInsert } from 'src/app/core/types/supabase';

export interface LastWeightEntry {
  weight_kg: number;
  measured_at: string;
}

@Injectable({ providedIn: 'root' })
export class WeightLogsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Fetches a paginated list of weight logs for a client, ordered newest first.
   */
  listByClient(
    clientId: string,
    fromIndex: number,
    limit = 5
  ): Observable<ClientWeightLog[]> {
    return from(
      this.supabase.client
        .from('client_weight_logs')
        .select('*')
        .eq('client_id', clientId)
        .order('measured_at', { ascending: false })
        .range(fromIndex, fromIndex + limit - 1)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as ClientWeightLog[];
      }),
      catchError((err) => {
        console.error('[WeightLogsService] listByClient error:', err);
        throw err;
      })
    );
  }

  /** Returns the total count of weight logs for a client. */
  countByClient(clientId: string): Observable<number> {
    return from(
      this.supabase.client
        .from('client_weight_logs')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
    ).pipe(
      map(({ count, error }) => {
        if (error) throw error;
        return count ?? 0;
      }),
      catchError((err) => {
        console.error('[WeightLogsService] countByClient error:', err);
        throw err;
      })
    );
  }

  /**
   * Calls the get_client_last_weight_log RPC.
   * The RPC returns TABLE (array). Returns null when the client has no logs.
   */
  getLastWeight(clientId: string): Observable<LastWeightEntry | null> {
    return from(
      this.supabase.client.rpc('get_client_last_weight_log', {
        p_client_id: clientId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || !Array.isArray(data) || data.length === 0) return null;
        const row = data[0] as { weight_kg: number; measured_at: string };
        return { weight_kg: row.weight_kg, measured_at: row.measured_at };
      }),
      catchError((err) => {
        console.error('[WeightLogsService] getLastWeight error:', err);
        throw err;
      })
    );
  }

  /**
   * Upserts a weight log by (client_id, measured_at).
   * The trigger auto-populates registered_by from auth.uid().
   */
  upsert(payload: ClientWeightLogInsert): Observable<ClientWeightLog> {
    return from(
      this.supabase.client
        .from('client_weight_logs')
        .upsert(payload, { onConflict: 'client_id,measured_at' })
        .select('*')
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as ClientWeightLog;
      }),
      catchError((err) => {
        console.error('[WeightLogsService] upsert error:', err);
        throw err;
      })
    );
  }
}
