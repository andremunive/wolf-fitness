import { Loan as LoanDbRow, LoanPayment as LoanPaymentDbRow } from 'src/app/core/types/supabase';

export type LoanStatus = 'active' | 'closed';
export type BeneficiaryType = 'trainer' | 'provider' | 'third_party';
export type ClosureType = 'normal' | 'forced';
export type PaymentMethod = 'cash' | 'transfer' | 'nequi' | 'other';

export interface CreateLoanInput {
  beneficiary_type: BeneficiaryType;
  trainer_id?: string | null;
  provider_id?: string | null;
  third_party_name?: string | null;
  amount_cop: number;
  notes?: string | null;
  loan_date: string; // ISO date YYYY-MM-DD
}

export interface UpdateLoanInput {
  beneficiary_type?: BeneficiaryType;
  trainer_id?: string | null;
  provider_id?: string | null;
  third_party_name?: string | null;
  amount_cop?: number;
  notes?: string | null;
  loan_date?: string; // YYYY-MM-DD
}

export interface CreateLoanPaymentInput {
  amount_cop: number;
  payment_date: string; // YYYY-MM-DD
  payment_method: PaymentMethod;
  notes?: string | null;
}

export type LoanRow = LoanDbRow & {
  trainer: { id: string; full_name: string } | null;
  provider: { id: string; name: string } | null;
  /** Profile of the user who created the loan — included via LOAN_SELECT */
  created_by_profile: { id: string; full_name: string } | null;
};

export interface Loan extends LoanDbRow {
  /** amount_cop - total_paid_cop */
  saldo_cop: number;
  /** Display name resolved from beneficiary_type */
  beneficiary_label: string;
  /** Full name of the admin/trainer who registered the loan, or null */
  created_by_name: string | null;
}

export type LoanPayment = LoanPaymentDbRow;

export function mapLoanRow(row: LoanRow): Loan {
  const { trainer: _trainer, provider: _provider, created_by_profile: _createdByProfile, ...rest } = row;
  return {
    ...rest,
    saldo_cop: rest.amount_cop - rest.total_paid_cop,
    beneficiary_label: resolveBeneficiaryLabel(row),
    created_by_name: row.created_by_profile?.full_name ?? null
  };
}

function resolveBeneficiaryLabel(row: LoanRow): string {
  if (row.beneficiary_type === 'trainer') {
    return row.trainer?.full_name ?? 'Entrenador desconocido';
  }
  if (row.beneficiary_type === 'provider') {
    return row.provider?.name ?? 'Proveedor desconocido';
  }
  return row.third_party_name ?? 'Tercero';
}
