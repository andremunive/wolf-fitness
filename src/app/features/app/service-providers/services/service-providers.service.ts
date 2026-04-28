import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import {
  BankAccountViewModel,
  CreateBankAccountPayload,
  CreateServiceProviderPayload,
  ServiceProviderViewModel,
  ServiceProvidersPage,
  ServiceProvidersQueryParams,
  UpdateBankAccountPayload,
  UpdateServiceProviderPayload,
  mapBankAccountRow,
  mapProviderRow,
  SimpleProviderOption
} from '../models/service-provider.model';
import {
  ProviderBankAccount,
  ProviderBankAccountUpdate,
  ServiceProvider,
  ServiceProviderUpdate
} from 'src/app/core/types/supabase';

const PROVIDER_SELECT = [
  'id',
  'name',
  'entity_type',
  'document_type',
  'document_number',
  'service_type_id',
  'description',
  'phone',
  'email',
  'deleted_at',
  'deleted_by',
  'created_at',
  'updated_at',
  'created_by',
  'service_types(name)',
  'provider_bank_accounts(id, provider_id, bank, account_type, account_number, account_holder_name, is_primary, created_at, updated_at)'
].join(', ');

type ProviderRow = ServiceProvider & {
  service_types?: { name: string } | null;
  provider_bank_accounts?: ProviderBankAccount[];
};

@Injectable({ providedIn: 'root' })
export class ServiceProvidersService {
  constructor(private readonly supabase: SupabaseService) {}

  list(params: ServiceProvidersQueryParams): Observable<ServiceProvidersPage> {
    const { search, entityType, serviceTypeId, includeDeleted, page, pageSize } = params;
    const rangeFrom = (page - 1) * pageSize;
    const rangeTo = rangeFrom + pageSize - 1;

    return from(this.buildListQuery(search, entityType, serviceTypeId, includeDeleted, rangeFrom, rangeTo)).pipe(
      map(({ data, count, error }) => {
        if (error) throw error;
        const rows = (data ?? []) as unknown as ProviderRow[];
        return {
          items: rows.map(mapProviderRow),
          total: count ?? 0
        };
      }),
      catchError((err) => {
        console.error('[ServiceProvidersService] list error:', err);
        throw err;
      })
    );
  }

  private async buildListQuery(
    search: string,
    entityType: ServiceProvidersQueryParams['entityType'],
    serviceTypeId: string | null,
    includeDeleted: boolean,
    rangeFrom: number,
    rangeTo: number
  ) {
    let query = this.supabase.client
      .from('service_providers')
      .select(PROVIDER_SELECT, { count: 'exact' })
      .order('name', { ascending: true })
      .range(rangeFrom, rangeTo);

    if (!includeDeleted) {
      query = query.is('deleted_at', null);
    }

    if (entityType !== 'all') {
      query = query.eq('entity_type', entityType);
    }

    if (serviceTypeId) {
      query = query.eq('service_type_id', serviceTypeId);
    }

    if (search.trim()) {
      query = query.or(
        `name.ilike.%${search.trim()}%,document_number.ilike.%${search.trim()}%`
      );
    }

    return query;
  }

  getById(id: string): Observable<ServiceProviderViewModel> {
    return from(
      this.supabase.client
        .from('service_providers')
        .select(PROVIDER_SELECT)
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return mapProviderRow(data as unknown as ProviderRow);
      }),
      catchError((err) => {
        console.error('[ServiceProvidersService] getById error:', err);
        throw err;
      })
    );
  }

  create(
    payload: CreateServiceProviderPayload,
    bankAccountPayload?: CreateBankAccountPayload
  ): Observable<ServiceProviderViewModel> {
    return from(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data }) => this.doCreate(data?.user?.id ?? null, payload, bankAccountPayload)),
      catchError((err) => {
        console.error('[ServiceProvidersService] create error:', err);
        throw err;
      })
    );
  }

  private doCreate(
    userId: string | null,
    payload: CreateServiceProviderPayload,
    bankAccountPayload?: CreateBankAccountPayload
  ): Observable<ServiceProviderViewModel> {
    return from(
      this.supabase.client
        .from('service_providers')
        .insert({
          name: payload.name.trim(),
          entity_type: payload.entity_type,
          document_type: payload.document_type,
          document_number: payload.document_number.trim(),
          service_type_id: payload.service_type_id,
          description: payload.description?.trim() ?? null,
          phone: payload.phone?.trim() ?? null,
          email: payload.email?.trim() ?? null,
          created_by: userId ?? null
        })
        .select('id')
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          if (error.code === '23505') {
            throw new Error(
              'Ya existe un proveedor con ese tipo y número de documento.'
            );
          }
          throw error;
        }
        return (data as { id: string }).id;
      }),
      switchMap((providerId) => {
        if (!bankAccountPayload) {
          return this.getById(providerId);
        }
        return from(
          this.supabase.client
            .from('provider_bank_accounts')
            .insert({
              provider_id: providerId,
              bank: bankAccountPayload.bank,
              account_type: bankAccountPayload.account_type,
              account_number: bankAccountPayload.account_number.trim(),
              account_holder_name: bankAccountPayload.account_holder_name?.trim() ?? null,
              is_primary: true
            })
        ).pipe(
          switchMap(({ error }) => {
            if (error) throw error;
            return this.getById(providerId);
          })
        );
      }),
      catchError((err) => {
        console.error('[ServiceProvidersService] create error:', err);
        throw err;
      })
    );
  }

  update(id: string, payload: UpdateServiceProviderPayload): Observable<ServiceProviderViewModel> {
    const patch: ServiceProviderUpdate = {};
    if (payload.name !== undefined) patch.name = payload.name.trim();
    if (payload.entity_type !== undefined) patch.entity_type = payload.entity_type;
    if (payload.document_type !== undefined) patch.document_type = payload.document_type;
    if (payload.document_number !== undefined) patch.document_number = payload.document_number.trim();
    if (payload.service_type_id !== undefined) patch.service_type_id = payload.service_type_id;
    if (payload.description !== undefined) patch.description = payload.description?.trim() ?? null;
    if (payload.phone !== undefined) patch.phone = payload.phone?.trim() ?? null;
    if (payload.email !== undefined) patch.email = payload.email?.trim() ?? null;

    return from(
      this.supabase.client
        .from('service_providers')
        .update(patch)
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) {
          if (error.code === '23505') {
            throw new Error(
              'Ya existe un proveedor activo con ese tipo y número de documento.'
            );
          }
          throw error;
        }
      }),
      switchMap(() => this.getById(id)),
      catchError((err) => {
        console.error('[ServiceProvidersService] update error:', err);
        throw err;
      })
    );
  }

  softDelete(id: string): Observable<void> {
    const deletedAt = new Date().toISOString();
    return from(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data }) =>
        from(
          this.supabase.client
            .from('service_providers')
            .update({
              deleted_at: deletedAt,
              deleted_by: data?.user?.id ?? null
            })
            .eq('id', id)
        )
      ),
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError((err) => {
        console.error('[ServiceProvidersService] softDelete error:', err);
        throw err;
      })
    );
  }

  /**
   * Returns a lightweight list of all non-deleted providers sorted by name.
   * Used by dropdowns/autocompletes in other features (e.g. expense records).
   * Does not fetch bank accounts or full detail — only id, name, service type.
   */
  listActiveSimple(): Observable<SimpleProviderOption[]> {
    return from(
      this.supabase.client
        .from('service_providers')
        .select('id, name, service_types(name)')
        .is('deleted_at', null)
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((row: any) => ({
          id: row.id as string,
          name: row.name as string,
          serviceTypeName: (row.service_types as { name: string } | null)?.name ?? ''
        }));
      }),
      catchError((err) => {
        console.error('[ServiceProvidersService] listActiveSimple error:', err);
        throw err;
      })
    );
  }

  restore(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('service_providers')
        .update({
          deleted_at: null,
          deleted_by: null
        })
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) {
          // Unique index violation: an active provider with same document already exists.
          if (error.code === '23505') {
            throw new Error(
              'No se puede restaurar: ya existe un proveedor activo con el mismo documento.'
            );
          }
          throw error;
        }
      }),
      catchError((err) => {
        console.error('[ServiceProvidersService] restore error:', err);
        throw err;
      })
    );
  }

  // ─── Bank accounts ─────────────────────────────────────────────────────────

  addBankAccount(
    providerId: string,
    data: CreateBankAccountPayload
  ): Observable<BankAccountViewModel> {
    return from(
      this.supabase.client
        .from('provider_bank_accounts')
        .insert({
          provider_id: providerId,
          bank: data.bank,
          account_type: data.account_type,
          account_number: data.account_number.trim(),
          account_holder_name: data.account_holder_name?.trim() ?? null,
          is_primary: data.is_primary ?? false
        })
        .select('id, provider_id, bank, account_type, account_number, account_holder_name, is_primary, created_at, updated_at')
        .single()
    ).pipe(
      map(({ data: row, error }) => {
        if (error) throw error;
        return mapBankAccountRow(row as ProviderBankAccount);
      }),
      catchError((err) => {
        console.error('[ServiceProvidersService] addBankAccount error:', err);
        throw err;
      })
    );
  }

  updateBankAccount(
    accountId: string,
    data: UpdateBankAccountPayload
  ): Observable<BankAccountViewModel> {
    const patch: ProviderBankAccountUpdate = {};
    if (data.bank !== undefined) patch.bank = data.bank;
    if (data.account_type !== undefined) patch.account_type = data.account_type;
    if (data.account_number !== undefined) patch.account_number = data.account_number.trim();
    if (data.account_holder_name !== undefined) patch.account_holder_name = data.account_holder_name?.trim() ?? null;
    if (data.is_primary !== undefined) patch.is_primary = data.is_primary;

    return from(
      this.supabase.client
        .from('provider_bank_accounts')
        .update(patch)
        .eq('id', accountId)
        .select('id, provider_id, bank, account_type, account_number, account_holder_name, is_primary, created_at, updated_at')
        .single()
    ).pipe(
      map(({ data: row, error }) => {
        if (error) throw error;
        return mapBankAccountRow(row as ProviderBankAccount);
      }),
      catchError((err) => {
        console.error('[ServiceProvidersService] updateBankAccount error:', err);
        throw err;
      })
    );
  }

  deleteBankAccount(accountId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('provider_bank_accounts')
        .delete()
        .eq('id', accountId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError((err) => {
        console.error('[ServiceProvidersService] deleteBankAccount error:', err);
        throw err;
      })
    );
  }

  /**
   * Marks the given account as primary and unmarks all others for the same provider.
   * The two-step sequence (unmark others → mark this one) is done client-side
   * because the DB does not enforce a single-primary constraint.
   */
  setPrimaryBankAccount(providerId: string, accountId: string): Observable<void> {
    return from(
      // Step 1: unmark all accounts for this provider.
      this.supabase.client
        .from('provider_bank_accounts')
        .update({ is_primary: false })
        .eq('provider_id', providerId)
    ).pipe(
      switchMap(({ error }) => {
        if (error) throw error;
        // Step 2: mark the selected account as primary.
        return from(
          this.supabase.client
            .from('provider_bank_accounts')
            .update({ is_primary: true })
            .eq('id', accountId)
        );
      }),
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError((err) => {
        console.error('[ServiceProvidersService] setPrimaryBankAccount error:', err);
        throw err;
      })
    );
  }
}
