import { Injectable } from '@angular/core';
import { from as fromPromise, forkJoin, Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import { ClientsService } from '../../clients/services/clients.service';
import {
  ActiveClient,
  CafeteriaCombo,
  CafeteriaComboPurchase,
  CafeteriaComboPurchaseWithDetails,
  CafeteriaComboWithProduct,
  CafeteriaConsolidation,
  CafeteriaConsolidationPreview,
  CafeteriaConsolidationWithUser,
  CafeteriaDashboardData,
  CafeteriaExpense,
  CafeteriaExpenseCategory,
  CafeteriaExpenseWithDetails,
  CafeteriaInstallment,
  CafeteriaProduct,
  CafeteriaProductPriceHistory,
  CafeteriaSale,
  CafeteriaSaleWithDetails,
  ClientActiveCombo,
  TrainerOption
} from '../models/cafeteria.model';

/**
 * Servicio de acceso a datos para el catálogo de productos de cafetería
 * y su historial de precios.
 *
 * RLS: solo usuarios con rol `admin` pueden leer/escribir estas tablas.
 */
@Injectable({
  providedIn: 'root'
})
export class CafeteriaService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly clients: ClientsService
  ) {}

  // ─── Productos ─────────────────────────────────────────────────────────────

  /** Devuelve todos los productos ordenados: activos primero, luego por nombre. */
  getProducts(): Observable<CafeteriaProduct[]> {
    return fromPromise(
      this.supabase.client
        .from('cafeteria_products')
        .select('*')
        .order('is_active', { ascending: false })
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as CafeteriaProduct[];
      }),
      catchError((err) => {
        console.error('[CafeteriaService] getProducts error:', err);
        throw err;
      })
    );
  }

  /**
   * Crea un producto y registra su precio inicial en el historial.
   *
   * Secuencia:
   * 1. Obtiene el userId del usuario autenticado.
   * 2. INSERT en `cafeteria_products`.
   * 3. INSERT en `cafeteria_product_price_history` con valid_from = hoy y valid_until = null.
   *
   * Si el paso 3 falla, el producto queda creado sin entrada de historial.
   * Se reporta el error vía `throwError` y se loguea el id huérfano en consola.
   */
  createProduct(data: {
    name: string;
    size_label: string;
    price_cop: number;
  }): Observable<CafeteriaProduct> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return fromPromise(
          this.supabase.client
            .from('cafeteria_products')
            .insert({
              name: data.name,
              size_label: data.size_label,
              price_cop: data.price_cop,
              created_by: userId
            })
            .select('*')
            .single()
        ).pipe(
          map(({ data: product, error }) => {
            if (error) throw error;
            return { product: product as CafeteriaProduct, userId };
          }),
          switchMap(({ product, userId: uid }) =>
            fromPromise(
              this.supabase.client
                .from('cafeteria_product_price_history')
                .insert({
                  product_id: product.id,
                  price_cop: data.price_cop,
                  valid_from: this.localDateString(new Date()),
                  valid_until: null,
                  created_by: uid
                })
            ).pipe(
              map(({ error }) => {
                if (error) {
                  console.error(
                    `[CafeteriaService] createProduct: historial de precio falló para producto huérfano id=${product.id}`,
                    error
                  );
                  throw error;
                }
                return product;
              })
            )
          )
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaService] createProduct error:', err);
        throw err;
      })
    );
  }

  /**
   * Actualiza campos no-precio de un producto.
   * `price_cop` no está permitido en `data` — para cambiar precio usar `updatePrice`.
   */
  updateProduct(
    id: string,
    data: { name?: string; size_label?: string; is_active?: boolean }
  ): Observable<CafeteriaProduct> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        const patch: { name?: string; size_label?: string; is_active?: boolean; updated_by: string } = {
          updated_by: userId
        };
        if (data.name !== undefined) patch.name = data.name;
        if (data.size_label !== undefined) patch.size_label = data.size_label;
        if (data.is_active !== undefined) patch.is_active = data.is_active;

        return fromPromise(
          this.supabase.client
            .from('cafeteria_products')
            .update(patch)
            .eq('id', id)
            .select('*')
            .single()
        ).pipe(
          map(({ data: product, error }) => {
            if (error) throw error;
            return product as CafeteriaProduct;
          })
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaService] updateProduct error:', err);
        throw err;
      })
    );
  }

  /**
   * Cambia el precio vigente de un producto.
   *
   * Secuencia:
   * 1. Cierra el registro de precio actual (valid_until = ayer).
   * 2. Inserta el nuevo precio (valid_from = hoy, valid_until = null).
   * 3. Actualiza price_cop en cafeteria_products.
   * 4. Devuelve el producto actualizado.
   *
   * Si algún paso falla, lanza error. No hay rollback automático desde cliente.
   */
  updatePrice(id: string, newPrice: number): Observable<CafeteriaProduct> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        // Paso 1: cerrar precio anterior
        return fromPromise(
          this.supabase.client
            .from('cafeteria_product_price_history')
            .update({ valid_until: this.localDateString(yesterday) })
            .eq('product_id', id)
            .is('valid_until', null)
        ).pipe(
          map(({ error }) => {
            if (error) throw error;
          }),
          // Paso 2: insertar nuevo precio
          switchMap(() =>
            fromPromise(
              this.supabase.client
                .from('cafeteria_product_price_history')
                .insert({
                  product_id: id,
                  price_cop: newPrice,
                  valid_from: this.localDateString(today),
                  valid_until: null,
                  created_by: userId
                })
            ).pipe(
              map(({ error }) => {
                if (error) throw error;
              })
            )
          ),
          // Paso 3 + 4: actualizar producto y devolver fila
          switchMap(() =>
            fromPromise(
              this.supabase.client
                .from('cafeteria_products')
                .update({ price_cop: newPrice, updated_by: userId })
                .eq('id', id)
                .select('*')
                .single()
            ).pipe(
              map(({ data: product, error }) => {
                if (error) throw error;
                return product as CafeteriaProduct;
              })
            )
          )
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaService] updatePrice error:', err);
        throw err;
      })
    );
  }

  /** Devuelve el historial de precios de un producto, ordenado del más reciente al más antiguo. */
  getPriceHistory(productId: string): Observable<CafeteriaProductPriceHistory[]> {
    return fromPromise(
      this.supabase.client
        .from('cafeteria_product_price_history')
        .select('*')
        .eq('product_id', productId)
        .order('valid_from', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as CafeteriaProductPriceHistory[];
      }),
      catchError((err) => {
        console.error('[CafeteriaService] getPriceHistory error:', err);
        throw err;
      })
    );
  }

  /** Activa o desactiva un producto. */
  toggleProduct(id: string, isActive: boolean): Observable<CafeteriaProduct> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return fromPromise(
          this.supabase.client
            .from('cafeteria_products')
            .update({ is_active: isActive, updated_by: userId })
            .eq('id', id)
            .select('*')
            .single()
        ).pipe(
          map(({ data: product, error }) => {
            if (error) throw error;
            return product as CafeteriaProduct;
          })
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaService] toggleProduct error:', err);
        throw err;
      })
    );
  }

  // ─── Combos ────────────────────────────────────────────────────────────────

  getCombos(): Observable<CafeteriaComboWithProduct[]> {
    return fromPromise(
      this.supabase.client
        .from('cafeteria_combos')
        .select('*, product:cafeteria_products(name, size_label, price_cop)')
        .order('is_active', { ascending: false })
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as CafeteriaComboWithProduct[];
      }),
      catchError((err) => {
        console.error('[CafeteriaService] getCombos error:', err);
        throw err;
      })
    );
  }

  createCombo(data: {
    name: string;
    product_id: string;
    quantity: number;
    price_cop: number;
  }): Observable<CafeteriaCombo> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return fromPromise(
          this.supabase.client
            .from('cafeteria_combos')
            .insert({
              name: data.name,
              product_id: data.product_id,
              quantity: data.quantity,
              price_cop: data.price_cop,
              created_by: userId
            })
            .select('*')
            .single()
        ).pipe(
          map(({ data: combo, error }) => {
            if (error) throw error;
            return combo as CafeteriaCombo;
          })
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaService] createCombo error:', err);
        throw err;
      })
    );
  }

  updateCombo(
    id: string,
    data: {
      name?: string;
      product_id?: string;
      quantity?: number;
      price_cop?: number;
      is_active?: boolean;
    }
  ): Observable<CafeteriaCombo> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        const patch: {
          name?: string;
          product_id?: string;
          quantity?: number;
          price_cop?: number;
          is_active?: boolean;
          updated_by: string;
        } = { updated_by: userId };
        if (data.name !== undefined) patch.name = data.name;
        if (data.product_id !== undefined) patch.product_id = data.product_id;
        if (data.quantity !== undefined) patch.quantity = data.quantity;
        if (data.price_cop !== undefined) patch.price_cop = data.price_cop;
        if (data.is_active !== undefined) patch.is_active = data.is_active;

        return fromPromise(
          this.supabase.client
            .from('cafeteria_combos')
            .update(patch)
            .eq('id', id)
            .select('*')
            .single()
        ).pipe(
          map(({ data: combo, error }) => {
            if (error) throw error;
            return combo as CafeteriaCombo;
          })
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaService] updateCombo error:', err);
        throw err;
      })
    );
  }

  toggleCombo(id: string, isActive: boolean): Observable<CafeteriaCombo> {
    return fromPromise(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data: authData, error: authError }) => {
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Usuario no autenticado');

        return fromPromise(
          this.supabase.client
            .from('cafeteria_combos')
            .update({ is_active: isActive, updated_by: userId })
            .eq('id', id)
            .select('*')
            .single()
        ).pipe(
          map(({ data: combo, error }) => {
            if (error) throw error;
            return combo as CafeteriaCombo;
          })
        );
      }),
      catchError((err) => {
        console.error('[CafeteriaService] toggleCombo error:', err);
        throw err;
      })
    );
  }

  // ─── Ventas ────────────────────────────────────────────────────────────────

  getSales(year: number, month: number): Observable<CafeteriaSaleWithDetails[]> {
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDayDate = new Date(year, month, 0);
    const lastDay = this.localDateString(lastDayDate);

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
        return ((data ?? []) as unknown[]).map((row) => {
          const r = row as CafeteriaSale & {
            product: Pick<CafeteriaProduct, 'name' | 'size_label'> | null;
            client: { id: string; profiles: { full_name: string } | null } | null;
            trainer: { id: string; full_name: string } | null;
          };
          return {
            ...r,
            client: r.client
              ? { id: r.client.id, full_name: r.client.profiles?.full_name ?? '' }
              : null
          } as CafeteriaSaleWithDetails;
        });
      }),
      catchError((err) => {
        console.error('[CafeteriaService] getSales error:', err);
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
        console.error('[CafeteriaService] createSale error:', err);
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
        console.error('[CafeteriaService] createInstallment error:', err);
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
        console.error('[CafeteriaService] getSaleInstallments error:', err);
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
        console.error('[CafeteriaService] getActiveClients error:', err);
        throw err;
      })
    );
  }

  getTrainers(): Observable<TrainerOption[]> {
    return this.clients.getActiveTrainers().pipe(
      map((trainers) => trainers.map((t) => ({ id: t.id, full_name: t.fullName }))),
      catchError((err) => {
        console.error('[CafeteriaService] getTrainers error:', err);
        throw err;
      })
    );
  }

  // ─── Compras de combo ──────────────────────────────────────────────────────

  getComboPurchases(year: number, month: number): Observable<CafeteriaComboPurchaseWithDetails[]> {
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDayDate = new Date(year, month, 0);
    const lastDay = this.localDateString(lastDayDate);

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
        return ((data ?? []) as unknown[]).map((row) => {
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
          return {
            ...r,
            client: r.client
              ? { id: r.client.id, full_name: r.client.profiles?.full_name ?? '' }
              : null
          } as CafeteriaComboPurchaseWithDetails;
        });
      }),
      catchError((err) => {
        console.error('[CafeteriaService] getComboPurchases error:', err);
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
        console.error('[CafeteriaService] getActiveComboByClient error:', err);
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
        console.error('[CafeteriaService] getClientActiveCombos error:', err);
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
        console.error('[CafeteriaService] createComboPurchase error:', err);
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
        console.error('[CafeteriaService] registerComboConsumption error:', err);
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
        console.error('[CafeteriaService] createComboPurchaseInstallment error:', err);
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
        console.error('[CafeteriaService] getComboConsumptions error:', err);
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
        console.error('[CafeteriaService] getComboPurchaseInstallments error:', err);
        throw err;
      })
    );
  }

  // ─── Gastos / Insumos ──────────────────────────────────────────────────────

  getExpenses(year: number, month: number): Observable<CafeteriaExpenseWithDetails[]> {
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDayDate = new Date(year, month, 0);
    const lastDay = this.localDateString(lastDayDate);

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
        console.error('[CafeteriaService] getExpenses error:', err);
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
        console.error('[CafeteriaService] getExpenseCategories error:', err);
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
        console.error('[CafeteriaService] getAllExpenseCategories error:', err);
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
        console.error('[CafeteriaService] createExpense error:', err);
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
        console.error('[CafeteriaService] updateExpense error:', err);
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
        console.error('[CafeteriaService] voidExpense error:', err);
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
        console.error('[CafeteriaService] createExpenseCategory error:', err);
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
        console.error('[CafeteriaService] toggleExpenseCategory error:', err);
        throw err;
      })
    );
  }

  // ─── Consolidaciones quincenales ──────────────────────────────────────────

  getConsolidations(): Observable<CafeteriaConsolidation[]> {
    return fromPromise(
      this.supabase.client
        .from('cafeteria_consolidations')
        .select('*')
        .order('period_start', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as CafeteriaConsolidation[];
      }),
      catchError((err) => {
        console.error('[CafeteriaService] getConsolidations error:', err);
        throw err;
      })
    );
  }

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
        console.error('[CafeteriaService] getConsolidationsWithUser error:', err);
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
        console.error('[CafeteriaService] getConsolidationPreview error:', err);
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
        console.error('[CafeteriaService] closeConsolidation error:', err);
        return throwError(() => err);
      })
    );
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────

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
        console.error('[CafeteriaService] getDashboard error:', err);
        return throwError(() => err);
      })
    );
  }

  // ─── Helpers privados ──────────────────────────────────────────────────────

  /**
   * Formatea una fecha como `YYYY-MM-DD` usando la zona local del cliente.
   * No usar `toISOString()` — devuelve UTC y se desfasa una jornada en COT (UTC-5).
   */
  private localDateString(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
