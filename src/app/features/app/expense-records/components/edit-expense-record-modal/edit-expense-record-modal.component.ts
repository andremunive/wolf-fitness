import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ServiceProvidersService } from 'src/app/features/app/service-providers/services/service-providers.service';
import { ExpenseCategoriesService } from '../../services/expense-categories.service';
import { ExpenseRecordsService } from '../../services/expense-records.service';
import {
  CreateExpenseItemPayload,
  ExpenseCategoryViewModel,
  ExpenseItemViewModel,
  ExpenseRecordViewModel,
  ItemsDiffPayload,
  PAYMENT_METHOD_LABELS,
  SimpleProviderOption,
  UpdateExpenseItemPayload,
  todayString
} from '../../models/expense-record.model';

const PAYMENT_METHODS = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
  value,
  label
}));

interface ItemFormEntry {
  /** Undefined means this item is newly added in the edit session and has no DB id yet. */
  originalId: string | undefined;
  group: FormGroup;
  unitPriceDisplay: string;
  /** Tracks if this item was loaded from DB (needed for diff calculation). */
  isExisting: boolean;
}

function buildItemGroup(item?: ExpenseItemViewModel): FormGroup {
  return new FormGroup({
    name: new FormControl(item?.name ?? '', [Validators.required, Validators.maxLength(200)]),
    description: new FormControl(item?.description ?? '', [Validators.maxLength(500)]),
    quantity: new FormControl<number | null>(item?.quantity ?? 1, [Validators.required, Validators.min(0.001)]),
    unit_price_cop: new FormControl<number | null>(item?.unitPriceCop ?? null, [Validators.required, Validators.min(1)])
  });
}

@Component({
  selector: 'app-edit-expense-record-modal',
  templateUrl: './edit-expense-record-modal.component.html',
  styleUrls: ['./edit-expense-record-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditExpenseRecordModalComponent implements OnInit, OnDestroy {
  @Input() record!: ExpenseRecordViewModel;

  @Output() closed = new EventEmitter<void>();
  @Output() recordUpdated = new EventEmitter<void>();
  @Output() recordAnnulled = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  readonly today = todayString();
  readonly paymentMethods = PAYMENT_METHODS;

  form!: FormGroup;
  expenseDateControl!: FormControl;
  amountCopControl!: FormControl;
  paymentMethodControl!: FormControl;
  notesControl!: FormControl;

  // Category
  activeCategories: ExpenseCategoryViewModel[] = [];
  selectedCategory: ExpenseCategoryViewModel | null = null;
  categoryInvalid = false;
  showNewCategoryModal = false;
  newCategoryPrefill = '';
  isLoadingCategories = false;

  // Provider (opcional)
  activeProviders: SimpleProviderOption[] = [];
  selectedProvider: SimpleProviderOption | null = null;
  isLoadingProviders = false;

  // Invoice
  existingInvoicePath: string | null = null;
  existingInvoiceMime: string | null = null;
  existingInvoiceSizeBytes: number | null = null;
  selectedFile: File | null = null;
  fileError: string | null = null;
  removeExistingInvoice = false;
  isLoadingSignedUrl = false;
  invoiceUrlError: string | null = null;

  // Items
  showItems = false;
  itemEntries: ItemFormEntry[] = [];
  /** IDs of items that were loaded from DB but then removed in the edit session. */
  private deletedItemIds: string[] = [];

  showAnnulConfirm = false;
  isSaving = false;
  isAnnulling = false;
  errorMessage: string | null = null;
  amountDisplay = '';

  constructor(
    private readonly categoriesService: ExpenseCategoriesService,
    private readonly recordsService: ExpenseRecordsService,
    private readonly providersService: ServiceProvidersService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.existingInvoicePath = this.record.invoiceStoragePath;
    this.existingInvoiceMime = this.record.invoiceMimeType;
    this.existingInvoiceSizeBytes = this.record.invoiceSizeBytes;

    this.expenseDateControl = new FormControl(this.record.expenseDate, [Validators.required]);
    this.amountCopControl = new FormControl(this.record.amountCop, [Validators.required, Validators.min(1)]);
    this.paymentMethodControl = new FormControl(this.record.paymentMethod, [Validators.required]);
    this.notesControl = new FormControl(this.record.notes ?? '', [Validators.maxLength(500)]);

    this.form = new FormGroup({
      expense_date: this.expenseDateControl,
      amount_cop: this.amountCopControl,
      payment_method: this.paymentMethodControl,
      notes: this.notesControl
    });

    this.amountDisplay = new Intl.NumberFormat('es-CO').format(this.record.amountCop);

    // Pre-load items from the record into the form entries
    if (this.record.items.length > 0) {
      this.showItems = true;
      this.itemEntries = this.record.items.map((item) => ({
        originalId: item.id,
        group: buildItemGroup(item),
        unitPriceDisplay: new Intl.NumberFormat('es-CO').format(item.unitPriceCop),
        isExisting: true
      }));
    }

    this.loadCategories();
    this.loadProviders();
  }

  // ─── Loaders ──────────────────────────────────────────────────────────────

  private loadCategories(): void {
    this.isLoadingCategories = true;
    this.cdr.markForCheck();

    this.categoriesService.listActive().pipe(takeUntil(this.destroy$)).subscribe({
      next: (categories) => {
        this.activeCategories = categories;
        const found = categories.find((c) => c.id === this.record.categoryId);
        if (found) {
          this.selectedCategory = found;
        } else {
          this.selectedCategory = {
            id: this.record.categoryId,
            name: this.record.categoryName,
            expenseType: this.record.categoryExpenseType,
            description: null,
            isActive: false,
            createdAt: ''
          };
        }
        this.isLoadingCategories = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingCategories = false;
        this.cdr.markForCheck();
      }
    });
  }

  private loadProviders(): void {
    this.isLoadingProviders = true;
    this.cdr.markForCheck();

    this.providersService.listActiveSimple().pipe(takeUntil(this.destroy$)).subscribe({
      next: (providers) => {
        this.activeProviders = providers;
        if (this.record.providerId === null) {
          this.selectedProvider = null;
        } else {
          const found = providers.find((p) => p.id === this.record.providerId);
          if (found) {
            this.selectedProvider = found;
          } else {
            // Provider may have been soft-deleted — show it as placeholder so save still works.
            this.selectedProvider = {
              id: this.record.providerId,
              name: this.record.providerName ?? '(proveedor eliminado)',
              serviceTypeName: this.record.serviceTypeName ?? ''
            };
          }
        }
        this.isLoadingProviders = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingProviders = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ─── Category handlers ─────────────────────────────────────────────────────

  onCategorySelected(category: ExpenseCategoryViewModel): void {
    this.selectedCategory = category;
    this.categoryInvalid = false;
    this.cdr.markForCheck();
  }

  onCreateNewCategoryRequested(query: string): void {
    this.newCategoryPrefill = query;
    this.showNewCategoryModal = true;
    this.cdr.markForCheck();
  }

  onNewCategoryCreated(category: ExpenseCategoryViewModel): void {
    this.activeCategories = [...this.activeCategories, category].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    this.selectedCategory = category;
    this.categoryInvalid = false;
    this.showNewCategoryModal = false;
    this.cdr.markForCheck();
  }

  onNewCategoryModalClosed(): void {
    this.showNewCategoryModal = false;
    this.cdr.markForCheck();
  }

  // ─── Provider handlers ─────────────────────────────────────────────────────

  onProviderSelected(provider: SimpleProviderOption | null): void {
    this.selectedProvider = provider;
    this.cdr.markForCheck();
  }

  // ─── Invoice handlers ──────────────────────────────────────────────────────

  openExistingInvoice(): void {
    if (!this.existingInvoicePath || this.isLoadingSignedUrl) return;

    this.isLoadingSignedUrl = true;
    this.invoiceUrlError = null;
    this.cdr.markForCheck();

    this.recordsService
      .getInvoiceSignedUrl(this.existingInvoicePath, 120)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (url) => {
          this.isLoadingSignedUrl = false;
          this.cdr.markForCheck();
          window.open(url, '_blank', 'noopener,noreferrer');
        },
        error: () => {
          this.isLoadingSignedUrl = false;
          this.invoiceUrlError = 'No se pudo generar el enlace. Intenta de nuevo.';
          this.cdr.markForCheck();
        }
      });
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.fileError = null;

    if (!file) {
      this.selectedFile = null;
      this.cdr.markForCheck();
      return;
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.fileError = 'Tipo de archivo no permitido. Solo PDF, JPG, PNG o WebP.';
      this.selectedFile = null;
      input.value = '';
      this.cdr.markForCheck();
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.fileError = 'El archivo supera los 10 MB permitidos.';
      this.selectedFile = null;
      input.value = '';
      this.cdr.markForCheck();
      return;
    }

    this.selectedFile = file;
    this.cdr.markForCheck();
  }

  removeNewFile(): void {
    this.selectedFile = null;
    this.fileError = null;
    this.cdr.markForCheck();
  }

  requestRemoveExistingInvoice(): void {
    this.removeExistingInvoice = true;
    this.cdr.markForCheck();
  }

  cancelRemoveExistingInvoice(): void {
    this.removeExistingInvoice = false;
    this.cdr.markForCheck();
  }

  get newFileSizeKb(): string {
    if (!this.selectedFile) return '';
    return (this.selectedFile.size / 1024).toFixed(0);
  }

  get existingFileSizeKb(): string {
    if (!this.existingInvoiceSizeBytes) return '';
    return (this.existingInvoiceSizeBytes / 1024).toFixed(0);
  }

  // ─── Items section ─────────────────────────────────────────────────────────

  onToggleItems(event: Event): void {
    this.showItems = (event.target as HTMLInputElement).checked;
    if (this.showItems && this.itemEntries.length === 0) {
      this.addItem();
    }
    this.cdr.markForCheck();
  }

  addItem(): void {
    this.itemEntries.push({
      originalId: undefined,
      group: buildItemGroup(),
      unitPriceDisplay: '',
      isExisting: false
    });
    this.cdr.markForCheck();
  }

  removeItem(index: number): void {
    const entry = this.itemEntries[index];
    // If this was an existing DB item, track its id for deletion.
    if (entry.isExisting && entry.originalId) {
      this.deletedItemIds.push(entry.originalId);
    }
    this.itemEntries.splice(index, 1);
    this.cdr.markForCheck();
  }

  getItemSubtotal(index: number): number {
    const group = this.itemEntries[index]?.group;
    if (!group) return 0;
    const qty = group.get('quantity')?.value as number | null;
    const price = group.get('unit_price_cop')?.value as number | null;
    if (!qty || !price || qty <= 0 || price <= 0) return 0;
    return Math.round(qty * price);
  }

  onUnitPriceInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '');
    const entry = this.itemEntries[index];

    if (!digits) {
      entry.unitPriceDisplay = '';
      input.value = '';
      entry.group.get('unit_price_cop')?.setValue(null);
      this.cdr.markForCheck();
      return;
    }

    const num = parseInt(digits, 10);
    const formatted = new Intl.NumberFormat('es-CO').format(num);
    entry.unitPriceDisplay = formatted;
    input.value = formatted;
    entry.group.get('unit_price_cop')?.setValue(num);
    this.cdr.markForCheck();
  }

  getItemFormControl(index: number, name: string): FormControl {
    return this.itemEntries[index].group.get(name) as FormControl;
  }

  trackByIndex(index: number): number {
    return index;
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  save(): void {
    this.form.markAllAsTouched();
    this.itemEntries.forEach((e) => e.group.markAllAsTouched());
    this.categoryInvalid = !this.selectedCategory;

    if (
      this.form.invalid ||
      !this.selectedCategory ||
      this.isSaving
    ) return;

    if (this.showItems && this.itemEntries.some((e) => e.group.invalid)) return;

    this.isSaving = true;
    this.errorMessage = null;
    this.cdr.markForCheck();

    const { expense_date, amount_cop, payment_method, notes } = this.form.value;

    const itemsDiff = this.buildItemsDiff();

    if (this.selectedFile) {
      // Replace invoice: delete old (if any) → upload new → save record with new metadata.
      this.handleInvoiceReplacement(expense_date!, amount_cop!, payment_method!, notes, itemsDiff);
    } else if (this.removeExistingInvoice && this.existingInvoicePath) {
      // Remove invoice: delete object then save record with null metadata.
      this.recordsService
        .deleteInvoice(this.existingInvoicePath)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => this.doUpdate(expense_date!, amount_cop!, payment_method!, notes, itemsDiff, {
            invoice_storage_path: null,
            invoice_mime_type: null,
            invoice_size_bytes: null
          }),
          error: () => this.doUpdate(expense_date!, amount_cop!, payment_method!, notes, itemsDiff, {
            invoice_storage_path: null,
            invoice_mime_type: null,
            invoice_size_bytes: null
          })
        });
    } else {
      this.doUpdate(expense_date!, amount_cop!, payment_method!, notes, itemsDiff, {});
    }
  }

  private handleInvoiceReplacement(
    date: string, amount: number, method: string, notes: string,
    itemsDiff: ItemsDiffPayload
  ): void {
    const deleteOld$ = this.existingInvoicePath
      ? this.recordsService.deleteInvoice(this.existingInvoicePath)
      : { subscribe: (o: { next: () => void }) => o.next() };

    (deleteOld$ as any).pipe ? (deleteOld$ as any).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.uploadNewInvoice(date, amount, method, notes, itemsDiff),
      error: () => this.uploadNewInvoice(date, amount, method, notes, itemsDiff)
    }) : (deleteOld$ as any).subscribe({
      next: () => this.uploadNewInvoice(date, amount, method, notes, itemsDiff),
      error: () => this.uploadNewInvoice(date, amount, method, notes, itemsDiff)
    });
  }

  private uploadNewInvoice(
    date: string, amount: number, method: string, notes: string,
    itemsDiff: ItemsDiffPayload
  ): void {
    this.recordsService
      .uploadInvoice(this.record.id, this.selectedFile!)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ path, mimeType, sizeBytes }) => {
          this.doUpdate(date, amount, method, notes, itemsDiff, {
            invoice_storage_path: path,
            invoice_mime_type: mimeType,
            invoice_size_bytes: sizeBytes
          });
        },
        error: () => {
          // Could not upload — save record fields without changing invoice.
          this.errorMessage = 'Los datos se guardaron pero la factura no pudo subirse.';
          this.doUpdate(date, amount, method, notes, itemsDiff, {});
        }
      });
  }

  private doUpdate(
    date: string,
    amount: number,
    method: string,
    notes: string,
    itemsDiff: ItemsDiffPayload,
    invoiceFields: {
      invoice_storage_path?: string | null;
      invoice_mime_type?: string | null;
      invoice_size_bytes?: number | null;
    }
  ): void {
    this.recordsService
      .update(this.record.id, {
        expense_date: date,
        amount_cop: amount,
        payment_method: method,
        category_id: this.selectedCategory!.id,
        provider_id: this.selectedProvider?.id ?? null,
        notes: notes || null,
        ...invoiceFields,
        itemsDiff
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.recordUpdated.emit();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSaving = false;
          this.errorMessage = err instanceof Error ? err.message : 'Error al guardar los cambios.';
          this.cdr.markForCheck();
        }
      });
  }

  private buildItemsDiff(): ItemsDiffPayload {
    const items_to_create: CreateExpenseItemPayload[] = [];
    const items_to_update: Array<{ id: string } & UpdateExpenseItemPayload> = [];
    const items_to_delete: string[] = [...this.deletedItemIds];

    // Find original DB items keyed by id for comparison
    const originalMap = new Map<string, ExpenseItemViewModel>(
      this.record.items.map((i) => [i.id, i])
    );

    for (const entry of this.itemEntries) {
      const qty = entry.group.get('quantity')?.value as number;
      const price = entry.group.get('unit_price_cop')?.value as number;
      const subtotal = Math.round(qty * price);

      if (!entry.isExisting || !entry.originalId) {
        // New item added in this edit session
        items_to_create.push({
          name: (entry.group.get('name')?.value as string).trim(),
          description: (entry.group.get('description')?.value as string)?.trim() || null,
          quantity: qty,
          unit_price_cop: price,
          subtotal_cop: subtotal
        });
      } else {
        // Existing item — check if changed
        const original = originalMap.get(entry.originalId);
        const name = (entry.group.get('name')?.value as string).trim();
        const description = (entry.group.get('description')?.value as string)?.trim() || null;

        const hasChanged =
          !original ||
          original.name !== name ||
          original.description !== description ||
          original.quantity !== qty ||
          original.unitPriceCop !== price;

        if (hasChanged) {
          items_to_update.push({
            id: entry.originalId,
            name,
            description,
            quantity: qty,
            unit_price_cop: price,
            subtotal_cop: subtotal
          });
        }
      }
    }

    return { items_to_create, items_to_update, items_to_delete };
  }

  // ─── Annul ─────────────────────────────────────────────────────────────────

  confirmAnnul(): void {
    this.showAnnulConfirm = true;
    this.cdr.markForCheck();
  }

  cancelAnnul(): void {
    this.showAnnulConfirm = false;
    this.cdr.markForCheck();
  }

  annul(): void {
    if (this.isAnnulling) return;

    this.isAnnulling = true;
    this.errorMessage = null;
    this.cdr.markForCheck();

    this.recordsService
      .annul(this.record.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isAnnulling = false;
          this.recordAnnulled.emit();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isAnnulling = false;
          this.errorMessage = err instanceof Error ? err.message : 'Error al anular el registro.';
          this.showAnnulConfirm = false;
          this.cdr.markForCheck();
        }
      });
  }

  close(): void {
    this.closed.emit();
  }

  onAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const oldValue = input.value;
    const oldCursor = input.selectionStart ?? oldValue.length;
    const digitsBeforeCursor = oldValue.slice(0, oldCursor).replace(/\D/g, '').length;

    const digits = oldValue.replace(/\D/g, '');

    if (!digits) {
      this.amountDisplay = '';
      input.value = '';
      this.amountCopControl.setValue(null);
      this.cdr.markForCheck();
      return;
    }

    const num = parseInt(digits, 10);
    const formatted = new Intl.NumberFormat('es-CO').format(num);
    this.amountDisplay = formatted;
    input.value = formatted;
    this.amountCopControl.setValue(num);

    let newCursor = 0;
    let counted = 0;
    while (counted < digitsBeforeCursor && newCursor < formatted.length) {
      if (/\d/.test(formatted[newCursor])) counted++;
      newCursor++;
    }
    input.setSelectionRange(newCursor, newCursor);
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
