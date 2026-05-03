// ─── Payload types (mirrors the EF contract exactly) ─────────────────────────

export type SendMeasurementsSharePayload =
  | { mode: 'single'; measurement_id: string }
  | { mode: 'compare'; measurement_id_a: string; measurement_id_b: string };

/** Successful response from send-measurements-share EF. */
export interface SendShareSuccess {
  status: 'sent';
  resend_id: string;
}

/** Structured error payload from any Edge Function. */
export interface ShareErrorPayload {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

// ─── Modal state types ────────────────────────────────────────────────────────

export type MeasurementShareMode = 'single' | 'compare';
export type ShareEmailState = 'idle' | 'sending' | 'sent' | 'error';

export interface MeasurementShareData {
  mode: MeasurementShareMode;
  clientName: string;
  clientEmail: string;
  /**
   * Preview label shown to the user before confirming.
   * single: "26 abr 2026"
   * compare: "26 mar 2026 → 28 abr 2026"
   */
  measurementDateLabel: string;
  /** Actual IDs for the EF payload. */
  payload: SendMeasurementsSharePayload;
}

// ─── Error code → UI message mapper ──────────────────────────────────────────

/**
 * Maps a send-measurements-share error code to a human-readable message.
 * Uses the exact messages from section 6 of the API contract.
 * Pure function — no side effects.
 */
export function mapShareErrorToMessage(code: string, fallback?: string): string {
  switch (code) {
    case 'UNAUTHORIZED_NO_AUTH_HEADER':
      return 'Sesión no encontrada. Vuelve a iniciar sesión.';
    case 'UNAUTHORIZED_INVALID_TOKEN':
      return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    case 'FORBIDDEN_ROLE':
      return 'No tienes permisos para compartir medidas.';
    case 'FORBIDDEN_NOT_ASSIGNED':
      return 'No tienes acceso a las medidas de este cliente.';
    case 'BAD_REQUEST_INVALID_PAYLOAD':
      return 'Datos de la solicitud inválidos.';
    case 'BAD_REQUEST_SAME_MEASUREMENT':
      return 'Selecciona dos medidas diferentes para comparar.';
    case 'BAD_REQUEST_CLIENT_MISMATCH':
      return 'Las medidas seleccionadas pertenecen a clientes distintos.';
    case 'MEASUREMENT_NOT_FOUND':
      return 'Esta medida ya no existe en el sistema.';
    case 'RESEND_AUTH_ERROR':
      return 'Error de configuración del servicio de correo. Contacta al administrador.';
    case 'RESEND_ERROR':
      return 'Error al enviar el correo. Intenta de nuevo en unos minutos.';
    case 'RESEND_RATE_LIMIT':
      return 'Demasiados envíos en poco tiempo. Espera un momento e intenta de nuevo.';
    case 'CLIENT_PROFILE_NOT_FOUND':
      return 'Error de datos. Contacta al administrador.';
    case 'INTERNAL_ERROR':
    default:
      return fallback ?? 'Error inesperado. Si el problema persiste, contacta al soporte.';
  }
}
