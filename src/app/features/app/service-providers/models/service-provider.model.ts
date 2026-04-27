import {
  Bank,
  BankAccountType,
  DocumentType,
  ProviderBankAccount,
  ProviderEntityType,
  ServiceProvider,
  ServiceType
} from 'src/app/core/types/supabase';

// Re-export alias types used throughout this feature.
export { Bank, BankAccountType, DocumentType, ProviderEntityType };

// ─── View models ──────────────────────────────────────────────────────────────

/**
 * Flattened view model consumed by cards and tables.
 * Maps snake_case DB columns to camelCase for the template layer.
 */
export interface ServiceProviderViewModel {
  id: string;
  name: string;
  entityType: ProviderEntityType;
  documentType: DocumentType;
  documentNumber: string;
  serviceTypeId: string;
  serviceTypeName: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  bankAccounts: BankAccountViewModel[];
  primaryBankAccount: BankAccountViewModel | null;
}

export interface BankAccountViewModel {
  id: string;
  providerId: string;
  bank: Bank;
  accountType: BankAccountType;
  accountNumber: string;
  accountHolderName: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface ServiceTypeViewModel {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

// ─── Query params ─────────────────────────────────────────────────────────────

export type EntityTypeFilter = 'all' | 'persona' | 'empresa';

export interface ServiceProvidersQueryParams {
  search: string;
  entityType: EntityTypeFilter;
  serviceTypeId: string | null;
  includeDeleted: boolean;
  page: number;
  pageSize: number;
}

export interface ServiceProvidersPage {
  items: ServiceProviderViewModel[];
  total: number;
}

// ─── Create / Update payloads ─────────────────────────────────────────────────

export interface CreateServiceProviderPayload {
  name: string;
  entity_type: ProviderEntityType;
  document_type: DocumentType;
  document_number: string;
  service_type_id: string;
  description?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface CreateBankAccountPayload {
  bank: Bank;
  account_type: BankAccountType;
  account_number: string;
  account_holder_name?: string | null;
  is_primary?: boolean;
}

export interface UpdateServiceProviderPayload {
  name?: string;
  entity_type?: ProviderEntityType;
  document_type?: DocumentType;
  document_number?: string;
  service_type_id?: string;
  description?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface UpdateBankAccountPayload {
  bank?: Bank;
  account_type?: BankAccountType;
  account_number?: string;
  account_holder_name?: string | null;
  is_primary?: boolean;
}

export interface CreateServiceTypePayload {
  name: string;
  description?: string | null;
}

export interface UpdateServiceTypePayload {
  name?: string;
  description?: string | null;
  is_active?: boolean;
}

// ─── Result of wizard creation ────────────────────────────────────────────────

export interface CreateServiceProviderResult {
  provider: ServiceProviderViewModel;
}

// ─── Mappers from raw DB rows ─────────────────────────────────────────────────

export function mapBankAccountRow(row: ProviderBankAccount): BankAccountViewModel {
  return {
    id: row.id,
    providerId: row.provider_id,
    bank: row.bank,
    accountType: row.account_type,
    accountNumber: row.account_number,
    accountHolderName: row.account_holder_name,
    isPrimary: row.is_primary,
    createdAt: row.created_at
  };
}

export function mapServiceTypeRow(row: ServiceType): ServiceTypeViewModel {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at
  };
}

export function mapProviderRow(
  row: ServiceProvider & {
    service_types?: { name: string } | null;
    provider_bank_accounts?: ProviderBankAccount[];
  }
): ServiceProviderViewModel {
  const bankAccounts: BankAccountViewModel[] = (row.provider_bank_accounts ?? []).map(
    mapBankAccountRow
  );
  const primaryBankAccount =
    bankAccounts.find((a) => a.isPrimary) ?? bankAccounts[0] ?? null;

  return {
    id: row.id,
    name: row.name,
    entityType: row.entity_type,
    documentType: row.document_type,
    documentNumber: row.document_number,
    serviceTypeId: row.service_type_id,
    serviceTypeName: row.service_types?.name ?? '',
    description: row.description,
    phone: row.phone,
    email: row.email,
    isDeleted: row.deleted_at !== null,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    bankAccounts,
    primaryBankAccount
  };
}
