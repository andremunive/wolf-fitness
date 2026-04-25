import { Bank, BankAccountType, DocumentType } from 'src/app/core/types/supabase';

export { Bank, BankAccountType, DocumentType };

export interface Trainer {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  details: {
    address: string;
    documentType: DocumentType;
    documentNumber: string;
  } | null;
  bankAccount: {
    bank: Bank;
    accountType: BankAccountType;
    accountNumber: string;
  } | null;
}

export type TrainerActiveFilter = 'all' | 'active' | 'inactive';

export interface TrainersQueryParams {
  search?: string;
  activeFilter: TrainerActiveFilter;
  page: number;
  pageSize: number;
}

export interface TrainersPage {
  items: Trainer[];
  total: number;
}

// ─── Payloads para Edge Functions ─────────────────────────────────────────────

export interface CreateTrainerPayload {
  full_name: string;
  email: string;
  phone: string;
  birth_date: string;
  neighborhood: string;
  address: string;
  document_type: DocumentType;
  document_number: string;
  bank: Bank;
  account_type: BankAccountType;
  account_number: string;
  gender?: string;
}

export interface CreateTrainerResult {
  trainer_id: string;
  email: string;
  temporary_password: string;
}

export interface UpdateTrainerPayload {
  trainer_id: string;
  profile?: {
    full_name?: string;
    phone?: string;
    birth_date?: string;
    neighborhood?: string;
    gender?: string;
    avatar_url?: string | null;
    is_active?: boolean;
    password_change_required?: boolean;
  };
  trainer_details?: {
    address?: string;
    document_type?: DocumentType;
    document_number?: string;
  };
  bank_account?: {
    bank?: Bank;
    account_type?: BankAccountType;
    account_number?: string;
  };
}

export interface UpdateTrainerResult {
  trainer_id: string;
  updated_tables: string[];
  message: string;
}

// ─── Modelo extendido para precarga en formulario de edición ──────────────────

export interface TrainerDetailFull extends Trainer {
  birthDate: string;
  neighborhood: string;
  gender: string | null;
}
