import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import {
  AddAdjustmentResult,
  CloseQuincenaResult,
  ClosureQuincena,
  DeleteAdjustmentResult,
  ListTrainersClosuresResult,
  MarkClosurePaidResult,
  PaymentMethod,
  ReopenQuincenaResult,
  TrainerClosureResult
} from '../models/closure.model';

@Injectable({ providedIn: 'root' })
export class ClosuresService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Calcula on-the-fly o devuelve el snapshot persistido para una quincena
   * de un trainer dado. EF: compute-trainer-closure.
   */
  computeTrainerClosure(
    trainerId: string,
    year: number,
    month: number,
    quincena: ClosureQuincena
  ): Observable<TrainerClosureResult> {
    return from(
      this.supabase.client.functions.invoke<TrainerClosureResult>(
        'compute-trainer-closure',
        {
          body: { trainer_id: trainerId, year, month, quincena }
        }
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía del servidor');
        return data;
      }),
      catchError((err) => {
        console.error('[ClosuresService] computeTrainerClosure error:', err);
        throw err;
      })
    );
  }

  /**
   * Lista todos los trainers activos con sus cierres de Q1 y Q2 para un mes.
   * Solo accesible para admin. EF: list-trainers-closures-for-month.
   */
  listTrainersClosuresForMonth(
    year: number,
    month: number
  ): Observable<ListTrainersClosuresResult> {
    return from(
      this.supabase.client.functions.invoke<ListTrainersClosuresResult>(
        'list-trainers-closures-for-month',
        {
          body: { year, month }
        }
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía del servidor');
        return data;
      }),
      catchError((err) => {
        console.error('[ClosuresService] listTrainersClosuresForMonth error:', err);
        throw err;
      })
    );
  }

  /**
   * Admin cierra una quincena persistiendo el snapshot.
   * EF: close-quincena.
   */
  closeQuincena(
    trainerId: string,
    year: number,
    month: number,
    quincena: ClosureQuincena
  ): Observable<CloseQuincenaResult> {
    return from(
      this.supabase.client.functions.invoke<CloseQuincenaResult>(
        'close-quincena',
        {
          body: { trainer_id: trainerId, year, month, quincena }
        }
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía del servidor');
        return data;
      }),
      catchError((err) => {
        console.error('[ClosuresService] closeQuincena error:', err);
        throw err;
      })
    );
  }

  /**
   * Admin reabre una quincena cerrada (status vuelve a open implícito).
   * Elimina snapshot, entradas y ajustes en cascada. EF: reopen-quincena.
   */
  reopenQuincena(closureId: string): Observable<ReopenQuincenaResult> {
    return from(
      this.supabase.client.functions.invoke<ReopenQuincenaResult>(
        'reopen-quincena',
        {
          body: { closure_id: closureId }
        }
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía del servidor');
        return data;
      }),
      catchError((err) => {
        console.error('[ClosuresService] reopenQuincena error:', err);
        throw err;
      })
    );
  }

  /**
   * Admin agrega una línea de ajuste a un cierre open o closed.
   * EF: add-closure-adjustment.
   */
  addClosureAdjustment(
    closureId: string,
    amountCop: number,
    reason: string
  ): Observable<AddAdjustmentResult> {
    return from(
      this.supabase.client.functions.invoke<AddAdjustmentResult>(
        'add-closure-adjustment',
        {
          body: { closure_id: closureId, amount_cop: amountCop, reason }
        }
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía del servidor');
        return data;
      }),
      catchError((err) => {
        console.error('[ClosuresService] addClosureAdjustment error:', err);
        throw err;
      })
    );
  }

  /**
   * Admin borra una línea de ajuste (solo si la quincena no está paid).
   * EF: delete-closure-adjustment.
   */
  deleteClosureAdjustment(adjustmentId: string): Observable<DeleteAdjustmentResult> {
    return from(
      this.supabase.client.functions.invoke<DeleteAdjustmentResult>(
        'delete-closure-adjustment',
        {
          body: { adjustment_id: adjustmentId }
        }
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía del servidor');
        return data;
      }),
      catchError((err) => {
        console.error('[ClosuresService] deleteClosureAdjustment error:', err);
        throw err;
      })
    );
  }

  /**
   * Admin marca un cierre cerrado como pagado al trainer.
   * EF: mark-closure-paid.
   */
  markClosurePaid(
    closureId: string,
    paymentDate: string,
    paymentMethod: PaymentMethod,
    notes: string | null
  ): Observable<MarkClosurePaidResult> {
    return from(
      this.supabase.client.functions.invoke<MarkClosurePaidResult>(
        'mark-closure-paid',
        {
          body: {
            closure_id: closureId,
            payment_date: paymentDate,
            payment_method: paymentMethod,
            notes
          }
        }
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía del servidor');
        return data;
      }),
      catchError((err) => {
        console.error('[ClosuresService] markClosurePaid error:', err);
        throw err;
      })
    );
  }
}
