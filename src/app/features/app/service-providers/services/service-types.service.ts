import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import {
  CreateServiceTypePayload,
  ServiceTypeViewModel,
  UpdateServiceTypePayload,
  mapServiceTypeRow
} from '../models/service-provider.model';
import { ServiceType, ServiceTypeUpdate } from 'src/app/core/types/supabase';

@Injectable({ providedIn: 'root' })
export class ServiceTypesService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Returns all active service types, ordered by name. Used in dropdowns when creating/editing providers. */
  listActive(): Observable<ServiceTypeViewModel[]> {
    return from(
      this.supabase.client
        .from('service_types')
        .select('id, name, description, is_active, created_at, created_by')
        .eq('is_active', true)
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return ((data ?? []) as ServiceType[]).map(mapServiceTypeRow);
      }),
      catchError((err) => {
        console.error('[ServiceTypesService] listActive error:', err);
        throw err;
      })
    );
  }

  /** Returns all service types (active and inactive). Used in the management modal. */
  listAll(): Observable<ServiceTypeViewModel[]> {
    return from(
      this.supabase.client
        .from('service_types')
        .select('id, name, description, is_active, created_at, created_by')
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return ((data ?? []) as ServiceType[]).map(mapServiceTypeRow);
      }),
      catchError((err) => {
        console.error('[ServiceTypesService] listAll error:', err);
        throw err;
      })
    );
  }

  create(payload: CreateServiceTypePayload): Observable<ServiceTypeViewModel> {
    return from(
      this.supabase.client
        .from('service_types')
        .insert({
          name: payload.name.trim(),
          description: payload.description?.trim() ?? null
        })
        .select('id, name, description, is_active, created_at, created_by')
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          if (error.code === '23505') {
            throw new Error('Ya existe un tipo de servicio con ese nombre.');
          }
          throw error;
        }
        return mapServiceTypeRow(data as ServiceType);
      }),
      catchError((err) => {
        console.error('[ServiceTypesService] create error:', err);
        throw err;
      })
    );
  }

  update(id: string, payload: UpdateServiceTypePayload): Observable<ServiceTypeViewModel> {
    const patch: ServiceTypeUpdate = {};
    if (payload.name !== undefined) patch.name = payload.name.trim();
    if (payload.description !== undefined) patch.description = payload.description?.trim() ?? null;
    if (payload.is_active !== undefined) patch.is_active = payload.is_active;

    return from(
      this.supabase.client
        .from('service_types')
        .update(patch)
        .eq('id', id)
        .select('id, name, description, is_active, created_at, created_by')
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return mapServiceTypeRow(data as ServiceType);
      }),
      catchError((err) => {
        console.error('[ServiceTypesService] update error:', err);
        throw err;
      })
    );
  }

  /** Soft-disables a service type. Providers that already reference it are unaffected. */
  deactivate(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('service_types')
        .update({ is_active: false })
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError((err) => {
        console.error('[ServiceTypesService] deactivate error:', err);
        throw err;
      })
    );
  }

  activate(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('service_types')
        .update({ is_active: true })
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError((err) => {
        console.error('[ServiceTypesService] activate error:', err);
        throw err;
      })
    );
  }
}
