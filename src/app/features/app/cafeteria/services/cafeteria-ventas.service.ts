import { Injectable } from '@angular/core';
import { from as fromPromise, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import { ClientsService } from '../../clients/services/clients.service';
import {
  ActiveClient,
  CafeteriaComboPurchase,
  CafeteriaComboPurchaseWithDetails,
  CafeteriaComboWithProduct,
  CafeteriaInstallment,
  CafeteriaProduct,
  CafeteriaSale,
  CafeteriaSaleWithDetails,
  ClientActiveCombo,
  TrainerOption
} from '../models/cafeteria.model';
import {
  CafeteriaComboPurchaseView,
  CafeteriaCombosResult,
  CafeteriaSalesResult,
  CafeteriaSaleView
} from '../models/cafeteria-view.models';
import { localDateString } from 'src/app/shared/utils/date.utils';

/**
 * Acceso a datos de ventas individuales y compras de combo de cafetería,
 * incluyendo abonos, consumos y listas de compradores.
 */
@Injectable({
  providedIn: 'root'
})
export class CafeteriaVentasService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly clients: ClientsService
  ) {}

  // ─── Ventas individuales ───────────────────────────────────────────────────

  getSales(year: number, month: number): Observable<CafeteriaSalesResult> {
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDayDate = new Date(year, month, 0);
    const lastDay = localDateString(lastDayDate);

    return fromPromise(
      this.supabase.client
        .from('cafeteria_sales')
        .select(`
          *,
          product:cafeteria_products(name, size_label),
          client:clients!cafeteria_sales_client_id_fkey(id, profiles!clients_profiles_fkey(full_name)),
          trainer:profiles!cafeteria_sales_trainer_id_fkey(id, full_name)
        `)
        .gte('sale_date', firstDay)
        .lte('sale_date', lastDay)
        .eq('is_active', true)
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        const sales: CafeteriaSaleView[] = ((data ?? []) as unknown[]).map((row) => {
          const r = row as CafeteriaSale & {
            product: Pick<CafeteriaProduct, 'name' | 'size_label'> | null;
            client: { id: string; profiles: { full_name: string } | null } | null;
            trainer: { id: string; full_name: string } | null;
          };
          const base: CafeteriaSaleWithDetails = {
            ...r,
            client: r.client
              ? { id: r.client.id, full_name: r.client.profiles?.full_name ?? '' }
              : null
          };
          const total_cop =
            (base.product_price_snapshot_cop ?? 0) * (base.quantity ?? 1);
          const amount_received = base.amount_received_cop ?? 0;

          return {
            ...base,
            total_cop,
            progress_percent:
              total_cop > 0
                ? Math.min(100, Math.round((amount_received / total_cop) * 100))
                : 0,
            is_fully_paid: amount_received >= total_cop,
            buyer_name: base.client?.full_name ?? base.trainer?.full_name ?? '—',
            has_different_reg_date:
              !!base.sale_date &&
              !!base.reported_date &&
              base.sale_date !== base.reported_date
          } as CafeteriaSaleView;
        });

        const total_ingresos_cop = sales.reduce(
          (acc, s) => acc + (s.amount_received_cop ?? 0),
          0
        );
        const saldo_pendiente_cop = sales
          .filter((s) => s.status === 'pending' || s.status === 'partial')
          .reduce((acc, s) => acc + (s.balance_cop ?? 0), 0);

        return {
          sales,
          summary: {
            total_ingresos_cop,
            count: sales.length,
            saldo_pendiente_cop
          }
        } as CafeteriaSalesResult;
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] getSales error:', err);
        throw err;
      })
    );
  }

  createSale(data: {
    sale_date: string;
    product_id: string;
    quantity: number;
    buyer_type: 'client' | 'trainer';
    client_id?: string;
    trainer_id?: string;
    amount_received_cop: number;
    payment_method?: 'cash' | 'transfer' | 'nequi' | 'other';
    notes?: string;
  }): Observable<CafeteriaSale> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return fromPromise(
          this.supabase.client
            .from('cafeteria_products')
            .select('price_cop')
            .eq('id', data.product_id)
            .single()
        ).pipe(
          map(({ data: productRow, error }) => {
            if (error) throw error;
            const snapshot = (productRow as { price_cop: number }).price_cop;
            const total = snapshot * data.quantity;
            const received = data.amount_received_cop;
            const balance = Math.max(0, total - received);
            const status =
              received === 0 ? 'pending' : received >= total ? 'paid' : 'partial';
            return { snapshot, total, balance, status, userId };
          }),
          switchMap(({ snapshot, balance, status, userId: uid }) =>
            fromPromise(
              this.supabase.client
                .from('cafeteria_sales')
                .insert({
                  sale_date: data.sale_date,
                  product_id: data.product_id,
                  quantity: data.quantity,
                  buyer_type: data.buyer_type,
                  client_id: data.client_id ?? null,
                  trainer_id: data.trainer_id ?? null,
                  product_price_snapshot_cop: snapshot,
                  amount_received_cop: data.amount_received_cop,
                  balance_cop: balance,
                  status,
                  payment_method: data.payment_method ?? null,
                  notes: data.notes ?? null,
                  created_by: uid
                })
                .select('*')
                .single()
            ).pipe(
              map(({ data: sale, error }) => {
                if (error) throw error;
                return sale as CafeteriaSale;
              })
            )
          )
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] createSale error:', err);
        throw err;
      })
    );
  }

  createInstallment(
    saleId: string,
    data: {
      amount_cop: number;
      payment_date: string;
      payment_method: 'cash' | 'transfer' | 'nequi' | 'other';
      notes?: string;
    }
  ): Observable<{ installment: CafeteriaInstallment; sale: CafeteriaSale }> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        // Paso 1: leer sale actual antes del INSERT del installment.
        return fromPromise(
          this.supabase.client
            .from('cafeteria_sales')
            .select('amount_received_cop, balance_cop, product_price_snapshot_cop, quantity')
            .eq('id', saleId)
            .single()
        ).pipe(
          map(({ data: currentSale, error }) => {
            if (error) throw error;
            const sale = currentSale as {
              amount_received_cop: number;
              balance_cop: number;
              product_price_snapshot_cop: number;
              quantity: number;
            };
            const newReceived = sale.amount_received_cop + data.amount_cop;
            const total = sale.product_price_snapshot_cop * sale.quantity;
            const newBalance = Math.max(0, total - newReceived);
            const newStatus =
              newBalance <= 0 ? 'paid' : newReceived > 0 ? 'partial' : 'pending';
            return { newReceived, newBalance, newStatus, userId };
          }),
          // Paso 2: INSERT installment.
          switchMap(({ newReceived, newBalance, newStatus, userId: uid }) =>
            fromPromise(
              this.supabase.client
                .from('cafeteria_installments')
                .insert({
                  sale_id: saleId,
                  amount_cop: data.amount_cop,
                  payment_date: data.payment_date,
                  payment_method: data.payment_method,
                  notes: data.notes ?? null,
                  created_by: uid
                })
                .select('*')
                .single()
            ).pipe(
              map(({ data: installment, error }) => {
                if (error) throw error;
                return {
                  installment: installment as CafeteriaInstallment,
                  newReceived,
                  newBalance,
                  newStatus,
                  uid
                };
              })
            )
          ),
          // Paso 3: UPDATE sale con los valores calculados.
          switchMap(({ installment, newReceived, newBalance, newStatus, uid }) =>
            fromPromise(
              this.supabase.client
                .from('cafeteria_sales')
                .update({
                  amount_received_cop: newReceived,
                  balance_cop: newBalance,
                  status: newStatus,
                  updated_by: uid
                })
                .eq('id', saleId)
                .select('*')
                .single()
            ).pipe(
              map(({ data: updatedSale, error }) => {
                if (error) throw error;
                return {
                  installment,
                  sale: updatedSale as CafeteriaSale
                };
              })
            )
          )
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] createInstallment error:', err);
        throw err;
      })
    );
  }

  getSaleInstallments(saleId: string): Observable<CafeteriaInstallment[]> {
    return fromPromise(
      this.supabase.client
        .from('cafeteria_installments')
        .select('*')
        .eq('sale_id', saleId)
        .is('voided_at', null)
        .order('payment_date', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as CafeteriaInstallment[];
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] getSaleInstallments error:', err);
        throw err;
      })
    );
  }

  getActiveClients(): Observable<ActiveClient[]> {
    return fromPromise(
      this.supabase.client
        .from('clients')
        .select('id, profiles!clients_profiles_fkey(full_name)')
        .eq('status', 'active')
        .order('id', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return ((data ?? []) as unknown[]).map((row) => {
          const r = row as { id: string; profiles: { full_name: string } | null };
          return { id: r.id, full_name: r.profiles?.full_name ?? '' };
        });
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] getActiveClients error:', err);
        throw err;
      })
    );
  }

  getTrainers(): Observable<TrainerOption[]> {
    return this.clients.getActiveTrainers().pipe(
      map((trainers) => trainers.map((t) => ({ id: t.id, full_name: t.fullName }))),
      catchError((err) => {
        console.error('[CafeteriaVentasService] getTrainers error:', err);
        throw err;
      })
    );
  }

  /** Todos los clientes (cualquier status) para el buscador de deudores. */
  getAllClientsForSearch(): Observable<{ id: string; full_name: string }[]> {
    return fromPromise(
      this.supabase.client
        .from('clients')
        .select('id, profiles!clients_profiles_fkey(full_name)')
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return ((data ?? []) as unknown[])
          .map((row) => {
            const r = row as { id: string; profiles: { full_name: string } | null };
            return { id: r.id, full_name: r.profiles?.full_name ?? '' };
          })
          .filter((c) => c.full_name.length > 0)
          .sort((a, b) => a.full_name.localeCompare(b.full_name));
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] getAllClientsForSearch error:', err);
        throw err;
      })
    );
  }

  /** Todos los entrenadores (cualquier status) para el buscador de deudores. */
  getAllTrainersForSearch(): Observable<{ id: string; full_name: string }[]> {
    return fromPromise(
      this.supabase.client
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'trainer')
        .order('full_name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return ((data ?? []) as { id: string; full_name: string | null }[])
          .map((r) => ({ id: r.id, full_name: r.full_name ?? '' }))
          .filter((t) => t.full_name.length > 0);
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] getAllTrainersForSearch error:', err);
        throw err;
      })
    );
  }

  /**
   * Trae TODAS las ventas individuales pendientes o parciales de una persona
   * a lo largo del histórico (sin filtro de mes).
   */
  getPendingSalesByPerson(
    personId: string,
    personType: 'client' | 'trainer'
  ): Observable<CafeteriaSaleView[]> {
    const column = personType === 'client' ? 'client_id' : 'trainer_id';

    return fromPromise(
      this.supabase.client
        .from('cafeteria_sales')
        .select(`
          *,
          product:cafeteria_products(name, size_label),
          client:clients!cafeteria_sales_client_id_fkey(id, profiles!clients_profiles_fkey(full_name)),
          trainer:profiles!cafeteria_sales_trainer_id_fkey(id, full_name)
        `)
        .eq(column, personId)
        .eq('is_active', true)
        .in('status', ['pending', 'partial'])
        .order('sale_date', { ascending: false })
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return ((data ?? []) as unknown[]).map((row) => {
          const r = row as CafeteriaSale & {
            product: Pick<CafeteriaProduct, 'name' | 'size_label'> | null;
            client: { id: string; profiles: { full_name: string } | null } | null;
            trainer: { id: string; full_name: string } | null;
          };
          const base: CafeteriaSaleWithDetails = {
            ...r,
            client: r.client
              ? { id: r.client.id, full_name: r.client.profiles?.full_name ?? '' }
              : null
          };
          const total_cop =
            (base.product_price_snapshot_cop ?? 0) * (base.quantity ?? 1);
          const amount_received = base.amount_received_cop ?? 0;

          return {
            ...base,
            total_cop,
            progress_percent:
              total_cop > 0
                ? Math.min(100, Math.round((amount_received / total_cop) * 100))
                : 0,
            is_fully_paid: amount_received >= total_cop,
            buyer_name: base.client?.full_name ?? base.trainer?.full_name ?? '—',
            has_different_reg_date:
              !!base.sale_date &&
              !!base.reported_date &&
              base.sale_date !== base.reported_date
          } as CafeteriaSaleView;
        });
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] getPendingSalesByPerson error:', err);
        throw err;
      })
    );
  }

  // ─── Compras de combo ──────────────────────────────────────────────────────

  getComboPurchases(year: number, month: number): Observable<CafeteriaCombosResult> {
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDayDate = new Date(year, month, 0);
    const lastDay = localDateString(lastDayDate);

    return fromPromise(
      this.supabase.client
        .from('cafeteria_combo_purchases')
        .select(`
          *,
          combo:cafeteria_combos(
            id, name, quantity,
            product:cafeteria_products(name, size_label)
          ),
          client:clients!cafeteria_combo_purchases_client_id_fkey(
            id,
            profiles!clients_profiles_fkey(full_name)
          ),
          trainer:profiles!cafeteria_combo_purchases_trainer_id_fkey(id, full_name)
        `)
        .gte('purchase_date', firstDay)
        .lte('purchase_date', lastDay)
        .eq('is_active', true)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        const purchases: CafeteriaComboPurchaseView[] = ((data ?? []) as unknown[]).map((row) => {
          const r = row as CafeteriaComboPurchase & {
            combo: {
              id: string;
              name: string;
              quantity: number;
              product: Pick<CafeteriaProduct, 'name' | 'size_label'> | null;
            } | null;
            client: { id: string; profiles: { full_name: string } | null } | null;
            trainer: { id: string; full_name: string } | null;
          };
          const base: CafeteriaComboPurchaseWithDetails = {
            ...r,
            client: r.client
              ? { id: r.client.id, full_name: r.client.profiles?.full_name ?? '' }
              : null
          };
          const totalUnits = base.total_units ?? 0;
          const unitsConsumed = base.units_consumed ?? 0;
          const comboPrice = base.combo_price_snapshot_cop ?? 0;
          const amountReceived = base.amount_received_cop ?? 0;

          return {
            ...base,
            buyer_name: base.client?.full_name ?? base.trainer?.full_name ?? '—',
            consumption_percent:
              totalUnits > 0
                ? Math.min(100, Math.round((unitsConsumed / totalUnits) * 100))
                : 0,
            payment_percent:
              comboPrice > 0
                ? Math.min(100, Math.round((amountReceived / comboPrice) * 100))
                : 0
          } as CafeteriaComboPurchaseView;
        });

        const total_ingresos_cop = purchases.reduce(
          (acc, p) => acc + (p.amount_received_cop ?? 0),
          0
        );
        const saldo_pendiente_cop = purchases
          .filter((p) => p.status === 'pending' || p.status === 'partial')
          .reduce((acc, p) => acc + (p.balance_cop ?? 0), 0);

        return {
          purchases,
          summary: {
            total_ingresos_cop,
            count: purchases.length,
            saldo_pendiente_cop
          }
        } as CafeteriaCombosResult;
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] getComboPurchases error:', err);
        throw err;
      })
    );
  }

  getActiveComboByClient(clientId: string, productId: string): Observable<CafeteriaComboPurchase | null> {
    return fromPromise(
      this.supabase.client
        .from('cafeteria_combo_purchases')
        .select('*, combo:cafeteria_combos!inner(product_id)')
        .eq('client_id', clientId)
        .eq('is_completed', false)
        .eq('is_active', true)
        .eq('combo.product_id', productId)
        .limit(1)
        .maybeSingle()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) return null;
        const { combo: _combo, ...rest } = data as CafeteriaComboPurchase & { combo: unknown };
        return rest as CafeteriaComboPurchase;
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] getActiveComboByClient error:', err);
        throw err;
      })
    );
  }

  getClientActiveCombos(clientId: string): Observable<ClientActiveCombo[]> {
    return fromPromise(
      this.supabase.client
        .from('cafeteria_combo_purchases')
        .select(`
          *,
          combo:cafeteria_combos(
            id, name, quantity,
            product:cafeteria_products(name, size_label)
          )
        `)
        .eq('client_id', clientId)
        .eq('is_completed', false)
        .eq('is_active', true)
        .order('purchase_date', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as ClientActiveCombo[];
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] getClientActiveCombos error:', err);
        throw err;
      })
    );
  }

  createComboPurchase(data: {
    purchase_date: string;
    combo_id: string;
    buyer_type: 'client' | 'trainer';
    client_id?: string;
    trainer_id?: string;
    amount_received_cop: number;
    payment_method?: 'cash' | 'transfer' | 'nequi' | 'other';
  }): Observable<CafeteriaComboPurchase> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return fromPromise(
          this.supabase.client
            .from('cafeteria_combos')
            .select('price_cop, quantity, product_id')
            .eq('id', data.combo_id)
            .single()
        ).pipe(
          map(({ data: comboRow, error }) => {
            if (error) throw error;
            const c = comboRow as { price_cop: number; quantity: number; product_id: string };
            return { combo: c, uid: userId };
          }),
          switchMap(({ combo, uid }) => {
            if (data.buyer_type === 'client' && data.client_id) {
              return this.getActiveComboByClient(data.client_id, combo.product_id).pipe(
                map((existing) => {
                  if (existing) {
                    throw new Error(
                      'Este cliente ya tiene un combo activo de este producto. Debe completarlo antes de comprar otro.'
                    );
                  }
                  return { combo, uid };
                })
              );
            }
            return of({ combo, uid });
          }),
          switchMap(({ combo, uid }: { combo: { price_cop: number; quantity: number; product_id: string }; uid: string }) => {
            const received = data.amount_received_cop;
            const balance = Math.max(0, combo.price_cop - received);
            const status =
              received === 0 ? 'pending' : received >= combo.price_cop ? 'paid' : 'partial';

            return fromPromise(
              this.supabase.client
                .from('cafeteria_combo_purchases')
                .insert({
                  purchase_date: data.purchase_date,
                  combo_id: data.combo_id,
                  buyer_type: data.buyer_type,
                  client_id: data.client_id ?? null,
                  trainer_id: data.trainer_id ?? null,
                  combo_price_snapshot_cop: combo.price_cop,
                  total_units: combo.quantity,
                  amount_received_cop: received,
                  balance_cop: balance,
                  status,
                  payment_method: data.payment_method ?? null,
                  created_by: uid
                })
                .select('*')
                .single()
            ).pipe(
              map(({ data: purchase, error }) => {
                if (error) throw error;
                return purchase as CafeteriaComboPurchase;
              })
            );
          })
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] createComboPurchase error:', err);
        throw err;
      })
    );
  }

  registerComboConsumption(comboPurchaseId: string): Observable<CafeteriaComboPurchase> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return fromPromise(
          this.supabase.client
            .from('cafeteria_combo_consumptions')
            .insert({
              combo_purchase_id: comboPurchaseId,
              registered_by: userId
            })
        ).pipe(
          map(({ error }) => {
            if (error) throw error;
          }),
          switchMap(() =>
            fromPromise(
              this.supabase.client
                .from('cafeteria_combo_purchases')
                .select('*')
                .eq('id', comboPurchaseId)
                .single()
            ).pipe(
              map(({ data: purchase, error }) => {
                if (error) throw error;
                return purchase as CafeteriaComboPurchase;
              })
            )
          )
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] registerComboConsumption error:', err);
        throw err;
      })
    );
  }

  createComboPurchaseInstallment(
    purchaseId: string,
    data: {
      amount_cop: number;
      payment_date: string;
      payment_method: 'cash' | 'transfer' | 'nequi' | 'other';
      notes?: string;
    }
  ): Observable<{ installment: CafeteriaInstallment; purchase: CafeteriaComboPurchase }> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return fromPromise(
          this.supabase.client
            .from('cafeteria_combo_purchases')
            .select('amount_received_cop, combo_price_snapshot_cop')
            .eq('id', purchaseId)
            .single()
        ).pipe(
          map(({ data: currentPurchase, error }) => {
            if (error) throw error;
            const p = currentPurchase as {
              amount_received_cop: number;
              combo_price_snapshot_cop: number;
            };
            const newReceived = p.amount_received_cop + data.amount_cop;
            const newBalance = Math.max(0, p.combo_price_snapshot_cop - newReceived);
            const newStatus =
              newBalance <= 0 ? 'paid' : newReceived > 0 ? 'partial' : 'pending';
            return { newReceived, newBalance, newStatus, userId };
          }),
          switchMap(({ newReceived, newBalance, newStatus, userId: uid }) =>
            fromPromise(
              this.supabase.client
                .from('cafeteria_installments')
                .insert({
                  combo_purchase_id: purchaseId,
                  sale_id: null,
                  amount_cop: data.amount_cop,
                  payment_date: data.payment_date,
                  payment_method: data.payment_method,
                  notes: data.notes ?? null,
                  created_by: uid
                })
                .select('*')
                .single()
            ).pipe(
              map(({ data: installment, error }) => {
                if (error) throw error;
                return {
                  installment: installment as CafeteriaInstallment,
                  newReceived,
                  newBalance,
                  newStatus,
                  uid
                };
              })
            )
          ),
          switchMap(({ installment, newReceived, newBalance, newStatus, uid }) =>
            fromPromise(
              this.supabase.client
                .from('cafeteria_combo_purchases')
                .update({
                  amount_received_cop: newReceived,
                  balance_cop: newBalance,
                  status: newStatus,
                  updated_by: uid
                })
                .eq('id', purchaseId)
                .select('*')
                .single()
            ).pipe(
              map(({ data: updatedPurchase, error }) => {
                if (error) throw error;
                return {
                  installment,
                  purchase: updatedPurchase as CafeteriaComboPurchase
                };
              })
            )
          )
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] createComboPurchaseInstallment error:', err);
        throw err;
      })
    );
  }

  getComboConsumptions(purchaseId: string): Observable<Array<{
    id: string;
    consumed_at: string;
    registered_by: string;
    registered_by_name: string | null;
  }>> {
    return fromPromise(
      this.supabase.client
        .from('cafeteria_combo_consumptions')
        .select('*, registered_by_profile:profiles(full_name)')
        .eq('combo_purchase_id', purchaseId)
        .order('consumed_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return ((data ?? []) as unknown[]).map((row) => {
          const r = row as {
            id: string;
            consumed_at: string;
            registered_by: string;
            registered_by_profile: { full_name: string } | null;
          };
          return {
            id: r.id,
            consumed_at: r.consumed_at,
            registered_by: r.registered_by,
            registered_by_name: r.registered_by_profile?.full_name ?? null
          };
        });
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] getComboConsumptions error:', err);
        throw err;
      })
    );
  }

  getComboPurchaseInstallments(purchaseId: string): Observable<CafeteriaInstallment[]> {
    return fromPromise(
      this.supabase.client
        .from('cafeteria_installments')
        .select('*')
        .eq('combo_purchase_id', purchaseId)
        .is('voided_at', null)
        .order('payment_date', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as CafeteriaInstallment[];
      }),
      catchError((err) => {
        console.error('[CafeteriaVentasService] getComboPurchaseInstallments error:', err);
        throw err;
      })
    );
  }
}
