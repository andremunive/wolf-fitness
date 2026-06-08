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

import { ExpenseCategoriesService } from '../../services/expense-categories.service';
import { ExpenseCategoryViewModel, ExpenseTypeValue } from '../../models/expense-record.model';

@Component({
  selector: 'app-new-expense-category-modal',
  templateUrl: './new-expense-category-modal.component.html',
  styleUrls: ['./new-expense-category-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NewExpenseCategoryModalComponent implements OnInit, OnDestroy {
  /** Pre-fills the name field when the admin chose "Create new: <query>" from the autocomplete. */
  @Input() prefillName = '';

  /** Pre-fills the expense type when the parent form already has a value selected. */
  @Input() prefillExpenseType: ExpenseTypeValue | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<ExpenseCategoryViewModel>();

  private readonly destroy$ = new Subject<void>();

  readonly form = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]),
    expense_type: new FormControl<ExpenseTypeValue | ''>('', [Validators.required]),
    description: new FormControl('')
  });

  isSaving = false;
  errorMessage: string | null = null;

  constructor(
    private readonly categoriesService: ExpenseCategoriesService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const patch: { name?: string; expense_type?: ExpenseTypeValue } = {};
    if (this.prefillName) patch.name = this.prefillName;
    if (this.prefillExpenseType) patch.expense_type = this.prefillExpenseType;
    if (Object.keys(patch).length) this.form.patchValue(patch);
  }

  save(): void {
    if (this.form.invalid || this.isSaving) return;

    const { name, expense_type, description } = this.form.value;

    this.isSaving = true;
    this.errorMessage = null;
    this.cdr.markForCheck();

    this.categoriesService
      .create({
        name: name!,
        expense_type: expense_type as ExpenseTypeValue,
        description: description || null
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (category) => {
          this.isSaving = false;
          this.created.emit(category);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSaving = false;
          this.errorMessage = err instanceof Error ? err.message : 'Error al crear la categoría.';
          this.cdr.markForCheck();
        }
      });
  }

  close(): void {
    this.closed.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
