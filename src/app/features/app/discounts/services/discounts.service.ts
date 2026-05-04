import { Injectable } from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import { Discount, DiscountInsert, DiscountType, DiscountUpdate } from '../models/discount.model';

/** Shape of a PostgREST error object (exposed by supabase-js). */
interface PostgrestError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

@Injectable({ providedIn: 'root' })
export class DiscountsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Fetches all discounts, optionally filtered by active status or type.
   * RLS allows admin to see all rows.
   */
  list(filters?: { onlyActive?: boolean; type?: DiscountType }): Observable<Discount[]> {
    return from(this.buildListQuery(filters)).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as Discount[];
      }),
      catchError((err) => {
        console.error('[DiscountsService] list error:', err);
        return throwError(() => err as PostgrestError);
      })
    );
  }

  /**
   * Inserts a new discount.
   * `created_by` is set from the current authenticated user.
   */
  create(payload: DiscountInsert): Observable<Discount> {
    return from(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data }) => {
        const userId = data.user?.id ?? null;
        const fullPayload: DiscountInsert = { ...payload, created_by: userId };

        return from(
          this.supabase.client
            .from('discounts')
            .insert(fullPayload)
            .select()
            .single()
        );
      }),
      map(({ data, error }) => {
        if (error) throw error;
        return data as Discount;
      }),
      catchError((err) => {
        console.error('[DiscountsService] create error:', err);
        return throwError(() => err as PostgrestError);
      })
    );
  }

  /**
   * Updates a discount by id.
   * If the backend trigger blocks the update (P0001), the error is surfaced as-is
   * so the component can call mapDiscountErrorToMessage.
   * Editing `description` and `is_active` is never blocked.
   */
  update(id: string, patch: DiscountUpdate): Observable<Discount> {
    return from(
      this.supabase.client
        .from('discounts')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Discount;
      }),
      catchError((err) => {
        console.error('[DiscountsService] update error:', err);
        return throwError(() => err as PostgrestError);
      })
    );
  }

  /**
   * Toggles only the `is_active` flag — always writable regardless of
   * referenced payments (the trigger only guards economic identity fields).
   */
  toggleActive(id: string, isActive: boolean): Observable<Discount> {
    return this.update(id, { is_active: isActive });
  }

  /**
   * Returns the count of payments that reference this discount.
   * Used to decide whether to disable immutable fields in the edit form.
   */
  countReferencingPayments(discountId: string): Observable<number> {
    return from(
      this.supabase.client
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('discount_id', discountId)
    ).pipe(
      map(({ count, error }) => {
        if (error) throw error;
        return count ?? 0;
      }),
      catchError((err) => {
        console.error('[DiscountsService] countReferencingPayments error:', err);
        return throwError(() => err as PostgrestError);
      })
    );
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private buildListQuery(filters?: { onlyActive?: boolean; type?: DiscountType }) {
    let query = this.supabase.client
      .from('discounts')
      .select(
        'id, code, description, type, value_type, percentage, amount_cop, is_active, created_by, created_at, updated_at'
      )
      .order('code', { ascending: true });

    if (filters?.onlyActive) {
      query = query.eq('is_active', true);
    }
    if (filters?.type) {
      query = query.eq('type', filters.type);
    }

    return query;
  }
}
