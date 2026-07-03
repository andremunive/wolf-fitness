import { Injectable } from '@angular/core';
import { from as fromPromise, Observable } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import {
  CafeteriaCombo,
  CafeteriaComboWithProduct,
  CafeteriaProduct,
  CafeteriaProductPriceHistory
} from '../models/cafeteria.model';
import { localDateString } from 'src/app/shared/utils/date.utils';

/**
 * Acceso a datos del catálogo de cafetería: productos, precios e historial,
 * y combos.
 *
 * RLS: solo usuarios con rol `admin` pueden leer/escribir estas tablas.
 */
@Injectable({
  providedIn: 'root'
})
export class CafeteriaCatalogService {
  constructor(private readonly supabase: SupabaseService) {}

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
        console.error('[CafeteriaCatalogService] getProducts error:', err);
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
                  valid_from: localDateString(new Date()),
                  valid_until: null,
                  created_by: uid
                })
            ).pipe(
              map(({ error }) => {
                if (error) {
                  console.error(
                    `[CafeteriaCatalogService] createProduct: historial de precio falló para producto huérfano id=${product.id}`,
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
        console.error('[CafeteriaCatalogService] createProduct error:', err);
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
        console.error('[CafeteriaCatalogService] updateProduct error:', err);
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
            .update({ valid_until: localDateString(yesterday) })
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
                  valid_from: localDateString(today),
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
        console.error('[CafeteriaCatalogService] updatePrice error:', err);
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
        console.error('[CafeteriaCatalogService] getPriceHistory error:', err);
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
        console.error('[CafeteriaCatalogService] toggleProduct error:', err);
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
        console.error('[CafeteriaCatalogService] getCombos error:', err);
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
        console.error('[CafeteriaCatalogService] createCombo error:', err);
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
        console.error('[CafeteriaCatalogService] updateCombo error:', err);
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
        console.error('[CafeteriaCatalogService] toggleCombo error:', err);
        throw err;
      })
    );
  }
}
