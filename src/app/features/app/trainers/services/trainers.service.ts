import { Injectable } from '@angular/core';
import { forkJoin, from, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import {
  CreateTrainerPayload,
  CreateTrainerResult,
  ResetTrainerPasswordResult,
  Trainer,
  TrainerDetailFull,
  TrainerQuincenaCounts,
  TrainersPage,
  TrainersQueryParams,
  UpdateTrainerPayload,
  UpdateTrainerResult
} from '../models/trainer.model';
import { Bank, BankAccountType, DocumentType, Gender } from 'src/app/core/types/supabase';
import { ClosuresService } from '../../closures/services/closures.service';

// Tipo de la fila cruda que devuelve PostgREST con los JOINs embebidos.
interface TrainerRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  is_active: boolean;
  created_at: string;
  birth_date: string;
  neighborhood: string;
  gender: Gender | null;
  trainer_details: {
    address: string;
    document_type: DocumentType;
    document_number: string;
  } | null;
  trainer_bank_accounts: {
    bank: Bank;
    account_type: BankAccountType;
    account_number: string;
  } | null;
}

function emptyQuincenaCounts(): TrainerQuincenaCounts {
  return { q1: {}, q2: {} };
}

function mapRowToTrainer(row: TrainerRow): Trainer {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    isActive: row.is_active,
    createdAt: row.created_at,
    details: row.trainer_details
      ? {
          address: row.trainer_details.address,
          documentType: row.trainer_details.document_type,
          documentNumber: row.trainer_details.document_number
        }
      : null,
    bankAccount: row.trainer_bank_accounts
      ? {
          bank: row.trainer_bank_accounts.bank,
          accountType: row.trainer_bank_accounts.account_type,
          accountNumber: row.trainer_bank_accounts.account_number
        }
      : null,
    quincenaCounts: emptyQuincenaCounts()
  };
}

function mapRowToTrainerDetailFull(row: TrainerRow): TrainerDetailFull {
  return {
    ...mapRowToTrainer(row),
    birthDate: row.birth_date,
    neighborhood: row.neighborhood,
    gender: row.gender
  };
}

const TRAINER_SELECT = [
  'id',
  'full_name',
  'email',
  'phone',
  'is_active',
  'created_at',
  'birth_date',
  'neighborhood',
  'gender',
  'trainer_details(address, document_type, document_number)',
  'trainer_bank_accounts(bank, account_type, account_number)'
].join(', ');

@Injectable({ providedIn: 'root' })
export class TrainersService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly closures: ClosuresService
  ) {}

  getTrainers(params: TrainersQueryParams): Observable<TrainersPage> {
    const { search, activeFilter, page, pageSize } = params;
    const from_ = (page - 1) * pageSize;
    const to = from_ + pageSize - 1;

    return forkJoin({
      page: from(this.buildTrainersQuery(search ?? '', activeFilter, from_, to)).pipe(
        map(({ data, count, error }) => {
          if (error) throw error;
          const rows = (data ?? []) as unknown as TrainerRow[];
          return {
            items: rows.map(mapRowToTrainer),
            total: count ?? 0
          };
        })
      ),
      quincena: this.getQuincenaCountsByTrainer()
    }).pipe(
      map(({ page: pageData, quincena }) => ({
        items: pageData.items.map((trainer) => ({
          ...trainer,
          quincenaCounts: quincena[trainer.id] ?? emptyQuincenaCounts()
        })),
        total: pageData.total
      })),
      catchError((err) => {
        console.error('[TrainersService] getTrainers error:', err);
        throw err;
      })
    );
  }

  /**
   * Obtiene conteos de clientes por quincena para todos los trainers del mes actual.
   * Reemplaza el RPC `get_trainers_quincena_counts` (deprecado en Hito 5).
   * Usa la EF `list-trainers-closures-for-month` que retorna datos histórica y semánticamente
   * correctos (asignación al momento del pago, sin DISTINCT por cliente).
   */
  private getQuincenaCountsByTrainer(): Observable<Record<string, TrainerQuincenaCounts>> {
    const now = new Date();
    return this.closures.listTrainersClosuresForMonth(now.getFullYear(), now.getMonth() + 1).pipe(
      map((result) => {
        const countsMap: Record<string, TrainerQuincenaCounts> = {};
        for (const trainer of result.trainers) {
          const q1: Record<string, number> = {};
          const q2: Record<string, number> = {};

          if (trainer.q1.count_six_days > 0)   q1['plan_6d'] = trainer.q1.count_six_days;
          if (trainer.q1.count_three_days > 0)  q1['plan_3d'] = trainer.q1.count_three_days;
          if (trainer.q2.count_six_days > 0)    q2['plan_6d'] = trainer.q2.count_six_days;
          if (trainer.q2.count_three_days > 0)  q2['plan_3d'] = trainer.q2.count_three_days;

          countsMap[trainer.trainer_id] = { q1, q2 };
        }
        return countsMap;
      }),
      catchError((err) => {
        // Degradación silenciosa: si la EF falla, los conteos aparecen vacíos.
        // La lista de entrenadores sigue visible sin interrumpir la UX.
        console.warn('[TrainersService] getQuincenaCountsByTrainer error (degraded):', err);
        return [{}];
      })
    );
  }

  private async buildTrainersQuery(
    search: string,
    activeFilter: 'all' | 'active' | 'inactive',
    rangeFrom: number,
    rangeTo: number
  ) {
    let query = this.supabase.client
      .from('profiles')
      .select(TRAINER_SELECT, { count: 'exact' })
      .eq('role', 'trainer')
      .order('full_name', { ascending: true })
      .range(rangeFrom, rangeTo);

    if (activeFilter === 'active') {
      query = query.eq('is_active', true);
    } else if (activeFilter === 'inactive') {
      query = query.eq('is_active', false);
    }

    if (search.trim()) {
      // La búsqueda por nombre o email se hace con ilike en la tabla profiles.
      // La búsqueda por document_number requiere or con tabla joined; PostgREST
      // soporta filtros en tablas embebidas solo con sintaxis especial. Aquí
      // buscamos nombre/email desde profiles. El document_number se incluye
      // como campo secundario de búsqueda vía or sobre columnas de profiles.
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    return query;
  }

  getTrainerById(id: string): Observable<TrainerDetailFull> {
    return from(
      this.supabase.client
        .from('profiles')
        .select(TRAINER_SELECT)
        .eq('id', id)
        .eq('role', 'trainer')
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return mapRowToTrainerDetailFull(data as unknown as TrainerRow);
      }),
      catchError((err) => {
        console.error('[TrainersService] getTrainerById error:', err);
        throw err;
      })
    );
  }

  createTrainer(payload: CreateTrainerPayload): Observable<CreateTrainerResult> {
    return from(
      this.supabase.client.functions.invoke<CreateTrainerResult>('create_trainer', {
        body: payload
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía del servidor');
        return data;
      }),
      catchError((err) => {
        console.error('[TrainersService] createTrainer error:', err);
        throw err;
      })
    );
  }

  updateTrainer(payload: UpdateTrainerPayload): Observable<UpdateTrainerResult> {
    return from(
      this.supabase.client.functions.invoke<UpdateTrainerResult>('update_trainer', {
        body: payload
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía del servidor');
        return data;
      }),
      catchError((err) => {
        console.error('[TrainersService] updateTrainer error:', err);
        throw err;
      })
    );
  }

  setTrainerActive(trainerId: string, isActive: boolean): Observable<UpdateTrainerResult> {
    return this.updateTrainer({
      trainer_id: trainerId,
      profile: { is_active: isActive }
    });
  }

  resetTrainerPassword(trainerId: string): Observable<ResetTrainerPasswordResult> {
    return from(
      this.supabase.client.functions.invoke<ResetTrainerPasswordResult>('reset_trainer_password', {
        body: { trainer_id: trainerId }
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Respuesta vacía del servidor');
        return data;
      }),
      catchError((err) => {
        console.error('[TrainersService] resetTrainerPassword error:', err);
        throw err;
      })
    );
  }
}
