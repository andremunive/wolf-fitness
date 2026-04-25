import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import { Database } from 'src/app/core/types/supabase';
import {
  Client,
  ClientDetailFull,
  ClientsPage,
  ClientsQueryParams,
  CreateClientPayload,
  CreateClientResult,
  DeactivateClientResult,
  Plan,
  TrainerOption,
  UpdateClientPayload
} from '../models/client.model';

type ClientOrigin = Database['public']['Enums']['client_origin'];

/**
 * Tipo crudo que devuelve la query PostgREST para el listado.
 * Incluye los JOINs embebidos: plan, plan_prices, assignment activa, perfil del trainer.
 */
interface ClientListRow {
  id: string;
  status: string;
  origin: string;
  joined_at: string;
  created_at: string;
  plan_id: string;
  // JOIN profiles (el cliente mismo comparte id con profiles, vía clients_profiles_fkey)
  profiles: {
    full_name: string;
    email: string;
    phone: string;
    is_active: boolean;
  };
  // JOIN profiles vía clients.referred_by → profiles.id. Sibling de `profiles`,
  // no anidado dentro: la FK clients_referred_by_fkey vive en clients, no en profiles.
  referred_by_profile: { full_name: string } | null;
  // JOIN plan
  plans: {
    name: string;
    plan_prices: Array<{ amount_cop: number }>;
  } | null;
  // JOIN client_trainer_assignments activas → perfil del trainer
  client_trainer_assignments: Array<{
    ended_at: string | null;
    trainer_profile: { full_name: string } | null;
  }>;
}

/**
 * Tipo crudo para el detalle completo (formulario de edición).
 */
interface ClientDetailRow extends Omit<ClientListRow, 'profiles' | 'client_trainer_assignments'> {
  referred_by: string | null;
  profiles: ClientListRow['profiles'] & {
    birth_date: string;
    neighborhood: string;
    gender: string | null;
  };
  client_trainer_assignments: Array<{
    ended_at: string | null;
    trainer_id: string;
    trainer_profile: { full_name: string } | null;
  }>;
}

/**
 * SELECT string para el listado. Se arman los JOINs con la sintaxis PostgREST:
 * - `profiles!clients_profiles_fkey` → datos del perfil del cliente.
 * - `profiles!clients_referred_by_fkey(full_name)` → nombre del referidor.
 * - `plans!clients_plan_id_fkey` → nombre del plan + precio vigente.
 * - `client_trainer_assignments(trainer_id, ended_at, profiles!cta_trainer_id_fkey(full_name))`
 *   → asignación activa de trainer.
 */
const CLIENT_LIST_SELECT = [
  'id',
  'status',
  'origin',
  'joined_at',
  'created_at',
  'plan_id',
  'profiles!clients_profiles_fkey(full_name, email, phone, is_active)',
  'referred_by_profile:profiles!clients_referred_by_fkey(full_name)',
  'plans!clients_plan_id_fkey(name, plan_prices(amount_cop))',
  'client_trainer_assignments!cta_client_id_fkey(trainer_profile:profiles!cta_trainer_id_fkey(full_name), ended_at)'
].join(', ');

const CLIENT_DETAIL_SELECT = [
  'id',
  'status',
  'origin',
  'joined_at',
  'created_at',
  'plan_id',
  'referred_by',
  'profiles!clients_profiles_fkey(full_name, email, phone, is_active, birth_date, neighborhood, gender)',
  'referred_by_profile:profiles!clients_referred_by_fkey(full_name)',
  'plans!clients_plan_id_fkey(name, plan_prices(amount_cop))',
  'client_trainer_assignments!cta_client_id_fkey(trainer_id, trainer_profile:profiles!cta_trainer_id_fkey(full_name), ended_at)'
].join(', ');

function mapListRowToClient(row: ClientListRow): Client {
  const profile = row.profiles;
  const plan = row.plans;
  // Solo tomamos la asignación vigente (ended_at IS NULL).
  const activeAssignment = row.client_trainer_assignments?.find(
    (a) => a.ended_at === null
  );

  return {
    id: row.id,
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    isActive: profile.is_active,
    status: row.status as Client['status'],
    origin: row.origin as Client['origin'],
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    planId: row.plan_id,
    planName: plan?.name ?? '—',
    planAmountCop: plan?.plan_prices?.[0]?.amount_cop ?? null,
    trainerName: activeAssignment?.trainer_profile?.full_name ?? null,
    referredByName: row.referred_by_profile?.full_name ?? null
  };
}

function mapDetailRowToClientDetailFull(row: ClientDetailRow): ClientDetailFull {
  const base = mapListRowToClient(row as unknown as ClientListRow);
  const profile = row.profiles;
  const activeAssignment = row.client_trainer_assignments?.find(
    (a) => a.ended_at === null
  );

  return {
    ...base,
    birthDate: profile.birth_date,
    neighborhood: profile.neighborhood,
    gender: profile.gender,
    referredById: row.referred_by,
    trainerId: activeAssignment?.trainer_id ?? null
  };
}

@Injectable({ providedIn: 'root' })
export class ClientsService {
  constructor(private readonly supabase: SupabaseService) {}

  getClients(params: ClientsQueryParams): Observable<ClientsPage> {
    const { search, activeFilter, page, pageSize } = params;
    const rangeFrom = (page - 1) * pageSize;
    const rangeTo = rangeFrom + pageSize - 1;

    return from(
      this.buildClientsQuery(search ?? '', activeFilter, rangeFrom, rangeTo)
    ).pipe(
      map(({ data, count, error }) => {
        if (error) throw error;
        const rows = (data ?? []) as unknown as ClientListRow[];
        return {
          items: rows.map(mapListRowToClient),
          total: count ?? 0
        };
      }),
      catchError((err) => {
        console.error('[ClientsService] getClients error:', err);
        throw err;
      })
    );
  }

  private async buildClientsQuery(
    search: string,
    activeFilter: 'all' | 'active' | 'inactive',
    rangeFrom: number,
    rangeTo: number
  ) {
    let query = this.supabase.client
      .from('clients')
      .select(CLIENT_LIST_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(rangeFrom, rangeTo);

    if (activeFilter === 'active') {
      query = query.eq('status', 'active');
    } else if (activeFilter === 'inactive') {
      query = query.eq('status', 'inactive');
    }

    if (search.trim()) {
      // La búsqueda por nombre/email vive en la tabla profiles (JOIN).
      // PostgREST permite filtrar en columnas del recurso principal y en
      // columnas de tablas embed usando la sintaxis table.column. Sin embargo
      // en versiones anteriores de PostgREST el filtro en tablas embebidas
      // desde el recurso padre requiere el operador `cs` o filtros externos.
      // Para seguridad/compatibilidad filtramos solo por campos de la tabla clients
      // que sean accesibles, y dejamos la búsqueda de nombre en una columna
      // compuesta computed (no disponible aquí).
      // DECISIÓN: filtramos por el campo `id` de clients que coincida con un
      // profile que tenga el nombre buscado mediante una subquery. Como PostgREST
      // no expone subqueries directas, usamos el filtro en la vista o empleamos
      // la alternativa: filtrar la tabla profiles primero y cruzar.
      // ALTERNATIVA USADA: usar `or` en columna de la tabla embed con !inner join.
      // PostgREST 14+ soporta: profiles.full_name=ilike.%search%
      // pero la sintaxis del SDK no lo expone directamente en `.or()`.
      // Por ello, hacemos la búsqueda en la tabla `profiles` obteniendo los IDs
      // y luego filtramos clients por esos IDs.
      // Esta es la forma más compatible con las versiones de PostgREST en uso.
      const profileSearch = await this.supabase.client
        .from('profiles')
        .select('id')
        .eq('role', 'client')
        .or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);

      const matchingIds = (profileSearch.data ?? []).map((p) => p.id);

      if (matchingIds.length === 0) {
        // Ningún perfil coincide: devolvemos vacío sin ejecutar la query principal.
        return { data: [], count: 0, error: null };
      }

      query = query.in('id', matchingIds);
    }

    return query;
  }

  getClientById(id: string): Observable<ClientDetailFull> {
    return from(
      this.supabase.client
        .from('clients')
        .select(CLIENT_DETAIL_SELECT)
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return mapDetailRowToClientDetailFull(data as unknown as ClientDetailRow);
      }),
      catchError((err) => {
        console.error('[ClientsService] getClientById error:', err);
        throw err;
      })
    );
  }

  createClient(payload: CreateClientPayload): Observable<CreateClientResult> {
    return from(
      this.supabase.client.functions.invoke<CreateClientResult>('create-client', {
        body: payload
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía del servidor');
        return data;
      }),
      catchError((err) => {
        console.error('[ClientsService] createClient error:', err);
        throw err;
      })
    );
  }

  deactivateClient(clientId: string): Observable<DeactivateClientResult> {
    return from(
      this.supabase.client.functions.invoke<DeactivateClientResult>('deactivate-client', {
        body: { client_id: clientId }
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía del servidor');
        return data;
      }),
      catchError((err) => {
        console.error('[ClientsService] deactivateClient error:', err);
        throw err;
      })
    );
  }

  updateClient(payload: UpdateClientPayload): Observable<void> {
    const { client_id, profile, new_plan_id, new_trainer_id, origin, referred_by } =
      payload;

    const steps: Observable<unknown>[] = [];

    // 1. Actualización de campos del perfil + campos de clients (origen, referred_by).
    if (profile && Object.keys(profile).length > 0) {
      // Construimos el objeto con tipos exactos de Supabase para el UPDATE de profiles.
      // gender: null no es aceptado por el tipo generado; usamos 'prefer_not_to_say' como
      // valor semántico para "sin especificar", o bien lo omitimos si es undefined.
      const profileUpdate: {
        full_name?: string;
        phone?: string;
        birth_date?: string;
        neighborhood?: string;
        gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
      } = {};

      if (profile.full_name !== undefined) profileUpdate.full_name = profile.full_name;
      if (profile.phone !== undefined) profileUpdate.phone = profile.phone;
      if (profile.birth_date !== undefined) profileUpdate.birth_date = profile.birth_date;
      if (profile.neighborhood !== undefined) profileUpdate.neighborhood = profile.neighborhood;
      if (profile.gender !== undefined && profile.gender !== null) {
        profileUpdate.gender = profile.gender as 'male' | 'female' | 'other' | 'prefer_not_to_say';
      }

      steps.push(
        from(
          this.supabase.client
            .from('profiles')
            .update(profileUpdate)
            .eq('id', client_id)
        ).pipe(
          map(({ error }) => {
            if (error) throw error;
          })
        )
      );
    }

    // Actualizamos origin y/o referred_by directamente en la tabla clients.
    // El tipo generado de Supabase exige el enum exacto para `origin`.
    const clientFields: { origin?: ClientOrigin; referred_by?: string | null } = {};
    if (origin !== undefined) clientFields.origin = origin as ClientOrigin;
    if (referred_by !== undefined) clientFields.referred_by = referred_by;

    if (Object.keys(clientFields).length > 0) {
      steps.push(
        from(
          this.supabase.client
            .from('clients')
            .update(clientFields)
            .eq('id', client_id)
        ).pipe(
          map(({ error }) => {
            if (error) throw error;
          })
        )
      );
    }

    // 2. Cambio de plan mediante RPC (el trigger sincroniza clients.plan_id).
    // p_changed_by se declara como `string` en el tipo generado, pero el RPC
    // usa auth.uid() internamente; pasamos una cadena vacía que la función ignora.
    if (new_plan_id) {
      steps.push(
        from(
          this.supabase.client.rpc('change_client_plan', {
            p_client_id: client_id,
            p_new_plan_id: new_plan_id,
            p_changed_by: ''
          })
        ).pipe(
          map(({ error }) => {
            if (error) throw error;
          })
        )
      );
    }

    // 3. Cambio de trainer mediante RPC.
    if (new_trainer_id !== undefined && new_trainer_id !== null) {
      steps.push(
        from(
          this.supabase.client.rpc('assign_trainer', {
            p_client_id: client_id,
            p_trainer_id: new_trainer_id,
            p_assigned_by: ''
          })
        ).pipe(
          map(({ error }) => {
            if (error) throw error;
          })
        )
      );
    }

    if (steps.length === 0) {
      return new Observable<void>((obs) => {
        obs.next();
        obs.complete();
      });
    }

    // Ejecuta los pasos en secuencia.
    return steps.reduce((acc$, step$) =>
      acc$.pipe(switchMap(() => step$ as Observable<void>))
    ) as Observable<void>;
  }

  /** Carga los planes activos con su precio vigente. */
  getActivePlans(): Observable<Plan[]> {
    return from(
      this.supabase.client
        .from('plans')
        .select('id, name, code, plan_prices(amount_cop)')
        .eq('is_active', true)
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          code: row.code,
          amountCop: (row.plan_prices as Array<{ amount_cop: number }>)?.[0]?.amount_cop ?? null
        }));
      }),
      catchError((err) => {
        console.error('[ClientsService] getActivePlans error:', err);
        throw err;
      })
    );
  }

  /** Carga los trainers activos para el selector. */
  getActiveTrainers(): Observable<TrainerOption[]> {
    return from(
      this.supabase.client
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'trainer')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((row) => ({
          id: row.id,
          fullName: row.full_name
        }));
      }),
      catchError((err) => {
        console.error('[ClientsService] getActiveTrainers error:', err);
        throw err;
      })
    );
  }

  /**
   * Busca clientes activos por nombre para el campo "referido por".
   * Excluye al cliente con el id `excludeId` (usado en edición).
   */
  searchActiveClients(
    search: string,
    excludeId?: string
  ): Observable<Array<{ id: string; fullName: string }>> {
    let query = this.supabase.client
      .from('clients')
      .select('id, profiles!clients_profiles_fkey(full_name)')
      .eq('status', 'active')
      .limit(8);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    // El filtro por nombre debe ir en la tabla profiles. Para mantener
    // compatibilidad PostgREST, primero buscamos IDs de perfil y luego filtramos.
    return from(
      this.supabase.client
        .from('profiles')
        .select('id')
        .eq('role', 'client')
        .ilike('full_name', `%${search}%`)
        .limit(20)
    ).pipe(
      switchMap(({ data: profileData }) => {
        const ids = (profileData ?? []).map((p) => p.id);
        if (ids.length === 0) {
          return [{ data: [], error: null }] as unknown as Observable<{
            data: unknown[];
            error: null;
          }>;
        }

        let q = this.supabase.client
          .from('clients')
          .select('id, profiles!clients_profiles_fkey(full_name)')
          .eq('status', 'active')
          .in('id', ids)
          .limit(8);

        if (excludeId) {
          q = q.neq('id', excludeId);
        }

        return from(q);
      }),
      map((result) => {
        const { data, error } = result as { data: unknown[]; error: unknown };
        if (error) throw error;
        return (data ?? []).map((row) => {
          const r = row as { id: string; profiles: { full_name: string } };
          return { id: r.id, fullName: r.profiles.full_name };
        });
      }),
      catchError((err) => {
        console.error('[ClientsService] searchActiveClients error:', err);
        throw err;
      })
    );
  }
}
