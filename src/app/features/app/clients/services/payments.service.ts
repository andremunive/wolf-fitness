import { Injectable } from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import { Discount } from 'src/app/core/types/supabase';
import {
  NextPeriodStartResult,
  NextPeriodStartResponse,
  OpenPaymentInfo,
  RegisterPaymentPayload,
  RegisterPaymentResponse,
  RegisterInstallmentPayload,
  RegisterInstallmentResponse,
  EdgeFunctionError,
  SendReceiptSuccess
} from '../models/payment.model';

/**
 * Shape of the raw error body returned by all Edge Functions.
 * { error: { code, message, details } }
 */
interface EfErrorBody {
  error: EdgeFunctionError;
}

/**
 * Asynchronous error extractor for Edge Function errors.
 *
 * Why async: in recent versions of @supabase/supabase-js, FunctionsHttpError
 * carries the raw fetch Response in `context` instead of a pre-parsed object.
 * Reading the body requires `await response.json()`, so this helper is a Promise
 * that integrates cleanly into RxJS via `from(extractEfErrorAsync(...))`.
 */
async function extractEfErrorAsync(rawError: unknown): Promise<EdgeFunctionError> {
  if (rawError && typeof rawError === 'object') {
    const anyErr = rawError as Record<string, unknown>;

    // FunctionsHttpError: context is a native fetch Response object.
    if (anyErr['context'] instanceof Response) {
      try {
        // Clone before reading so the body stream is not consumed twice.
        const body = await (anyErr['context'] as Response).clone().json() as EfErrorBody;
        if (body?.error && typeof body.error === 'object') {
          return body.error as EdgeFunctionError;
        }
      } catch {
        // Body was not valid JSON — fall through to next heuristic.
      }
    }

    // Older SDK versions: context was already a parsed object.
    if (anyErr['context'] && typeof anyErr['context'] === 'object') {
      const ctx = anyErr['context'] as Record<string, unknown>;
      if (ctx['error'] && typeof ctx['error'] === 'object') {
        return ctx['error'] as EdgeFunctionError;
      }
    }

    // Sometimes the SDK surfaces the body directly on the error object.
    if (anyErr['error'] && typeof anyErr['error'] === 'object') {
      return anyErr['error'] as EdgeFunctionError;
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
export class PaymentsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Calls get-next-period-start and returns a discriminated result:
   *  - `next_period` → the client has no open payment; carries the suggestion.
   *  - `open_payment` → the client has an open payment; carries its id/period.
   */
  getNextPeriodStart(clientId: string): Observable<NextPeriodStartResult> {
    return from(
      this.supabase.client.functions.invoke<NextPeriodStartResponse>(
        'get-next-period-start',
        { body: { client_id: clientId } }
      )
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) {
          return from(extractEfErrorAsync(error)).pipe(
            switchMap((efErr) => {
              // OPEN_PAYMENT_EXISTS is not an error — it's a valid discriminated state.
              if (efErr.code === 'OPEN_PAYMENT_EXISTS') {
                const result: NextPeriodStartResult = {
                  type: 'open_payment' as const,
                  openPaymentId: efErr.details['open_payment_id'] as string,
                  openPeriodStart: efErr.details['open_period_start'] as string
                };
                return [result];
              }
              return throwError(() => efErr);
            })
          );
        }
        if (!data) {
          return throwError(() => ({ code: 'INTERNAL_ERROR', message: 'Empty response', details: {} }));
        }
        return [{ type: 'next_period' as const, data }];
      }),
      catchError((err) => {
        // If it was already a structured EF error, re-throw as-is.
        if (err && typeof err === 'object' && 'code' in err) {
          return throwError(() => err);
        }
        return efError$(err);
      })
    );
  }

  /**
   * Fetches the full payment row by id (PostgREST SELECT).
   * Used to load the open payment's balance when opening the installment modal.
   */
  getOpenPayment(paymentId: string): Observable<OpenPaymentInfo> {
    return from(
      this.supabase.client
        .from('payments')
        .select('id, period_start, period_end, plan_total_cop, discount_amount_cop, balance_cop, status')
        .eq('id', paymentId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as OpenPaymentInfo;
      }),
      catchError((err) => {
        console.error('[PaymentsService] getOpenPayment error:', err);
        return throwError(() => err);
      })
    );
  }

  registerPayment(payload: RegisterPaymentPayload): Observable<RegisterPaymentResponse> {
    return from(
      this.supabase.client.functions.invoke<RegisterPaymentResponse>(
        'register-payment',
        { body: payload }
      )
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) return efError$(error);
        if (!data) {
          return throwError(() => ({ code: 'INTERNAL_ERROR', message: 'Empty response', details: {} }));
        }
        return [data];
      }),
      catchError((err) => {
        if (err && typeof err === 'object' && 'code' in err) {
          return throwError(() => err);
        }
        return efError$(err);
      })
    );
  }

  registerInstallment(payload: RegisterInstallmentPayload): Observable<RegisterInstallmentResponse> {
    return from(
      this.supabase.client.functions.invoke<RegisterInstallmentResponse>(
        'register-installment',
        { body: payload }
      )
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) return efError$(error);
        if (!data) {
          return throwError(() => ({ code: 'INTERNAL_ERROR', message: 'Empty response', details: {} }));
        }
        return [data];
      }),
      catchError((err) => {
        if (err && typeof err === 'object' && 'code' in err) {
          return throwError(() => err);
        }
        return efError$(err);
      })
    );
  }

  /**
   * Calls send-payment-receipt to dispatch the email receipt for a paid payment.
   *
   * Must only be called when the payment has status = 'paid' (D2).
   * The forceResend flag should only be true when the admin explicitly requests
   * a re-send after the EF returned 'already_sent' (D3 / contract §6.3).
   */
  sendReceipt(paymentId: string, forceResend: boolean = false): Observable<SendReceiptSuccess> {
    return from(
      this.supabase.client.functions.invoke<SendReceiptSuccess>(
        'send-payment-receipt',
        { body: { payment_id: paymentId, force_resend: forceResend } }
      )
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) return efError$(error);
        if (!data) {
          return throwError(() => ({
            code: 'INTERNAL_ERROR',
            message: 'Empty response from send-payment-receipt',
            details: {}
          }));
        }
        return [data];
      }),
      catchError((err) => {
        if (err && typeof err === 'object' && 'code' in err) {
          return throwError(() => err);
        }
        return efError$(err);
      })
    );
  }

  /**
   * Loads all active discounts for the dropdown/autocomplete in the payment form.
   * PostgREST direct query — no Edge Function needed (per design doc §7.4).
   */
  getActiveDiscounts(): Observable<Discount[]> {
    return from(
      this.supabase.client
        .from('discounts')
        .select('id, code, description, percentage, is_active, created_by, created_at, updated_at')
        .eq('is_active', true)
        .order('code', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as Discount[];
      }),
      catchError((err) => {
        console.error('[PaymentsService] getActiveDiscounts error:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Convenience: detects whether the client has an open payment and, if so,
   * loads it — otherwise returns the next-period suggestion.
   * Returns an Observable that emits exactly once.
   */
  resolvePaymentFlow(clientId: string): Observable<
    | { flow: 'new_payment'; suggestedPeriodStart: string | null; isFirstPayment: boolean }
    | { flow: 'installment'; openPayment: OpenPaymentInfo }
  > {
    return this.getNextPeriodStart(clientId).pipe(
      switchMap((result) => {
        if (result.type === 'next_period') {
          return [
            {
              flow: 'new_payment' as const,
              suggestedPeriodStart: result.data.suggested_period_start,
              isFirstPayment: result.data.is_first_payment
            }
          ];
        }

        // Has an open payment → load its row.
        return this.getOpenPayment(result.openPaymentId).pipe(
          map((openPayment) => ({ flow: 'installment' as const, openPayment }))
        );
      })
    );
  }
}
