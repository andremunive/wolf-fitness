import { ExpenseCategory, ExpenseRecord, ExpenseRecordItem } from 'src/app/core/types/supabase';
import { PAYMENT_METHOD_LABELS } from 'src/app/features/app/closures/models/closure.model';

export { PAYMENT_METHOD_LABELS };

// ─── MonthYear (same shape as closures, defined locally to avoid cross-feature import) ─

export interface MonthYear {
  year: number;
  month: number;
}

export const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// ─── Period filter ─────────────────────────────────────────────────────────────

export type PeriodFilterKey = 1 | 2 | 3 | 6;

export interface PeriodFilter {
  key: PeriodFilterKey;
  label: string;
}

export const PERIOD_FILTERS: PeriodFilter[] = [
  { key: 1, label: 'Último mes' },
  { key: 2, label: 'Últimos 2 meses' },
  { key: 3, label: 'Últimos 3 meses' },
  { key: 6, label: 'Últimos 6 meses' }
];

/** Returns start/end dates for the selected period, counted backward from today. */
export function buildPeriodRange(monthCount: PeriodFilterKey): { start: string; end: string } {
  const today = new Date();
  const end = formatDate(today);

  // Start = 1st of the month that is (monthCount - 1) months before current month.
  const startDate = new Date(today.getFullYear(), today.getMonth() - (monthCount - 1), 1);
  const start = formatDate(startDate);

  return { start, end };
}

// ─── Category view model ───────────────────────────────────────────────────────

export interface ExpenseCategoryViewModel {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export function mapCategoryRow(row: ExpenseCategory): ExpenseCategoryViewModel {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at
  };
}

// ─── Expense item view model ───────────────────────────────────────────────────

export interface ExpenseItemViewModel {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPriceCop: number;
  subtotalCop: number;
  updatedAt: string;
}

export function mapExpenseItemRow(row: ExpenseRecordItem): ExpenseItemViewModel {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    quantity: row.quantity,
    unitPriceCop: row.unit_price_cop,
    subtotalCop: row.subtotal_cop,
    updatedAt: row.updated_at
  };
}

// ─── Expense record view model ─────────────────────────────────────────────────

export interface ExpenseRecordRow extends ExpenseRecord {
  expense_categories?: { name: string; emoji: string | null } | null;
  service_providers?: {
    id: string;
    name: string;
    service_types?: { name: string } | null;
  } | null;
  expense_record_items?: ExpenseRecordItem[];
}

export interface ExpenseRecordViewModel {
  id: string;
  expenseDate: string;
  amountCop: number;
  paymentMethod: string;
  categoryId: string;
  categoryName: string;
  categoryEmoji: string | null;
  providerId: string;
  providerName: string;
  serviceTypeName: string;
  notes: string | null;
  isActive: boolean;
  hasInvoice: boolean;
  invoiceStoragePath: string | null;
  invoiceMimeType: string | null;
  invoiceSizeBytes: number | null;
  items: ExpenseItemViewModel[];
  createdAt: string;
}

export function mapExpenseRecordRow(row: ExpenseRecordRow): ExpenseRecordViewModel {
  return {
    id: row.id,
    expenseDate: row.expense_date,
    amountCop: row.amount_cop,
    paymentMethod: row.payment_method,
    categoryId: row.category_id,
    categoryName: row.expense_categories?.name ?? '',
    categoryEmoji: row.expense_categories?.emoji ?? null,
    providerId: row.provider_id,
    providerName: row.service_providers?.name ?? '',
    serviceTypeName: row.service_providers?.service_types?.name ?? '',
    notes: row.notes,
    isActive: row.is_active,
    hasInvoice: row.invoice_storage_path !== null,
    invoiceStoragePath: row.invoice_storage_path,
    invoiceMimeType: row.invoice_mime_type,
    invoiceSizeBytes: row.invoice_size_bytes,
    items: (row.expense_record_items ?? []).map(mapExpenseItemRow),
    createdAt: row.created_at
  };
}

// ─── Summary (from get_expense_summary_by_category RPC) ───────────────────────

export interface ExpenseSummaryByCategory {
  category_id: string;
  category_name: string;
  category_emoji: string | null;
  total_cop: number;
  record_count: number;
}

// ─── Payloads ──────────────────────────────────────────────────────────────────

export interface CreateExpenseCategoryPayload {
  name: string;
  emoji?: string | null;
  description?: string | null;
}

export interface UpdateExpenseCategoryPayload {
  name?: string;
  emoji?: string | null;
  description?: string | null;
  is_active?: boolean;
}

export interface CreateExpenseItemPayload {
  name: string;
  description?: string | null;
  quantity: number;
  unit_price_cop: number;
  /** Calculated by caller: Math.round(quantity * unit_price_cop) */
  subtotal_cop: number;
}

export interface UpdateExpenseItemPayload {
  name?: string;
  description?: string | null;
  quantity?: number;
  unit_price_cop?: number;
  subtotal_cop?: number;
}

export interface ItemsDiffPayload {
  items_to_create: CreateExpenseItemPayload[];
  items_to_update: Array<{ id: string } & UpdateExpenseItemPayload>;
  items_to_delete: string[];
}

export interface CreateExpenseRecordPayload {
  expense_date: string;
  amount_cop: number;
  payment_method: string;
  category_id: string;
  provider_id: string;
  notes?: string | null;
  created_by: string;
  /** Optional invoice metadata — all three must be present or all absent. */
  invoice_storage_path?: string | null;
  invoice_mime_type?: string | null;
  invoice_size_bytes?: number | null;
  /** Items to insert after the record is created. Empty array if no breakdown. */
  items: CreateExpenseItemPayload[];
}

export interface UpdateExpenseRecordPayload {
  expense_date?: string;
  amount_cop?: number;
  payment_method?: string;
  category_id?: string;
  provider_id?: string;
  notes?: string | null;
  is_active?: boolean;
  invoice_storage_path?: string | null;
  invoice_mime_type?: string | null;
  invoice_size_bytes?: number | null;
  /** Item diff for update operations. */
  itemsDiff?: ItemsDiffPayload;
}

// ─── Re-export SimpleProviderOption so modals can import it from one place ────

export { SimpleProviderOption } from 'src/app/features/app/service-providers/models/service-provider.model';

// ─── Amount formatting helpers ─────────────────────────────────────────────────

/**
 * Formats an amount (COP integer) for display inside chart bars.
 * Examples: 1_250_000 → "1.25M", 250_000 → "250K", 15_000 → "15K", 999 → "$999"
 */
export function formatAmountShort(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    const rounded = Math.round(millions * 100) / 100;
    return `$${rounded}M`;
  }
  if (amount >= 1_000) {
    const thousands = Math.round(amount / 1_000);
    return `$${thousands}K`;
  }
  return `$${amount}`;
}

/**
 * Formats an amount as full COP currency string.
 * Example: 1_250_000 → "$1.250.000"
 */
export function formatAmountCop(amount: number): string {
  return '$' + amount.toLocaleString('es-CO');
}

// ─── Color palette for chart bars ─────────────────────────────────────────────

const CHART_PASTEL_PALETTE = [
  '#fef3c7', // amber-100
  '#dbeafe', // blue-100
  '#fce7f3', // pink-100
  '#d1fae5', // green-100
  '#e0e7ff', // indigo-100
  '#fee2e2', // red-100
  '#fef9c3', // yellow-100
  '#cffafe', // cyan-100
];

const CHART_PASTEL_BORDER = [
  '#f59e0b', // amber-400
  '#3b82f6', // blue-400
  '#ec4899', // pink-400
  '#10b981', // green-400
  '#6366f1', // indigo-400
  '#ef4444', // red-400
  '#eab308', // yellow-400
  '#06b6d4', // cyan-400
];

/**
 * Deterministic color assignment: the same categoryId always maps to the same
 * palette slot. Uses a simple character-code hash of the UUID.
 */
export function getCategoryColor(categoryId: string): { bg: string; border: string } {
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) {
    hash = (hash * 31 + categoryId.charCodeAt(i)) & 0xffffffff;
  }
  const index = Math.abs(hash) % CHART_PASTEL_PALETTE.length;
  return { bg: CHART_PASTEL_PALETTE[index], border: CHART_PASTEL_BORDER[index] };
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayString(): string {
  return formatDate(new Date());
}

export function firstDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function lastDayOfMonth(year: number, month: number): string {
  const last = new Date(year, month, 0); // day 0 of next month = last day of current
  return formatDate(last);
}
