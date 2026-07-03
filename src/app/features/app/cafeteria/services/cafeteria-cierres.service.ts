import { Injectable } from '@angular/core';
import { from as fromPromise, forkJoin, Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import {
  CafeteriaConsolidation,
  CafeteriaConsolidationPreview,
  CafeteriaConsolidationWithUser
} from '../models/cafeteria.model';

/**
 * Acceso a datos de consolidaciones quincenales de cafetería.
 *
 * `getConsolidations` (sin WithUser) fue removido por ser dead code —
 * ningún componente lo consume.
 */
@Injectable({
  providedIn: 'root'
})
export class CafeteriaCierresService {
  constructor(private readonly supabase: SupabaseService) {}

  getConsolidationsWithUser(): Observable<CafeteriaConsolidationWithUser[]> {
    return fromPromise(
      this.supabase.client
        .from('cafeteria_consolidations')
        .select('*, consolidated_by_profile:profiles!cafeteria_consolidations_consolidated_by_fkey(full_name)')
        .order('period_start', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return ((data ?? []) as unknown[]).map((row) => {
          const r = row as CafeteriaConsolidation & {
            consolidated_by_profile: { full_name: string } | null;
          };
          const { consolidated_by_profile, ...rest } = r;
          return {
            ...rest,
            consolidated_by_name: consolidated_by_profile?.full_name ?? null
          } as CafeteriaConsolidationWithUser;
        });
      }),
      catchError((err) => {
        console.error('[CafeteriaCierresService] getConsolidationsWithUser error:', err);
        throw err;
      })
    );
  }

  getConsolidationPreview(start: string, end: string): Observable<CafeteriaConsolidationPreview> {
    const sales$ = fromPromise(
      this.supabase.client
        .from('cafeteria_sales')
        .select('amount_received_cop, status', { count: 'exact' })
        .gte('sale_date', start)
        .lte('sale_date', end)
        .eq('is_active', true)
    );

    const combos$ = fromPromise(
      this.supabase.client
        .from('cafeteria_combo_purchases')
        .select('amount_received_cop, status', { count: 'exact' })
        .gte('purchase_date', start)
        .lte('purchase_date', end)
        .eq('is_active', true)
    );

    const expenses$ = fromPromise(
      this.supabase.client
        .from('cafeteria_expenses')
        .select('amount_cop', { count: 'exact' })
        .gte('expense_date', start)
        .lte('expense_date', end)
        .eq('is_active', true)
    );

    return forkJoin({ sales: sales$, combos: combos$, expenses: expenses$ }).pipe(
      map(({ sales, combos, expenses }) => {
        if (sales.error) throw sales.error;
        if (combos.error) throw combos.error;
        if (expenses.error) throw expenses.error;

        const salesRows = (sales.data ?? []) as Array<{ amount_received_cop: number; status: string }>;
        const combosRows = (combos.data ?? []) as Array<{ amount_received_cop: number; status: string }>;
        const expensesRows = (expenses.data ?? []) as Array<{ amount_cop: number }>;

        const totalSalesCop =
          salesRows.filter((r) => r.status !== 'pending').reduce((acc, r) => acc + r.amount_received_cop, 0) +
          combosRows.filter((r) => r.status !== 'pending').reduce((acc, r) => acc + r.amount_received_cop, 0);

        const totalExpensesCop = expensesRows.reduce((acc, r) => acc + r.amount_cop, 0);

        return {
          period_start: start,
          period_end: end,
          total_sales_cop: totalSalesCop,
          total_expenses_cop: totalExpensesCop,
          net_cop: totalSalesCop - totalExpensesCop,
          sales_count: salesRows.length,
          combo_purchases_count: combosRows.length,
          expenses_count: expensesRows.length,
          pending_sales_count: salesRows.filter((r) => r.status === 'pending').length,
          pending_combo_purchases_count: combosRows.filter((r) => r.status === 'pending').length
        } as CafeteriaConsolidationPreview;
      }),
      catchError((err) => {
        console.error('[CafeteriaCierresService] getConsolidationPreview error:', err);
        throw err;
      })
    );
  }

  closeConsolidation(start: string, end: string): Observable<CafeteriaConsolidation> {
    return fromPromise(
      this.supabase.client.functions.invoke('close-cafeteria-consolidation', {
        body: { period_start: start, period_end: end }
      })
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) {
          return throwError(() => new Error(error.message ?? 'Error al cerrar la quincena.'));
        }
        const response = data as { consolidation?: CafeteriaConsolidation; error?: string };
        if (response.error) {
          return throwError(() => new Error(response.error));
        }
        if (!response.consolidation) {
          return throwError(() => new Error('La función no devolvió el cierre creado.'));
        }
        return of(response.consolidation);
      }),
      catchError((err) => {
        console.error('[CafeteriaCierresService] closeConsolidation error:', err);
        return throwError(() => err);
      })
    );
  }
}
