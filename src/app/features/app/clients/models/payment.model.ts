import { PaymentMethod, PaymentStatus, Discount, Payment } from 'src/app/core/types/supabase';

// Re-export for convenience within this feature.
export type { PaymentMethod, PaymentStatus, Payment, Discount };

// ─── Response types from Edge Functions ───────────────────────────────────────

export interface NextPeriodStartResponse {
  suggested_period_start: string | null;
  last_period_end: string | null;
  is_first_payment: boolean;
}

/** Structured error from any Edge Function. */
export interface EdgeFunctionError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/** Discriminated result: either open-payment info or next-period data. */
export type NextPeriodStartResult =
  | { type: 'next_period'; data: NextPeriodStartResponse }
  | { type: 'open_payment'; openPaymentId: string; openPeriodStart: string };

export interface OpenPaymentInfo {
  id: string;
  period_start: string;
  period_end: string;
  plan_total_cop: number;
  discount_amount_cop: number;
  balance_cop: number;
  status: PaymentStatus;
}

export interface RegisterPaymentPayload {
  client_id: string;
  period_start: string;
  reception_date: string;
  amount_received_cop: number;
  payment_method: PaymentMethod | null;
  discount_code?: string | null;
  notes?: string | null;
}

export interface RegisterPaymentResponse {
  id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  plan_total_cop: number;
  discount_amount_cop: number;
  balance_cop: number;
  status: PaymentStatus;
  reception_date: string;
}

export interface RegisterInstallmentPayload {
  payment_id: string;
  reception_date: string;
  amount_cop: number;
  payment_method: PaymentMethod;
  notes?: string | null;
}

export interface RegisterInstallmentResponse {
  installment_id: string;
  payment_id: string;
  nuevo_balance: number;
  nuevo_status: PaymentStatus;
  reception_date_padre_actualizada: string;
}

// ─── Payment method display labels ────────────────────────────────────────────

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  nequi: 'Nequi',
  other: 'Otros'
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pendiente',
  partial: 'Pago parcial',
  paid: 'Al día',
  voided: 'Anulado'
};

// ─── Receipt email DTOs (send-payment-receipt EF contract) ───────────────────

export type SendReceiptStatus = 'sent' | 'already_sent';

/** Successful response from send-payment-receipt. */
export interface SendReceiptSuccess {
  status: SendReceiptStatus;
  /** Resend ID of the email. Present only when status = 'sent'. */
  receipt_email_id?: string | null;
}

/** Structured error payload from send-payment-receipt. */
export interface SendReceiptErrorPayload {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

/**
 * Maps a send-receipt error code to a human-readable message for the admin.
 * Pure function — has no side effects.
 */
export function mapReceiptErrorToMessage(
  code: string,
  fallbackMessage?: string
): string {
  switch (code) {
    case 'RESEND_ERROR':
    case 'RESEND_AUTH_ERROR':
    case 'RESEND_RATE_LIMIT':
      return 'Servicio de correo temporalmente no disponible';
    case 'LOCK_CONTENTION':
      return 'Otro proceso está enviando este recibo, espera unos segundos y reintenta';
    case 'PAYMENT_NOT_FOUND_OR_NOT_PAID':
      return 'El pago no está en estado válido para enviar recibo';
    case 'INTERNAL_ERROR':
    case 'CLIENT_PROFILE_NOT_FOUND':
    default:
      return fallbackMessage ?? 'Error inesperado al enviar correo';
  }
}

// ─── Error code → human-readable message mapper ───────────────────────────────

export function mapPaymentErrorToMessage(
  code: string,
  details: Record<string, unknown>
): string {
  const formatCop = (amount: unknown): string => {
    if (typeof amount !== 'number') return String(amount ?? '');
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount);
  };

  switch (code) {
    case 'FORBIDDEN':
      return 'No tienes permiso para registrar pagos.';
    case 'CLIENT_NOT_FOUND':
      return 'Cliente no encontrado.';
    case 'CLIENT_NOT_ACTIVE':
      return 'El cliente está inactivo. Actívalo antes de registrar un pago.';
    case 'NO_ACTIVE_TRAINER_ASSIGNED':
      return 'El cliente no tiene un entrenador asignado. Asígnalo antes de registrar un pago.';
    case 'PLAN_PRICE_NOT_FOUND':
      return 'No hay un precio vigente para el plan del cliente en esa fecha.';
    case 'DISCOUNT_NOT_FOUND_OR_INACTIVE':
      return 'El código de descuento no existe o está desactivado.';
    case 'AMOUNT_EXCEEDS_TOTAL': {
      const received = formatCop(details['amount_received_cop']);
      const total = formatCop(details['total_a_pagar']);
      return `El valor recibido (${received}) supera el total a pagar (${total}).`;
    }
    case 'PAYMENT_METHOD_REQUIRED':
      return 'Debes seleccionar un método de pago.';
    case 'PERIOD_START_OVERLAPS_PREVIOUS': {
      const lastEnd = details['last_period_end'];
      return `La fecha de inicio se solapa con un pago anterior. Mínimo permitido: ${lastEnd}.`;
    }
    case 'PERIOD_START_TOO_FAR_IN_FUTURE': {
      const maxDate = details['max_allowed_date'];
      return `La fecha de inicio no puede ser posterior a ${maxDate} (máximo 2 meses a futuro).`;
    }
    case 'PAYMENT_NOT_FOUND':
      return 'Pago no encontrado.';
    case 'PAYMENT_ALREADY_PAID':
      return 'El pago ya está al día.';
    case 'PAYMENT_IS_VOIDED':
      return 'El pago está anulado.';
    case 'INVALID_AMOUNT':
      return 'El monto del abono debe ser mayor a 0.';
    case 'AMOUNT_EXCEEDS_BALANCE': {
      const amount = formatCop(details['amount_cop']);
      const balance = formatCop(details['balance_cop']);
      return `El abono (${amount}) supera el saldo pendiente (${balance}).`;
    }
    case 'INTERNAL_ERROR':
      return 'Ocurrió un error inesperado. Intenta de nuevo.';
    default:
      return 'Ocurrió un error inesperado. Intenta de nuevo.';
  }
}
