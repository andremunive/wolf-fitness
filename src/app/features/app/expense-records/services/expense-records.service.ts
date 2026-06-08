import { Injectable } from '@angular/core';
import { from as fromPromise, Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { SupabaseService } from 'src/app/core/services/supabase.service';
import { ExpenseRecordInsert, ExpenseRecordItemInsert, ExpenseRecordItemUpdate, ExpenseRecordUpdate } from 'src/app/core/types/supabase';
import {
  CreateExpenseItemPayload,
  CreateExpenseRecordPayload,
  ExpenseRecordRow,
  ExpenseRecordViewModel,
  ExpenseSummaryByCategory,
  ItemsDiffPayload,
  mapExpenseRecordRow,
  UpdateExpenseRecordPayload
} from '../models/expense-record.model';

const PAGE_SIZE = 10;

const RECORD_SELECT_LIST =
  'id, expense_date, amount_cop, payment_method, category_id, provider_id, notes, is_active, created_at, updated_at, created_by, updated_by, invoice_storage_path, invoice_mime_type, invoice_size_bytes, expense_categories(name, expense_type), service_providers(id, name, service_types(name))';

const RECORD_SELECT_DETAIL =
  'id, expense_date, amount_cop, payment_method, category_id, provider_id, notes, is_active, created_at, updated_at, created_by, updated_by, invoice_storage_path, invoice_mime_type, invoice_size_bytes, expense_categories(name, expense_type), service_providers(id, name, service_types(name)), expense_record_items(id, name, description, quantity, unit_price_cop, subtotal_cop, updated_at)';

const ALLOWED_INVOICE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
];
const MAX_INVOICE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ExpenseRecordsPage {
  items: ExpenseRecordViewModel[];
  total: number;
}

export interface InvoiceUploadResult {
  path: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable({ providedIn: 'root' })
export class ExpenseRecordsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Paginated list for a given month, ordered by expense_date DESC.
   * Optionally filtered by categoryId.
   * Includes provider name and service type via JOIN — items are NOT loaded here
   * to keep the list query lightweight.
   */
  listByMonth(
    year: number,
    month: number,
    page: number,
    categoryId: string | null
  ): Observable<ExpenseRecordsPage> {
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = this.lastDayOfMonth(year, month);
    const rangeFrom = (page - 1) * PAGE_SIZE;
    const rangeTo = rangeFrom + PAGE_SIZE - 1;

    let dataQuery = this.supabase.client
      .from('expense_records')
      .select(RECORD_SELECT_LIST, { count: 'exact' })
      .eq('is_active', true)
      .gte('expense_date', firstDay)
      .lte('expense_date', lastDay);

    if (categoryId) {
      dataQuery = dataQuery.eq('category_id', categoryId);
    }

    dataQuery = dataQuery
      .order('expense_date', { ascending: false })
      .range(rangeFrom, rangeTo);

    return fromPromise(dataQuery).pipe(
      map(({ data, error, count }) => {
        if (error) throw error;
        const items = ((data ?? []) as unknown as ExpenseRecordRow[]).map(mapExpenseRecordRow);
        return { items, total: count ?? 0 };
      }),
      catchError((err) => {
        console.error('[ExpenseRecordsService] listByMonth error:', err);
        throw err;
      })
    );
  }

  /**
   * Fetches a single record with full detail: provider, category, and items array.
   * Used to populate the detail modal and to re-fetch after create/update.
   */
  getById(id: string): Observable<ExpenseRecordViewModel> {
    return fromPromise(
      this.supabase.client
        .from('expense_records')
        .select(RECORD_SELECT_DETAIL)
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return mapExpenseRecordRow(data as unknown as ExpenseRecordRow);
      }),
      catchError((err) => {
        console.error('[ExpenseRecordsService] getById error:', err);
        throw err;
      })
    );
  }

  /** Calls the get_expense_summary_by_category SQL function. */
  getSummaryByCategory(
    startDate: string,
    endDate: string
  ): Observable<ExpenseSummaryByCategory[]> {
    return fromPromise(
      this.supabase.client.rpc('get_expense_summary_by_category', {
        p_start_date: startDate,
        p_end_date: endDate
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as ExpenseSummaryByCategory[];
      }),
      catchError((err) => {
        console.error('[ExpenseRecordsService] getSummaryByCategory error:', err);
        throw err;
      })
    );
  }

  /**
   * Creates an expense record using the two-step flow:
   * 1. Insert record without invoice.
   * 2. If items provided, insert them all.
   * 3. Re-fetch via getById to return the full view model.
   * Invoice upload is handled separately by the caller before calling this method
   * (caller passes the invoice metadata in the payload once already uploaded).
   */
  create(payload: CreateExpenseRecordPayload): Observable<ExpenseRecordViewModel> {
    const insertPayload: ExpenseRecordInsert = {
      expense_date: payload.expense_date,
      amount_cop: payload.amount_cop,
      payment_method: payload.payment_method as ExpenseRecordInsert['payment_method'],
      category_id: payload.category_id,
      provider_id: payload.provider_id,
      notes: payload.notes ?? null,
      created_by: payload.created_by,
      invoice_storage_path: payload.invoice_storage_path ?? null,
      invoice_mime_type: payload.invoice_mime_type ?? null,
      invoice_size_bytes: payload.invoice_size_bytes ?? null
    };

    return fromPromise(
      this.supabase.client
        .from('expense_records')
        .insert(insertPayload)
        .select('id')
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          if (this.isFutureDateError(error)) throw new Error('La fecha no puede ser futura.');
          if (this.isAmountError(error)) throw new Error('El monto debe ser mayor a cero.');
          throw error;
        }
        return (data as { id: string }).id;
      }),
      switchMap((recordId) => {
        if (!payload.items || payload.items.length === 0) {
          return this.getById(recordId);
        }
        return this.insertItems(recordId, payload.items).pipe(
          switchMap(() => this.getById(recordId))
        );
      }),
      catchError((err) => {
        console.error('[ExpenseRecordsService] create error:', err);
        throw err;
      })
    );
  }

  /**
   * Updates an expense record and applies an item diff (create/update/delete).
   * Invoice metadata updates are included in the patch payload when provided.
   */
  update(id: string, payload: UpdateExpenseRecordPayload): Observable<void> {
    const patch: ExpenseRecordUpdate = {};
    if (payload.expense_date !== undefined) patch.expense_date = payload.expense_date;
    if (payload.amount_cop !== undefined) patch.amount_cop = payload.amount_cop;
    if (payload.payment_method !== undefined) {
      patch.payment_method = payload.payment_method as ExpenseRecordUpdate['payment_method'];
    }
    if (payload.category_id !== undefined) patch.category_id = payload.category_id;
    if (payload.provider_id !== undefined) patch.provider_id = payload.provider_id;
    if (payload.notes !== undefined) patch.notes = payload.notes;
    if (payload.is_active !== undefined) patch.is_active = payload.is_active;
    // Invoice fields: update all three together or clear all together
    if (payload.invoice_storage_path !== undefined) {
      patch.invoice_storage_path = payload.invoice_storage_path;
      patch.invoice_mime_type = payload.invoice_mime_type ?? null;
      patch.invoice_size_bytes = payload.invoice_size_bytes ?? null;
    }

    const recordUpdate$ = fromPromise(
      this.supabase.client
        .from('expense_records')
        .update(patch)
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) {
          if (this.isFutureDateError(error)) throw new Error('La fecha no puede ser futura.');
          if (this.isAmountError(error)) throw new Error('El monto debe ser mayor a cero.');
          throw error;
        }
      })
    );

    return recordUpdate$.pipe(
      switchMap(() => {
        const diff = payload.itemsDiff;
        if (!diff) return of(undefined);
        return this.applyItemsDiff(id, diff);
      }),
      catchError((err) => {
        console.error('[ExpenseRecordsService] update error:', err);
        throw err;
      })
    );
  }

  /** Soft-deletes a record by setting is_active = false. */
  annul(id: string): Observable<void> {
    return this.update(id, { is_active: false });
  }

  // ─── Storage helpers ───────────────────────────────────────────────────────

  /**
   * Validates and uploads a file to the expense-invoices bucket.
   * Returns the path, mime type, and size in bytes.
   * Throws a descriptive Error if validation fails before reaching Storage.
   */
  uploadInvoice(recordId: string, file: File): Observable<InvoiceUploadResult> {
    if (!ALLOWED_INVOICE_MIME_TYPES.includes(file.type)) {
      return new Observable((sub) => {
        sub.error(new Error('Tipo de archivo no permitido. Solo PDF, JPG, PNG o WebP.'));
      });
    }
    if (file.size > MAX_INVOICE_SIZE_BYTES) {
      return new Observable((sub) => {
        sub.error(new Error('El archivo supera los 10 MB permitidos.'));
      });
    }

    const ext = this.extensionFromMime(file.type);
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const path = `expense_records/${recordId}/${fileName}`;

    return fromPromise(
      this.supabase.client.storage
        .from('expense-invoices')
        .upload(path, file, { contentType: file.type, upsert: false })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return { path, mimeType: file.type, sizeBytes: file.size };
      }),
      catchError((err) => {
        console.error('[ExpenseRecordsService] uploadInvoice error:', err);
        throw err;
      })
    );
  }

  /**
   * Generates a short-lived signed URL for downloading or previewing an invoice.
   * Default expiry: 60 seconds (enough to open the URL in a new tab).
   */
  getInvoiceSignedUrl(path: string, expiresIn = 60): Observable<string> {
    return fromPromise(
      this.supabase.client.storage
        .from('expense-invoices')
        .createSignedUrl(path, expiresIn)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data!.signedUrl;
      }),
      catchError((err) => {
        console.error('[ExpenseRecordsService] getInvoiceSignedUrl error:', err);
        throw err;
      })
    );
  }

  /** Deletes an invoice object from Storage. Used when replacing or removing a factura. */
  deleteInvoice(path: string): Observable<void> {
    return fromPromise(
      this.supabase.client.storage
        .from('expense-invoices')
        .remove([path])
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError((err) => {
        console.error('[ExpenseRecordsService] deleteInvoice error:', err);
        throw err;
      })
    );
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private insertItems(
    recordId: string,
    items: CreateExpenseItemPayload[]
  ): Observable<void> {
    const rows: ExpenseRecordItemInsert[] = items.map((item) => ({
      expense_record_id: recordId,
      name: item.name,
      description: item.description ?? null,
      quantity: item.quantity,
      unit_price_cop: item.unit_price_cop,
      subtotal_cop: item.subtotal_cop
    }));

    return fromPromise(
      this.supabase.client.from('expense_record_items').insert(rows)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  private applyItemsDiff(recordId: string, diff: ItemsDiffPayload): Observable<undefined> {
    const ops: Observable<unknown>[] = [];

    if (diff.items_to_delete.length > 0) {
      ops.push(
        fromPromise(
          this.supabase.client
            .from('expense_record_items')
            .delete()
            .in('id', diff.items_to_delete)
        ).pipe(map(({ error }) => { if (error) throw error; }))
      );
    }

    for (const item of diff.items_to_update) {
      const { id, ...rest } = item;
      const patch: ExpenseRecordItemUpdate = {};
      if (rest.name !== undefined) patch.name = rest.name;
      if (rest.description !== undefined) patch.description = rest.description;
      if (rest.quantity !== undefined) patch.quantity = rest.quantity;
      if (rest.unit_price_cop !== undefined) patch.unit_price_cop = rest.unit_price_cop;
      if (rest.subtotal_cop !== undefined) patch.subtotal_cop = rest.subtotal_cop;

      ops.push(
        fromPromise(
          this.supabase.client
            .from('expense_record_items')
            .update(patch)
            .eq('id', id)
        ).pipe(map(({ error }) => { if (error) throw error; }))
      );
    }

    if (diff.items_to_create.length > 0) {
      ops.push(this.insertItems(recordId, diff.items_to_create));
    }

    if (ops.length === 0) return of(undefined);

    // Run delete first, then updates and creates (order matters to avoid conflicts).
    return forkJoin(ops).pipe(map(() => undefined));
  }

  private lastDayOfMonth(year: number, month: number): string {
    const last = new Date(year, month, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  }

  private isFutureDateError(error: { code?: string; message?: string }): boolean {
    return (
      error.code === '23514' &&
      (error.message?.includes('expense_date') ?? false)
    );
  }

  private isAmountError(error: { code?: string; message?: string }): boolean {
    return (
      error.code === '23514' &&
      (error.message?.includes('amount_cop') ?? false)
    );
  }

  private extensionFromMime(mime: string): string {
    const map: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp'
    };
    return map[mime] ?? 'bin';
  }
}
