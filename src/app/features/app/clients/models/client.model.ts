import { Gender } from 'src/app/core/types/supabase';

// Enums del dominio — alineados con los tipos Supabase.
// El enum real en BD tiene 4 valores; suspended/overdue no se usan operativamente todavía.
export type ClientStatus = 'active' | 'inactive' | 'suspended' | 'overdue';

// Re-export so feature-level code can import Gender from one place.
export type { Gender };
export type ClientOrigin = 'referido' | 'publicidad' | 'llego_solo';

/**
 * Estado de membresía calculado server-side por la vista v_clients_with_payment_status.
 * Refleja si la membresía del cliente está vigente, próxima a vencer, etc.
 */
export type MembershipStatus = 'active' | 'partial' | 'pending' | 'expired' | 'no_payment';

/**
 * Estado del último pago del cliente.
 * Tipo text (no enum) porque incluye el centinela 'no_payments' para clientes sin pagos.
 */
export type ClientPaymentStatusDisplay =
  | 'pending'
  | 'partial'
  | 'paid'
  | 'voided'
  | 'no_payments';

// ─── Modelos de dominio ────────────────────────────────────────────────────────

export interface Plan {
  id: string;
  name: string;
  code: string;
  /** Precio vigente en COP. Null si no hay price activo. */
  amountCop: number | null;
}

export interface TrainerOption {
  id: string;
  fullName: string;
}

/**
 * Cliente tal como lo devuelve la vista v_clients_with_payment_status.
 * Extiende el modelo previo con los campos de estado de pagos.
 */
export interface Client {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  isActive: boolean;
  status: ClientStatus;
  origin: ClientOrigin;
  joinedAt: string;
  createdAt: string;
  planId: string;
  planName: string;
  planAmountCop: number | null;
  trainerName: string | null;
  referredByName: string | null;

  // ── Campos de pagos (Hito 4.5) ──────────────────────────────────────────────

  /** Estado del último pago no anulado, o 'no_payments' si no hay pagos. */
  lastPaymentStatus: ClientPaymentStatusDisplay;

  /**
   * Saldo pendiente del último pago activo, en COP.
   * NULL si no hay pagos. Solo mostrar en UI cuando > 0.
   */
  lastPaymentBalanceCop: number | null;

  /**
   * Fecha de vencimiento del período del último pago activo (ISO date string).
   * NULL si no hay pagos.
   */
  lastPaymentPeriodEnd: string | null;

  /**
   * Fecha del último evento de cobro real (pago inicial con dinero o abono).
   * NULL si no se ha recibido dinero todavía.
   */
  lastEventDate: string | null;

  /**
   * Monto del último evento individual de cobro, en COP.
   * NULL si no se ha recibido dinero todavía.
   */
  lastEventAmountCop: number | null;

  /**
   * Estado de membresía calculado server-side.
   * Replica la lógica de vigencia de período con base en last_payment_period_end.
   */
  membershipStatus: MembershipStatus;
}

/**
 * Versión extendida del cliente para precarga en el formulario de edición.
 * `gender` is NOT NULL in the `profiles` table — typed as Gender (not nullable).
 */
export interface ClientDetailFull extends Client {
  birthDate: string;
  neighborhood: string;
  gender: Gender;
  /** Talla del cliente en centímetros. Null si aún no se ha registrado. */
  heightCm: number | null;
  referredById: string | null;
  trainerId: string | null;
}

// ─── Parámetros de consulta ────────────────────────────────────────────────────

export interface ClientsQueryParams {
  search?: string;
  /** Filtro multi-selección por estado de membresía. Lista vacía = sin filtro. */
  membershipStatuses?: MembershipStatus[];
  /** Filtro multi-selección por origen del cliente. Lista vacía = sin filtro. */
  origins?: ClientOrigin[];
  /** UUID de un trainer para mostrar solo sus clientes (asignación activa). */
  trainerId?: string | null;
  page: number;
  pageSize: number;
}

export interface ClientsPage {
  items: Client[];
  total: number;
}

// ─── Payloads para Edge Functions ─────────────────────────────────────────────

export interface CreateClientPayload {
  full_name: string;
  email: string;
  phone: string;
  birth_date: string;
  gender?: string;
  /** Talla en centímetros. Obligatoria en creación (validada en el wizard). */
  height_cm: number;
  neighborhood: string;
  origin: ClientOrigin;
  referred_by?: string;
  plan_id: string;
  joined_at?: string;
  trainer_id?: string;
}

export interface CreateClientResult {
  id: string;
  email: string;
  full_name: string;
  plan_id: string;
  status: 'active';
  origin: ClientOrigin;
  trainer_assigned: boolean;
  trainer_id: string | null;
  temporary_password: string;
}

export interface DeactivateClientResult {
  success: true;
  client_id: string;
  status: 'inactive';
  is_active: false;
  assignment_closed: boolean;
}

export interface UpdateClientPayload {
  client_id: string;
  /** Campos del perfil que cambiaron. Solo incluir los modificados. */
  profile?: {
    full_name?: string;
    phone?: string;
    birth_date?: string;
    neighborhood?: string;
    gender?: string | null;
    /** Talla en centímetros. Null para borrar el valor. */
    height_cm?: number | null;
  };
  /** Si cambió el plan, usar RPC — no el campo directo. UUID del nuevo plan. */
  new_plan_id?: string;
  /** Si cambió el trainer, usar RPC. UUID del nuevo trainer o null para quitar. */
  new_trainer_id?: string | null;
  origin?: ClientOrigin;
  referred_by?: string | null;
}
