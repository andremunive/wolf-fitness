import { Database } from 'src/app/core/types/supabase';

// ─── Productos ────────────────────────────────────────────────────────────────

export type CafeteriaProduct = Database['public']['Tables']['cafeteria_products']['Row'];
export type CafeteriaProductInsert = Database['public']['Tables']['cafeteria_products']['Insert'];
export type CafeteriaProductUpdate = Database['public']['Tables']['cafeteria_products']['Update'];

// ─── Historial de precios ─────────────────────────────────────────────────────

export type CafeteriaProductPriceHistory = Database['public']['Tables']['cafeteria_product_price_history']['Row'];
export type CafeteriaProductPriceHistoryInsert = Database['public']['Tables']['cafeteria_product_price_history']['Insert'];

// ─── Combos ───────────────────────────────────────────────────────────────────

export type CafeteriaCombo = Database['public']['Tables']['cafeteria_combos']['Row'];
export type CafeteriaComboInsert = Database['public']['Tables']['cafeteria_combos']['Insert'];
export type CafeteriaComboUpdate = Database['public']['Tables']['cafeteria_combos']['Update'];

export type CafeteriaComboWithProduct = CafeteriaCombo & {
  product: Pick<CafeteriaProduct, 'name' | 'size_label' | 'price_cop'> | null;
};

// ─── Ventas ───────────────────────────────────────────────────────────────────

export type CafeteriaSale = Database['public']['Tables']['cafeteria_sales']['Row'];
export type CafeteriaSaleInsert = Database['public']['Tables']['cafeteria_sales']['Insert'];
export type CafeteriaSaleUpdate = Database['public']['Tables']['cafeteria_sales']['Update'];

// ─── Cuotas de venta ──────────────────────────────────────────────────────────

export type CafeteriaInstallment = Database['public']['Tables']['cafeteria_installments']['Row'];
export type CafeteriaInstallmentInsert = Database['public']['Tables']['cafeteria_installments']['Insert'];
export type CafeteriaInstallmentUpdate = Database['public']['Tables']['cafeteria_installments']['Update'];

// ─── Compras de combo ─────────────────────────────────────────────────────────

export type CafeteriaComboPurchase = Database['public']['Tables']['cafeteria_combo_purchases']['Row'];
export type CafeteriaComboPurchaseInsert = Database['public']['Tables']['cafeteria_combo_purchases']['Insert'];
export type CafeteriaComboPurchaseUpdate = Database['public']['Tables']['cafeteria_combo_purchases']['Update'];

// ─── Consumos de combo ────────────────────────────────────────────────────────

export type CafeteriaComboConsumption = Database['public']['Tables']['cafeteria_combo_consumptions']['Row'];
export type CafeteriaComboConsumptionInsert = Database['public']['Tables']['cafeteria_combo_consumptions']['Insert'];

// ─── Ventas con detalle ───────────────────────────────────────────────────────

export type CafeteriaSaleWithDetails = CafeteriaSale & {
  product: Pick<CafeteriaProduct, 'name' | 'size_label'> | null;
  client: { id: string; full_name: string } | null;
  trainer: { id: string; full_name: string } | null;
};

// ─── Compras de combo con detalle ─────────────────────────────────────────────

export type CafeteriaComboPurchaseWithDetails = CafeteriaComboPurchase & {
  combo: {
    id: string;
    name: string;
    quantity: number;
    product: Pick<CafeteriaProduct, 'name' | 'size_label'> | null;
  } | null;
  client: { id: string; full_name: string } | null;
  trainer: { id: string; full_name: string } | null;
};

export type ClientActiveCombo = CafeteriaComboPurchase & {
  combo: {
    id: string;
    name: string;
    quantity: number;
    product: Pick<CafeteriaProduct, 'name' | 'size_label'> | null;
  } | null;
};

export type ActiveClient = { id: string; full_name: string };
export type TrainerOption = { id: string; full_name: string };

// ─── Categorías de gasto ──────────────────────────────────────────────────────

export type CafeteriaExpenseCategory = Database['public']['Tables']['cafeteria_expense_categories']['Row'];
export type CafeteriaExpenseCategoryInsert = Database['public']['Tables']['cafeteria_expense_categories']['Insert'];
export type CafeteriaExpenseCategoryUpdate = Database['public']['Tables']['cafeteria_expense_categories']['Update'];

// ─── Gastos / Insumos ─────────────────────────────────────────────────────────

export type CafeteriaExpense = Database['public']['Tables']['cafeteria_expenses']['Row'];
export type CafeteriaExpenseInsert = Database['public']['Tables']['cafeteria_expenses']['Insert'];
export type CafeteriaExpenseUpdate = Database['public']['Tables']['cafeteria_expenses']['Update'];

export type CafeteriaExpenseWithDetails = CafeteriaExpense & {
  category: Pick<CafeteriaExpenseCategory, 'name'> | null;
  created_by_name: string | null;
};

// ─── Consolidaciones quincenales ──────────────────────────────────────────────

export type CafeteriaConsolidation = Database['public']['Tables']['cafeteria_consolidations']['Row'];
export type CafeteriaConsolidationInsert = Database['public']['Tables']['cafeteria_consolidations']['Insert'];
export type CafeteriaConsolidationUpdate = Database['public']['Tables']['cafeteria_consolidations']['Update'];

export type CafeteriaConsolidationPreview = {
  period_start: string;
  period_end: string;
  total_sales_cop: number;
  total_expenses_cop: number;
  net_cop: number;
  sales_count: number;
  combo_purchases_count: number;
  expenses_count: number;
  pending_sales_count: number;
  pending_combo_purchases_count: number;
};

export type CafeteriaConsolidationWithUser = CafeteriaConsolidation & {
  consolidated_by_name: string | null;
};

// ─── Dashboard de cafetería ───────────────────────────────────────────────────

export type CafeteriaDashboardData = {
  periodo: {
    fecha_inicio: string;
    fecha_fin: string;
    es_parcial: boolean;
    fecha_corte: string;
  };
  resumen: {
    ingresos_cop: number;
    costos_cop: number;
    utilidad_cop: number;
    margen_pct: number | null;
    unidades_vendidas: number;
    ticket_promedio_cop: number | null;
    ventas_count: number;
    combos_count: number;
  };
  ingresos_anteriores: {
    ingresos_cop: number;
    unidades_vendidas: number;
  };
  por_producto: Array<{
    product_id: string;
    product_name: string;
    size_label: string;
    unidades_vendidas: number;
    ingresos_cop: number;
    costo_proporcional_cop: number;
    utilidad_cop: number;
  }>;
  ranking_compradores: Array<{
    buyer_id: string;
    buyer_name: string;
    buyer_type: 'client' | 'trainer';
    total_cop: number;
    unidades: number;
  }>;
  combos_activos: Array<{
    purchase_id: string;
    client_name: string;
    combo_name: string;
    product_name: string;
    units_consumed: number;
    units_remaining: number;
    total_units: number;
    purchase_date: string;
  }>;
  ventas_pendientes: Array<{
    sale_id: string;
    sale_type: 'individual' | 'combo';
    buyer_name: string;
    product_name: string;
    monto_pendiente_cop: number;
    dias_transcurridos: number;
    sale_date: string;
  }>;
};
