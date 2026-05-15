import { Injectable } from '@angular/core';
import { from as fromPromise, Observable } from 'rxjs';
import { catchError, map, switchMap, take } from 'rxjs/operators';

import { AuthService } from 'src/app/core/services/auth.service';
import { SupabaseService } from 'src/app/core/services/supabase.service';
import {
  CreateLoanInput,
  CreateLoanPaymentInput,
  Loan,
  LoanPayment,
  LoanRow,
  UpdateLoanInput,
  mapLoanRow
} from '../models/prestamo.model';

/**
 * PostgREST select string shared by all loan queries.
 * Includes embedded trainer profile, provider, and the creator's profile
 * so we can display "Registrado por" in the detail modal.
 */
const LOAN_SELECT =
  '*, trainer:profiles!loans_trainer_id_fkey(id, full_name), provider:service_providers(id, name), created_by_profile:profiles!loans_created_by_fkey(id, full_name)';

@Injectable({ providedIn: 'root' })
export class PrestamosService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auth: AuthService
  ) {}

  /**
   * Returns all active loans ordered by loan_date DESC.
   * Includes embedded trainer profile and provider via PostgREST JOINs.
   * Computes `saldo_cop` and `beneficiary_label` on the client side.
   */
  getActiveLoans(): Observable<Loan[]> {
    return fromPromise(
      this.supabase.client
        .from('loans')
        .select(LOAN_SELECT)
        .eq('status', 'active')
        .order('loan_date', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return ((data ?? []) as unknown as LoanRow[]).map(mapLoanRow);
      }),
      catchError((err) => {
        console.error('[PrestamosService] getActiveLoans error:', err);
        throw err;
      })
    );
  }

  /**
   * Returns all closed loans ordered by closed_at DESC.
   * Includes embedded trainer profile and provider via PostgREST JOINs.
   */
  getClosedLoans(): Observable<Loan[]> {
    return fromPromise(
      this.supabase.client
        .from('loans')
        .select(LOAN_SELECT)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return ((data ?? []) as unknown as LoanRow[]).map(mapLoanRow);
      }),
      catchError((err) => {
        console.error('[PrestamosService] getClosedLoans error:', err);
        throw err;
      })
    );
  }

  /**
   * Returns all payments for a given loan, ordered by payment_date ASC.
   */
  getLoanPayments(loanId: string): Observable<LoanPayment[]> {
    return fromPromise(
      this.supabase.client
        .from('loan_payments')
        .select('id, loan_id, amount_cop, payment_date, payment_method, notes, created_at')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as unknown as LoanPayment[];
      }),
      catchError((err) => {
        console.error('[PrestamosService] getLoanPayments error:', err);
        throw err;
      })
    );
  }

  /**
   * Creates a new loan and returns the full row with relations mapped.
   * Reads the current user's profile id from AuthService.
   */
  createLoan(data: CreateLoanInput): Observable<Loan> {
    return this.auth.profile$.pipe(
      take(1),
      switchMap((profile) => {
        const userId = profile?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return fromPromise(
          this.supabase.client
            .from('loans')
            .insert({
              ...data,
              created_by: userId
            })
            .select(LOAN_SELECT)
            .single()
        );
      }),
      map(({ data: row, error }: { data: unknown; error: unknown }) => {
        if (error) throw error;
        return mapLoanRow(row as LoanRow);
      }),
      catchError((err) => {
        console.error('[PrestamosService] createLoan error:', err);
        throw err;
      })
    );
  }

  /**
   * Updates an active loan by id and returns the updated row with relations mapped.
   * Only active loans can be edited (guarded at the client level).
   */
  updateLoan(id: string, data: UpdateLoanInput): Observable<Loan> {
    return this.auth.profile$.pipe(
      take(1),
      switchMap((profile) => {
        const userId = profile?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return fromPromise(
          this.supabase.client
            .from('loans')
            .update({ ...data, updated_by: userId })
            .eq('id', id)
            .eq('status', 'active')
            .select(LOAN_SELECT)
            .single()
        );
      }),
      map(({ data: row, error }: { data: unknown; error: unknown }) => {
        if (error) throw error;
        return mapLoanRow(row as LoanRow);
      }),
      catchError((err) => {
        console.error('[PrestamosService] updateLoan error:', err);
        throw err;
      })
    );
  }

  /**
   * Closes an active loan.
   *
   * 'normal' → no loss recorded (profit if overpaid).
   * 'forced' → saldo pendiente queda registrado como pérdida.
   *
   * Reads the current loan state via getLoanById before updating so we can
   * compute profit_cop / loss_cop client-side before writing.
   */
  closeLoan(id: string, type: 'normal' | 'forced'): Observable<Loan> {
    return this.auth.profile$.pipe(
      take(1),
      switchMap((profile) => {
        const userId = profile?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return this.getLoanById(id).pipe(
          switchMap((current) => {
            const profit = Math.max(0, current.total_paid_cop - current.amount_cop);
            const loss = type === 'forced'
              ? Math.max(0, current.amount_cop - current.total_paid_cop)
              : 0;

            return fromPromise(
              this.supabase.client
                .from('loans')
                .update({
                  status: 'closed',
                  closed_at: new Date().toISOString(),
                  closed_by: userId,
                  closure_type: type,
                  profit_cop: profit,
                  loss_cop: loss,
                  updated_by: userId
                })
                .eq('id', id)
                .eq('status', 'active')
                .select(LOAN_SELECT)
                .single()
            );
          })
        );
      }),
      map(({ data: row, error }: { data: unknown; error: unknown }) => {
        if (error) throw error;
        return mapLoanRow(row as LoanRow);
      }),
      catchError((err) => {
        console.error('[PrestamosService] closeLoan error:', err);
        throw err;
      })
    );
  }

  /**
   * Returns all active trainers ordered by full_name ASC.
   * Profiles with role='trainer' and is_active=true.
   */
  getTrainers(): Observable<{ id: string; full_name: string }[]> {
    return fromPromise(
      this.supabase.client
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'trainer')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as { id: string; full_name: string }[];
      }),
      catchError((err) => {
        console.error('[PrestamosService] getTrainers error:', err);
        throw err;
      })
    );
  }

  /**
   * Returns all non-deleted service providers ordered by name ASC.
   * service_providers uses soft-delete (deleted_at IS NULL = active).
   */
  getProviders(): Observable<{ id: string; name: string }[]> {
    return fromPromise(
      this.supabase.client
        .from('service_providers')
        .select('id, name')
        .is('deleted_at', null)
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as { id: string; name: string }[];
      }),
      catchError((err) => {
        console.error('[PrestamosService] getProviders error:', err);
        throw err;
      })
    );
  }

  /**
   * Fetches a single loan by id with full relations mapped.
   * Used to refresh the detail modal after a payment is created.
   */
  getLoanById(id: string): Observable<Loan> {
    return fromPromise(
      this.supabase.client
        .from('loans')
        .select(LOAN_SELECT)
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return mapLoanRow(data as unknown as LoanRow);
      }),
      catchError((err) => {
        console.error('[PrestamosService] getLoanById error:', err);
        throw err;
      })
    );
  }

  /**
   * Inserts a payment row for the given loan and returns the created row.
   * Does NOT touch total_paid_cop — the DB trigger handles that.
   * Reads created_by from the authenticated user's profile.
   */
  createLoanPayment(loanId: string, data: CreateLoanPaymentInput): Observable<LoanPayment> {
    return this.auth.profile$.pipe(
      take(1),
      switchMap((profile) => {
        const userId = profile?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return fromPromise(
          this.supabase.client
            .from('loan_payments')
            .insert({
              loan_id: loanId,
              amount_cop: data.amount_cop,
              payment_date: data.payment_date,
              payment_method: data.payment_method,
              notes: data.notes ?? null,
              created_by: userId
            })
            .select('*')
            .single()
        );
      }),
      map(({ data: row, error }: { data: unknown; error: unknown }) => {
        if (error) throw error;
        return row as LoanPayment;
      }),
      catchError((err) => {
        console.error('[PrestamosService] createLoanPayment error:', err);
        throw err;
      })
    );
  }
}
