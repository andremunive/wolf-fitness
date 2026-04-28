import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { AuthService } from 'src/app/core/services/auth.service';
import { ServiceProvidersService } from 'src/app/features/app/service-providers/services/service-providers.service';
import { ExpenseCategoriesService } from '../../services/expense-categories.service';
import { ExpenseRecordsService } from '../../services/expense-records.service';
import {
  CreateExpenseItemPayload,
  ExpenseCategoryViewModel,
  ExpenseRecordViewModel,
  PAYMENT_METHOD_LABELS,
  SimpleProviderOption,
  todayString
} from '../../models/expense-record.model';

const PAYMENT_METHODS = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
  value,
  label
}));

function buildItemGroup(): FormGroup {
  return new FormGroup({
    name: new FormControl('', [Validators.required, Validators.maxLength(200)]),
    description: new FormControl('', [Validators.maxLength(500)]),
    quantity: new FormControl<number | null>(1, [Validators.required, Validators.min(0.001)]),
    unit_price_cop: new FormControl<number | null>(null, [Validators.required, Validators.min(1)])
  });
}

@Component({
  selector: 'app-new-expense-record-modal',
  templateUrl: './new-expense-record-modal.component.html',
  styleUrls: ['./new-expense-record-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NewExpenseRecordModalComponent implements OnInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();
  @Output() recordCreated = new EventEmitter<ExpenseRecordViewModel>();

  private readonly destroy$ = new Subject<void>();
  private profileId: string | null = null;

  readonly today = todayString();
  readonly paymentMethods = PAYMENT_METHODS;

  readonly form = new FormGroup({
    expense_date: new FormControl(this.today, [Validators.required]),
    amount_cop: new FormControl<number | null>(null, [Validators.required, Validators.min(1)]),
    payment_method: new FormControl('', [Validators.required]),
    notes: new FormControl('', [Validators.maxLength(500)])
  });

  readonly itemsArray = new FormArray<FormGroup>([]);

  // Category
  activeCategories: ExpenseCategoryViewModel[] = [];
  selectedCategory: ExpenseCategoryViewModel | null = null;
  categoryInvalid = false;
  showNewCategoryModal = false;
  newCategoryPrefill = '';
  isLoadingCategories = false;

  // Provider
  activeProviders: SimpleProviderOption[] = [];
  selectedProvider: SimpleProviderOption | null = null;
  providerInvalid = false;
  isLoadingProviders = false;

  // Invoice
  selectedFile: File | null = null;
  fileError: string | null = null;

  // Items section
  showItems = false;
  unitPriceDisplays: string[] = [];

  isSaving = false;
  errorMessage: string | null = null;
  amountDisplay = '';

  constructor(
    private readonly auth: AuthService,
    private readonly categoriesService: ExpenseCategoriesService,
    private readonly recordsService: ExpenseRecordsService,
    private readonly providersService: ServiceProvidersService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.auth.profile$.pipe(takeUntil(this.destroy$)).subscribe((profile) => {
      this.profileId = profile?.id ?? null;
    });
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

  onProviderSelected(provider: SimpleProviderOption): void {
    this.selectedProvider = provider;
    this.providerInvalid = false;
    this.cdr.markForCheck();
  }

  // ─── Invoice handlers ──────────────────────────────────────────────────────

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

  removeFile(): void {
    this.selectedFile = null;
    this.fileError = null;
    this.cdr.markForCheck();
  }

  get fileSizeKb(): string {
    if (!this.selectedFile) return '';
    return (this.selectedFile.size / 1024).toFixed(0);
  }

  // ─── Items section ─────────────────────────────────────────────────────────

  onToggleItems(event: Event): void {
    this.showItems = (event.target as HTMLInputElement).checked;
    if (this.showItems && this.itemsArray.length === 0) {
      this.addItem();
    }
    this.cdr.markForCheck();
  }

  addItem(): void {
    this.itemsArray.push(buildItemGroup());
    this.unitPriceDisplays.push('');
    this.cdr.markForCheck();
  }

  removeItem(index: number): void {
    this.itemsArray.removeAt(index);
    this.unitPriceDisplays.splice(index, 1);
    this.cdr.markForCheck();
  }

  getItemSubtotal(index: number): number {
    const group = this.itemsArray.at(index);
    const qty = group.get('quantity')?.value as number | null;
    const price = group.get('unit_price_cop')?.value as number | null;
    if (!qty || !price || qty <= 0 || price <= 0) return 0;
    return Math.round(qty * price);
  }

  onUnitPriceInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '');
    const group = this.itemsArray.at(index);

    if (!digits) {
      this.unitPriceDisplays[index] = '';
      input.value = '';
      group.get('unit_price_cop')?.setValue(null);
      this.cdr.markForCheck();
      return;
    }

    const num = parseInt(digits, 10);
    const formatted = new Intl.NumberFormat('es-CO').format(num);
    this.unitPriceDisplays[index] = formatted;
    input.value = formatted;
    group.get('unit_price_cop')?.setValue(num);
    this.cdr.markForCheck();
  }

  getItemControl(index: number, name: string): FormControl {
    return this.itemsArray.at(index).get(name) as FormControl;
  }

  trackByIndex(index: number): number {
    return index;
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  save(): void {
    this.form.markAllAsTouched();
    this.itemsArray.controls.forEach((g) => g.markAllAsTouched());
    this.categoryInvalid = !this.selectedCategory;
    this.providerInvalid = !this.selectedProvider;

    if (
      this.form.invalid ||
      !this.selectedCategory ||
      !this.selectedProvider ||
      !this.profileId ||
      this.isSaving
    ) return;

    if (this.showItems && this.itemsArray.invalid) return;

    const { expense_date, amount_cop, payment_method, notes } = this.form.value;

    this.isSaving = true;
    this.errorMessage = null;
    this.cdr.markForCheck();

    const items: CreateExpenseItemPayload[] = this.showItems
      ? this.itemsArray.controls.map((g) => {
          const qty = g.get('quantity')?.value as number;
          const price = g.get('unit_price_cop')?.value as number;
          return {
            name: (g.get('name')?.value as string).trim(),
            description: (g.get('description')?.value as string)?.trim() || null,
            quantity: qty,
            unit_price_cop: price,
            subtotal_cop: Math.round(qty * price)
          };
        })
      : [];

    if (this.selectedFile) {
      // Two-step: create record first, then upload invoice, then update.
      this.recordsService
        .create({
          expense_date: expense_date!,
          amount_cop: amount_cop!,
          payment_method: payment_method!,
          category_id: this.selectedCategory.id,
          provider_id: this.selectedProvider.id,
          notes: notes || null,
          created_by: this.profileId,
          items
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (record) => {
            this.uploadInvoiceAfterCreate(record);
          },
          error: (err) => this.handleSaveError(err)
        });
    } else {
      this.recordsService
        .create({
          expense_date: expense_date!,
          amount_cop: amount_cop!,
          payment_method: payment_method!,
          category_id: this.selectedCategory.id,
          provider_id: this.selectedProvider.id,
          notes: notes || null,
          created_by: this.profileId,
          items
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (record) => {
            this.isSaving = false;
            this.recordCreated.emit(record);
            this.cdr.markForCheck();
          },
          error: (err) => this.handleSaveError(err)
        });
    }
  }

  private uploadInvoiceAfterCreate(record: ExpenseRecordViewModel): void {
    this.recordsService
      .uploadInvoice(record.id, this.selectedFile!)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ path, mimeType, sizeBytes }) => {
          this.recordsService
            .update(record.id, {
              invoice_storage_path: path,
              invoice_mime_type: mimeType,
              invoice_size_bytes: sizeBytes
            })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.isSaving = false;
                this.recordCreated.emit(record);
                this.cdr.markForCheck();
              },
              error: () => {
                // Record created but invoice metadata failed — non-critical.
                this.isSaving = false;
                this.errorMessage =
                  'Registro creado pero la factura no pudo subirse. Intenta editarlo para volver a subirla.';
                this.recordCreated.emit(record);
                this.cdr.markForCheck();
              }
            });
        },
        error: () => {
          this.isSaving = false;
          this.errorMessage =
            'Registro creado pero la factura no pudo subirse. Intenta editarlo para volver a subirla.';
          this.recordCreated.emit(record);
          this.cdr.markForCheck();
        }
      });
  }

  private handleSaveError(err: unknown): void {
    this.isSaving = false;
    this.errorMessage = err instanceof Error ? err.message : 'Error al registrar el egreso.';
    this.cdr.markForCheck();
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
    const amountCtrl = this.form.controls.amount_cop;

    if (!digits) {
      this.amountDisplay = '';
      input.value = '';
      amountCtrl.setValue(null);
      this.cdr.markForCheck();
      return;
    }

    const num = parseInt(digits, 10);
    const formatted = new Intl.NumberFormat('es-CO').format(num);
    this.amountDisplay = formatted;
    input.value = formatted;
    amountCtrl.setValue(num);

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
