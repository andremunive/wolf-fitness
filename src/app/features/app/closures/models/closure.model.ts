import {
  ClosureAdjustment,
  ClosureQuincena,
  ClosureStatus,
  PaymentMethod
} from 'src/app/core/types/supabase';

// Re-export for convenience.
export type { ClosureAdjustment, ClosureQuincena, ClosureStatus, PaymentMethod };

// ─── Staff role (subset of user_role) que aplica a cierres ────────────────────

export type StaffRole = 'trainer' | 'csm';

// ─── Bank account snapshot ─────────────────────────────────────────────────────

export interface ClosureBankAccount {
  bank: string;
  account_type: string;
  account_number: string;
}

// ─── Entry (mensualidad que aportó al cierre) ─────────────────────────────────

export interface ClosureEntry {
  payment_id: string;
  client_id: string;
  client_name: string;
  plan_frequency_snapshot: 'six_days' | 'three_days';
  equivalente: number;
  reception_date: string;
  payment_order: number;
  cumulative_equivalente: number;
}

// ─── Retorno de compute-trainer-closure ───────────────────────────────────────

export interface TrainerClosureResult {
  status: ClosureStatus | 'open';
  closure_id: string | null;
  trainer_id: string;
  role?: StaffRole;
  year: number;
  month: number;
  quincena: ClosureQuincena;
  base_cop: number;
  count_six_days: number;
  count_three_days: number;
  equivalente_q: number;
  equivalente_mes_acum_at_close: number;
  bono_mes_total_cop: number;
  bonus_q_cop: number;
  adjustments_total_cop: number;
  total_cop: number;
  closed_at: string | null;
  closed_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  payment_date: string | null;
  payment_method: PaymentMethod | null;
  payment_notes: string | null;
  entries: ClosureEntry[];
  adjustments: ClosureAdjustment[];
  bank_account: ClosureBankAccount | null;
}

// ─── Retorno de list-trainers-closures-for-month ──────────────────────────────

export interface TrainerClosureSummaryQ {
  status: ClosureStatus | 'open';
  closure_id: string | null;
  base_cop: number;
  count_six_days: number;
  count_three_days: number;
  bonus_q_cop: number;
  adjustments_total_cop: number;
  total_cop: number;
  closed_at: string | null;
  paid_at: string | null;
  payment_date: string | null;
  payment_method: PaymentMethod | null;
}

export interface TrainerClosureSummary {
  trainer_id: string;
  trainer_name: string;
  role: StaffRole;
  bono_mes_total_cop: number;
  q1: TrainerClosureSummaryQ;
  q2: TrainerClosureSummaryQ;
}

export interface ListTrainersClosuresResult {
  year: number;
  month: number;
  trainers: TrainerClosureSummary[];
}

// ─── Retorno de close-quincena ────────────────────────────────────────────────

export interface CloseQuincenaResult {
  closure_id: string;
  status: 'closed';
  trainer_id: string;
  year: number;
  month: number;
  quincena: ClosureQuincena;
  total_cop: number;
  bonus_q_cop: number;
  base_cop: number;
  count_six_days: number;
  count_three_days: number;
  bono_mes_total_cop: number;
  is_future_warning: boolean;
}

// ─── Retorno de reopen-quincena ───────────────────────────────────────────────

export interface ReopenQuincenaResult {
  message: string;
  trainer_id: string;
  year: number;
  month: number;
  quincena: ClosureQuincena;
  adjustments_deleted: number;
}

// ─── Retorno de add-closure-adjustment ───────────────────────────────────────

export interface AddAdjustmentResult {
  adjustment_id: string;
  closure_id: string;
  amount_cop: number;
  reason: string;
  new_adjustments_total_cop: number;
  new_total_cop: number;
}

// ─── Retorno de delete-closure-adjustment ────────────────────────────────────

export interface DeleteAdjustmentResult {
  adjustment_id: string;
  closure_id: string;
  new_adjustments_total_cop: number;
  new_total_cop: number;
}

// ─── Retorno de mark-closure-paid ────────────────────────────────────────────

export interface MarkClosurePaidResult {
  closure_id: string;
  status: 'paid';
  trainer_id: string;
  year: number;
  month: number;
  quincena: ClosureQuincena;
  total_cop: number;
  payment_date: string;
  payment_method: PaymentMethod;
  paid_at: string;
  paid_by: string;
}

// ─── Structured error from Edge Functions ────────────────────────────────────

export interface ClosureEdgeFunctionError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

// ─── UI state helpers ─────────────────────────────────────────────────────────

/** Month/year pair for navigation. */
export interface MonthYear {
  year: number;
  month: number;
}

/** Maps edge-function error codes to user-friendly Spanish messages. */
export function mapClosureErrorToMessage(
  code: string,
  details: Record<string, unknown>
): string {
  switch (code) {
    case 'FORBIDDEN':
      return 'No tienes permiso para realizar esta acción.';
    case 'TRAINER_NOT_FOUND':
      return 'El entrenador no fue encontrado.';
    case 'CLOSURE_NOT_FOUND':
      return 'El cierre no fue encontrado.';
    case 'ADJUSTMENT_NOT_FOUND':
      return 'El ajuste no fue encontrado.';
    case 'INVALID_QUINCENA':
      return 'Quincena inválida. Debe ser Q1 o Q2.';
    case 'INVALID_MONTH':
      return `Mes inválido: ${details['received'] ?? ''}.`;
    case 'INVALID_YEAR':
      return `Año inválido: ${details['received'] ?? ''}.`;
    case 'CLOSURE_ALREADY_PAID':
      return 'Este cierre ya fue marcado como pagado y no puede modificarse.';
    case 'CLOSURE_NOT_CLOSED':
      return 'La quincena debe estar cerrada antes de marcarla como pagada.';
    case 'CLOSURE_ALREADY_EXISTS':
      return 'La quincena ya fue cerrada por otro proceso. Recarga para ver el estado actual.';
    case 'INVALID_ADJUSTMENT_AMOUNT':
      return 'El monto del ajuste no puede ser cero.';
    case 'REASON_REQUIRED':
      return 'La razón del ajuste es obligatoria.';
    case 'PAYMENT_DATE_REQUIRED':
      return 'La fecha de pago es obligatoria.';
    case 'PAYMENT_DATE_IN_FUTURE':
      return 'La fecha de pago no puede ser futura.';
    case 'PAYMENT_METHOD_REQUIRED':
      return 'El método de pago es obligatorio.';
    case 'INTERNAL_ERROR':
      return 'Ocurrió un error inesperado. Intenta de nuevo.';
    default:
      return 'Ocurrió un error inesperado. Intenta de nuevo.';
  }
}

/** Month names in Spanish (0-indexed as returned by JavaScript Date). */
export const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  nequi: 'Nequi',
  other: 'Otros'
};
