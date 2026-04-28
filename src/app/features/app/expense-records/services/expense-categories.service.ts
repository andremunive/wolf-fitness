import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import { ExpenseCategory, ExpenseCategoryUpdate } from 'src/app/core/types/supabase';
import {
  CreateExpenseCategoryPayload,
  ExpenseCategoryViewModel,
  mapCategoryRow,
  UpdateExpenseCategoryPayload
} from '../models/expense-record.model';

@Injectable({ providedIn: 'root' })
export class ExpenseCategoriesService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Active categories ordered by name. Used in autocomplete and dropdowns. */
  listActive(): Observable<ExpenseCategoryViewModel[]> {
    return from(
      this.supabase.client
        .from('expense_categories')
        .select('id, name, emoji, description, is_active, created_at, created_by')
        .eq('is_active', true)
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return ((data ?? []) as ExpenseCategory[]).map(mapCategoryRow);
      }),
      catchError((err) => {
        console.error('[ExpenseCategoriesService] listActive error:', err);
        throw err;
      })
    );
  }

  /** All categories (active and inactive). Used in the management modal. */
  listAll(): Observable<ExpenseCategoryViewModel[]> {
    return from(
      this.supabase.client
        .from('expense_categories')
        .select('id, name, emoji, description, is_active, created_at, created_by')
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return ((data ?? []) as ExpenseCategory[]).map(mapCategoryRow);
      }),
      catchError((err) => {
        console.error('[ExpenseCategoriesService] listAll error:', err);
        throw err;
      })
    );
  }

  create(payload: CreateExpenseCategoryPayload): Observable<ExpenseCategoryViewModel> {
    return from(
      this.supabase.client
        .from('expense_categories')
        .insert({
          name: payload.name.trim(),
          emoji: payload.emoji?.trim() || null,
          description: payload.description?.trim() ?? null
        })
        .select('id, name, emoji, description, is_active, created_at, created_by')
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          if (error.code === '23505') {
            throw new Error('Ya existe una categoría con ese nombre.');
          }
          throw error;
        }
        return mapCategoryRow(data as ExpenseCategory);
      }),
      catchError((err) => {
        console.error('[ExpenseCategoriesService] create error:', err);
        throw err;
      })
    );
  }

  update(id: string, payload: UpdateExpenseCategoryPayload): Observable<ExpenseCategoryViewModel> {
    const patch: ExpenseCategoryUpdate = {};
    if (payload.name !== undefined) patch.name = payload.name.trim();
    if (payload.emoji !== undefined) patch.emoji = payload.emoji?.trim() || null;
    if (payload.description !== undefined) patch.description = payload.description?.trim() ?? null;
    if (payload.is_active !== undefined) patch.is_active = payload.is_active;

    return from(
      this.supabase.client
        .from('expense_categories')
        .update(patch)
        .eq('id', id)
        .select('id, name, emoji, description, is_active, created_at, created_by')
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          if (error.code === '23505') {
            throw new Error('Ya existe una categoría con ese nombre.');
          }
          throw error;
        }
        return mapCategoryRow(data as ExpenseCategory);
      }),
      catchError((err) => {
        console.error('[ExpenseCategoriesService] update error:', err);
        throw err;
      })
    );
  }

  deactivate(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('expense_categories')
        .update({ is_active: false })
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError((err) => {
        console.error('[ExpenseCategoriesService] deactivate error:', err);
        throw err;
      })
    );
  }

  activate(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('expense_categories')
        .update({ is_active: true })
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError((err) => {
        console.error('[ExpenseCategoriesService] activate error:', err);
        throw err;
      })
    );
  }
}
