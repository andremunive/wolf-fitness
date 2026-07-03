import { Injectable } from '@angular/core';
import { from as fromPromise, Observable, of, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import { CafeteriaDashboardData } from '../models/cafeteria.model';

/**
 * Acceso a datos del dashboard de cafetería vía Edge Function.
 */
@Injectable({
  providedIn: 'root'
})
export class CafeteriaDashboardService {
  constructor(private readonly supabase: SupabaseService) {}

  getDashboard(fechaInicio: string, fechaFin: string): Observable<CafeteriaDashboardData> {
    return fromPromise(
      this.supabase.client.functions.invoke('get-cafeteria-dashboard', {
        body: { fecha_inicio: fechaInicio, fecha_fin: fechaFin }
      })
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) {
          return throwError(() => new Error(error.message ?? 'Error al obtener el dashboard de cafetería.'));
        }
        const response = data as { data?: CafeteriaDashboardData; error?: string };
        if (response.error) {
          return throwError(() => new Error(response.error));
        }
        if (!response.data) {
          return throwError(() => new Error('La función no devolvió datos del dashboard.'));
        }
        return of(response.data);
      }),
      catchError((err) => {
        console.error('[CafeteriaDashboardService] getDashboard error:', err);
        return throwError(() => err);
      })
    );
  }
}
