import { Injectable } from '@angular/core';
import { from as fromPromise, Observable } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import {
  CafeteriaExpense,
  CafeteriaExpenseCategory,
  CafeteriaExpenseWithDetails
} from '../models/cafeteria.model';
import { localDateString } from 'src/app/shared/utils/date.utils';

/**
 * Acceso a datos de gastos / insumos de cafetería y sus categorías.
 */
@Injectable({
  providedIn: 'root'
})
export class CafeteriaInsumosService {
  constructor(private readonly supabase: SupabaseService) {}

  getExpenses(year: number, month: number): Observable<CafeteriaExpenseWithDetails[]> {
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDayDate = new Date(year, month, 0);
    const lastDay = localDateString(lastDayDate);

    return fromPromise(
      this.supabase.client
        .from('cafeteria_expenses')
        .select(`
          *,
          category:cafeteria_expense_categories(name),
          created_by_profile:profiles!cafeteria_expenses_created_by_fkey(full_name)
        `)
        .gte('expense_date', firstDay)
        .lte('expense_date', lastDay)
        .eq('is_active', true)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return ((data ?? []) as unknown[]).map((row) => {
          const r = row as CafeteriaExpense & {
            category: Pick<CafeteriaExpenseCategory, 'name'> | null;
            created_by_profile: { full_name: string } | null;
          };
          const { created_by_profile, ...rest } = r;
          return {
            ...rest,
            created_by_name: created_by_profile?.full_name ?? null
          } as CafeteriaExpenseWithDetails;
        });
      }),
      catchError((err) => {
        console.error('[CafeteriaInsumosService] getExpenses error:', err);
        throw err;
      })
    );
  }

  getExpenseCategories(): Observable<CafeteriaExpenseCategory[]> {
    return fromPromise(
      this.supabase.client
        .from('cafeteria_expense_categories')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as CafeteriaExpenseCategory[];
      }),
      catchError((err) => {
        console.error('[CafeteriaInsumosService] getExpenseCategories error:', err);
        throw err;
      })
    );
  }

  getAllExpenseCategories(): Observable<CafeteriaExpenseCategory[]> {
    return fromPromise(
      this.supabase.client
        .from('cafeteria_expense_categories')
        .select('*')
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as CafeteriaExpenseCategory[];
      }),
      catchError((err) => {
        console.error('[CafeteriaInsumosService] getAllExpenseCategories error:', err);
        throw err;
      })
    );
  }

  createExpense(data: {
    expense_date: string;
    category_id: string;
    amount_cop: number;
    payment_method: 'cash' | 'transfer' | 'nequi' | 'other';
    supplier?: string;
    notes?: string;
  }): Observable<CafeteriaExpense> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return fromPromise(
          this.supabase.client
            .from('cafeteria_expenses')
            .insert({
              expense_date: data.expense_date,
              category_id: data.category_id,
              amount_cop: data.amount_cop,
              payment_method: data.payment_method,
              supplier: data.supplier ?? null,
              notes: data.notes ?? null,
              created_by: userId
            })
            .select('*')
            .single()
        ).pipe(
          map(({ data: expense, error }) => {
            if (error) throw error;
            return expense as CafeteriaExpense;
          })
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaInsumosService] createExpense error:', err);
        throw err;
      })
    );
  }

  updateExpense(
    id: string,
    data: {
      expense_date?: string;
      category_id?: string;
      amount_cop?: number;
      payment_method?: 'cash' | 'transfer' | 'nequi' | 'other';
      supplier?: string | null;
      notes?: string | null;
    }
  ): Observable<CafeteriaExpense> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        const patch: {
          expense_date?: string;
          category_id?: string;
          amount_cop?: number;
          payment_method?: string;
          supplier?: string | null;
          notes?: string | null;
          updated_by: string;
        } = { updated_by: userId };
        if (data.expense_date !== undefined) patch.expense_date = data.expense_date;
        if (data.category_id !== undefined) patch.category_id = data.category_id;
        if (data.amount_cop !== undefined) patch.amount_cop = data.amount_cop;
        if (data.payment_method !== undefined) patch.payment_method = data.payment_method;
        if (data.supplier !== undefined) patch.supplier = data.supplier;
        if (data.notes !== undefined) patch.notes = data.notes;

        return fromPromise(
          this.supabase.client
            .from('cafeteria_expenses')
            .update(patch)
            .eq('id', id)
            .eq('is_active', true)
            .select('*')
            .single()
        ).pipe(
          map(({ data: expense, error }) => {
            if (error) throw error;
            return expense as CafeteriaExpense;
          })
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaInsumosService] updateExpense error:', err);
        throw err;
      })
    );
  }

  voidExpense(id: string): Observable<CafeteriaExpense> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return fromPromise(
          this.supabase.client
            .from('cafeteria_expenses')
            .update({ is_active: false, updated_by: userId })
            .eq('id', id)
            .select('*')
            .single()
        ).pipe(
          map(({ data: expense, error }) => {
            if (error) throw error;
            return expense as CafeteriaExpense;
          })
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaInsumosService] voidExpense error:', err);
        throw err;
      })
    );
  }

  createExpenseCategory(data: {
    name: string;
    description?: string;
  }): Observable<CafeteriaExpenseCategory> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return fromPromise(
          this.supabase.client
            .from('cafeteria_expense_categories')
            .insert({
              name: data.name,
              description: data.description ?? null,
              created_by: userId
            })
            .select('*')
            .single()
        ).pipe(
          map(({ data: category, error }) => {
            if (error) throw error;
            return category as CafeteriaExpenseCategory;
          })
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaInsumosService] createExpenseCategory error:', err);
        throw err;
      })
    );
  }

  toggleExpenseCategory(id: string, isActive: boolean): Observable<CafeteriaExpenseCategory> {
    return fromPromise(
      this.supabase.client
        .from('cafeteria_expense_categories')
        .update({ is_active: isActive })
        .eq('id', id)
        .select('*')
        .single()
    ).pipe(
      map(({ data: category, error }) => {
        if (error) throw error;
        return category as CafeteriaExpenseCategory;
      }),
      catchError((err) => {
        console.error('[CafeteriaInsumosService] toggleExpenseCategory error:', err);
        throw err;
      })
    );
  }
}
