import { Injectable } from '@angular/core';
import { defer, from, Observable } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import { Database, Gender } from 'src/app/core/types/supabase';
import {
  Client,
  ClientDetailFull,
  MembershipStatus,
  ClientOrigin as ClientOriginModel,
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
 * Tipo crudo que devuelve la vista v_clients_with_payment_status.
 * Todas las columnas de JOIN ya vienen aplanadas — no hay objetos anidados.
 */
interface ClientListRow {
  id: string;
  status: string;
  origin: string;
  joined_at: string;
  created_at: string;
  plan_id: string;
  // Campos del perfil del cliente (aplanados por la vista)
  full_name: string;
  email: string;
  phone: string;
  is_active: boolean;
  // Campos del plan (aplanados por la vista)
  plan_name: string | null;
  plan_amount_cop: number | null;
  // Trainer activo (aplanado por la vista)
  trainer_name: string | null;
  // Referidor (aplanado por la vista)
  referred_by_name: string | null;
  // Campos de pagos (nuevos en Hito 4.5)
  last_payment_status: string | null;
  last_payment_balance_cop: number | null;
  last_payment_period_end: string | null;
  last_event_date: string | null;
  last_event_amount_cop: number | null;
  // Estado de membresía calculado server-side (migración add_membership_status_to_clients_view)
  membership_status: string | null;
}

/**
 * Tipo crudo para el detalle completo (formulario de edición).
 * Sigue consultando la tabla `clients` con JOINs explícitos — no usa la vista.
 */
interface ClientDetailRow {
  id: string;
  status: string;
  origin: string;
  joined_at: string;
  created_at: string;
  plan_id: string;
  referred_by: string | null;
  height_cm: number | null;
  profiles: {
    full_name: string;
    email: string;
    phone: string;
    is_active: boolean;
    birth_date: string;
    neighborhood: string;
    /** NOT NULL in profiles — typed as Gender to match the DB constraint. */
    gender: Gender;
  };
  referred_by_profile: { full_name: string } | null;
  plans: {
    name: string;
    plan_prices: Array<{ amount_cop: number }>;
  } | null;
  client_trainer_assignments: Array<{
    ended_at: string | null;
    trainer_id: string;
    trainer_profile: { full_name: string } | null;
  }>;
}

/**
 * SELECT string para el listado desde la vista v_clients_with_payment_status.
 * La vista resuelve internamente todos los JOINs: los campos vienen aplanados.
 */
const CLIENT_LIST_SELECT = [
  'id',
  'status',
  'origin',
  'joined_at',
  'created_at',
  'plan_id',
  // Perfil del cliente (aplanado por la vista)
  'full_name',
  'email',
  'phone',
  'is_active',
  // Plan (aplanado por la vista)
  'plan_name',
  'plan_amount_cop',
  // Trainer y referidor (aplanados)
  'trainer_name',
  'referred_by_name',
  // Campos de estado de pagos (nuevos en Hito 4.5)
  'last_payment_status',
  'last_payment_balance_cop',
  'last_payment_period_end',
  'last_event_date',
  'last_event_amount_cop',
  // Estado de membresía calculado server-side
  'membership_status'
].join(', ');

const CLIENT_DETAIL_SELECT = [
  'id',
  'status',
  'origin',
  'joined_at',
  'created_at',
  'plan_id',
  'referred_by',
  'height_cm',
  'profiles!clients_profiles_fkey(full_name, email, phone, is_active, birth_date, neighborhood, gender)',
  'referred_by_profile:profiles!clients_referred_by_fkey(full_name)',
  'plans!clients_plan_id_fkey(name, plan_prices(amount_cop))',
  'client_trainer_assignments!cta_client_id_fkey(trainer_id, trainer_profile:profiles!cta_trainer_id_fkey(full_name), ended_at)'
].join(', ');

function mapListRowToClient(row: ClientListRow): Client {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    isActive: row.is_active,
    status: row.status as Client['status'],
    origin: row.origin as Client['origin'],
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    planId: row.plan_id,
    planName: row.plan_name ?? '—',
    planAmountCop: row.plan_amount_cop ?? null,
    trainerName: row.trainer_name ?? null,
    referredByName: row.referred_by_name ?? null,
    // Campos de pagos
    lastPaymentStatus: (row.last_payment_status ?? 'no_payments') as Client['lastPaymentStatus'],
    lastPaymentBalanceCop: row.last_payment_balance_cop ?? null,
    lastPaymentPeriodEnd: row.last_payment_period_end ?? null,
    lastEventDate: row.last_event_date ?? null,
    lastEventAmountCop: row.last_event_amount_cop ?? null,
    membershipStatus: (row.membership_status ?? 'no_payment') as MembershipStatus
  };
}

function mapDetailRowToClientDetailFull(row: ClientDetailRow): ClientDetailFull {
  const profile = row.profiles;
  const plan = row.plans;
  const activeAssignment = row.client_trainer_assignments?.find(
    (a) => a.ended_at === null
  );

  // Construimos el base Client manualmente para el detalle porque la query
  // de detalle consulta `clients` con JOINs explícitos (no la vista).
  const base: Client = {
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
    referredByName: row.referred_by_profile?.full_name ?? null,
    // El detalle no necesita los campos de pagos; usamos valores vacíos de fallback.
    lastPaymentStatus: 'no_payments',
    lastPaymentBalanceCop: null,
    lastPaymentPeriodEnd: null,
    lastEventDate: null,
    lastEventAmountCop: null,
    membershipStatus: 'no_payment'
  };

  return {
    ...base,
    birthDate: profile.birth_date,
    neighborhood: profile.neighborhood,
    gender: profile.gender,
    heightCm: row.height_cm,
    referredById: row.referred_by,
    trainerId: activeAssignment?.trainer_id ?? null
  };
}

@Injectable({ providedIn: 'root' })
export class ClientsService {
  constructor(private readonly supabase: SupabaseService) {}

  getClients(params: ClientsQueryParams): Observable<ClientsPage> {
    const { search, membershipStatuses, origins, trainerId, page, pageSize } = params;
    const rangeFrom = (page - 1) * pageSize;
    const rangeTo = rangeFrom + pageSize - 1;

    return from(
      this.buildClientsQuery(
        search ?? '',
        membershipStatuses ?? [],
        origins ?? [],
        trainerId ?? null,
        rangeFrom,
        rangeTo
      )
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
    membershipStatuses: MembershipStatus[],
    origins: ClientOriginModel[],
    trainerId: string | null,
    rangeFrom: number,
    rangeTo: number
  ) {
    let query = this.supabase.client
      .from('v_clients_with_payment_status')
      .select(CLIENT_LIST_SELECT, { count: 'exact' })
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(rangeFrom, rangeTo);

    // Filtro por estado de membresía (multi-selección).
    // La vista v_clients_with_payment_status expone membership_status como string no-NULL
    // (valor por defecto 'no_payment' cuando no hay pagos) — un .in() directo cubre todos los casos.
    if (membershipStatuses.length > 0) {
      query = query.in('membership_status', membershipStatuses);
    }

    // Filtro por origen (multi-selección).
    if (origins.length > 0) {
      query = query.in('origin', origins);
    }

    // Filtro por entrenador: la vista expone `trainer_name` pero no `trainer_id`,
    // así que pre-consultamos las asignaciones activas en `client_trainer_assignments`
    // y aplicamos `.in('id', ...)` sobre la query principal. Si hay además filtro
    // por search (que también produce su propia lista de IDs), intersectamos abajo.
    let trainerClientIds: string[] | null = null;
    if (trainerId) {
      const { data: ctaData, error: ctaError } = await this.supabase.client
        .from('client_trainer_assignments')
        .select('client_id')
        .eq('trainer_id', trainerId)
        .is('ended_at', null);

      if (ctaError) {
        return { data: [], count: 0, error: ctaError };
      }

      trainerClientIds = (ctaData ?? []).map((r) => r.client_id);

      if (trainerClientIds.length === 0) {
        return { data: [], count: 0, error: null };
      }
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

      // Intersección con los IDs del filtro por entrenador (si aplica).
      const finalIds = trainerClientIds
        ? matchingIds.filter((id) => trainerClientIds!.includes(id))
        : matchingIds;

      if (finalIds.length === 0) {
        return { data: [], count: 0, error: null };
      }

      query = query.in('id', finalIds);
    } else if (trainerClientIds) {
      query = query.in('id', trainerClientIds);
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

    // 1. Actualización de campos del perfil (tabla profiles).
    if (profile && Object.keys(profile).length > 0) {
      // Construimos el objeto con tipos exactos de Supabase para el UPDATE de profiles.
      // gender omite los valores eliminados del enum; solo acepta 'male' | 'female'.
      // Si el valor es vacío o null, omitimos el campo para no enviar un valor inválido.
      const profileUpdate: {
        full_name?: string;
        phone?: string;
        birth_date?: string;
        neighborhood?: string;
        gender?: 'male' | 'female';
      } = {};

      if (profile.full_name !== undefined) profileUpdate.full_name = profile.full_name;
      if (profile.phone !== undefined) profileUpdate.phone = profile.phone;
      if (profile.birth_date !== undefined) profileUpdate.birth_date = profile.birth_date;
      if (profile.neighborhood !== undefined) profileUpdate.neighborhood = profile.neighborhood;
      if (profile.gender === 'male' || profile.gender === 'female') {
        profileUpdate.gender = profile.gender;
      }

      if (Object.keys(profileUpdate).length > 0) {
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
    }

    // Actualizamos origin, referred_by y/o height_cm en la tabla clients.
    // height_cm reside en clients (no en profiles) según el esquema actual.
    const clientFields: {
      origin?: ClientOrigin;
      referred_by?: string | null;
      height_cm?: number | null;
    } = {};
    if (origin !== undefined) clientFields.origin = origin as ClientOrigin;
    if (referred_by !== undefined) clientFields.referred_by = referred_by;
    if (profile?.height_cm !== undefined) clientFields.height_cm = profile.height_cm;

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

    // p_changed_by / p_assigned_by son columnas uuid de auditoría: pasar
    // cadena vacía dispara `22P02 invalid input syntax for type uuid`. Resolvemos
    // el id del usuario autenticado una sola vez y lo reutilizamos en ambas RPC.
    const authedUserId$ = defer(() =>
      from(this.supabase.auth.getSession())
    ).pipe(
      map(({ data }) => {
        const id = data.session?.user.id;
        if (!id) throw new Error('Sesión expirada. Vuelve a iniciar sesión.');
        return id;
      }),
      shareReplay(1)
    );

    // 2. Cambio de plan mediante RPC (el trigger sincroniza clients.plan_id).
    if (new_plan_id) {
      steps.push(
        authedUserId$.pipe(
          switchMap((userId) =>
            from(
              this.supabase.client.rpc('change_client_plan', {
                p_client_id: client_id,
                p_new_plan_id: new_plan_id,
                p_changed_by: userId
              })
            )
          ),
          map(({ error }) => {
            if (error) throw error;
          })
        )
      );
    }

    // 3. Cambio de trainer mediante RPC.
    if (new_trainer_id !== undefined && new_trainer_id !== null) {
      const trainerId = new_trainer_id;
      steps.push(
        authedUserId$.pipe(
          switchMap((userId) =>
            from(
              this.supabase.client.rpc('assign_trainer', {
                p_client_id: client_id,
                p_trainer_id: trainerId,
                p_assigned_by: userId
              })
            )
          ),
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
