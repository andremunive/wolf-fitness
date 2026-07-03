import {
  CafeteriaComboPurchaseWithDetails,
  CafeteriaSaleWithDetails
} from './cafeteria.model';

// ─── Ventas individuales enriquecidas ─────────────────────────────────────────

/**
 * Extiende CafeteriaSaleWithDetails con campos derivados pre-calculados
 * en el servicio para evitar cómputos repetidos por fila en el template.
 */
export interface CafeteriaSaleView extends CafeteriaSaleWithDetails {
  /** Precio snapshot × cantidad (total bruto de la venta). */
  total_cop: number;
  /** Porcentaje de pago recibido sobre el total (0-100, redondeado). */
  progress_percent: number;
  /** True cuando amount_received_cop >= total_cop. */
  is_fully_paid: boolean;
  /** Nombre del comprador (client.full_name > trainer.full_name > '—'). */
  buyer_name: string;
  /** True cuando sale_date y reported_date existen y difieren. */
  has_different_reg_date: boolean;
}

// ─── Compras de combo enriquecidas ────────────────────────────────────────────

/**
 * Extiende CafeteriaComboPurchaseWithDetails con campos derivados
 * pre-calculados en el servicio.
 */
export interface CafeteriaComboPurchaseView extends CafeteriaComboPurchaseWithDetails {
  /** Nombre del comprador (client.full_name > trainer.full_name > '—'). */
  buyer_name: string;
  /** Porcentaje de unidades consumidas sobre total_units (0-100, redondeado). */
  consumption_percent: number;
  /** Porcentaje del precio cobrado sobre combo_price_snapshot_cop (0-100, redondeado). */
  payment_percent: number;
}

// ─── Resultado de getSales ────────────────────────────────────────────────────

export interface CafeteriaSalesResult {
  sales: CafeteriaSaleView[];
  summary: {
    /** Suma de amount_received_cop de todas las ventas del período. */
    total_ingresos_cop: number;
    /** Total de ventas registradas en el período. */
    count: number;
    /** Suma de balance_cop de ventas con status 'pending' o 'partial'. */
    saldo_pendiente_cop: number;
  };
}

// ─── Resultado de getComboPurchases ──────────────────────────────────────────

export interface CafeteriaCombosResult {
  purchases: CafeteriaComboPurchaseView[];
  summary: {
    /** Suma de amount_received_cop de todas las compras de combo del período. */
    total_ingresos_cop: number;
    /** Total de compras de combo registradas en el período. */
    count: number;
    /** Suma de balance_cop de compras con status 'pending' o 'partial'. */
    saldo_pendiente_cop: number;
  };
}
