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
import { ExpenseCategoryViewModel } from '../../models/expense-record.model';

@Component({
  selector: 'app-new-expense-category-modal',
  templateUrl: './new-expense-category-modal.component.html',
  styleUrls: ['./new-expense-category-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NewExpenseCategoryModalComponent implements OnInit, OnDestroy {
  /** Pre-fills the name field when the admin chose "Create new: <query>" from the autocomplete. */
  @Input() prefillName = '';

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<ExpenseCategoryViewModel>();

  private readonly destroy$ = new Subject<void>();

  readonly form = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]),
    emoji: new FormControl('', [Validators.maxLength(8)]),
    description: new FormControl('')
  });

  isSaving = false;
  errorMessage: string | null = null;

  constructor(
    private readonly categoriesService: ExpenseCategoriesService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (this.prefillName) {
      this.form.patchValue({ name: this.prefillName });
    }
  }

  save(): void {
    if (this.form.invalid || this.isSaving) return;

    const { name, emoji, description } = this.form.value;

    this.isSaving = true;
    this.errorMessage = null;
    this.cdr.markForCheck();

    this.categoriesService
      .create({
        name: name!,
        emoji: emoji || null,
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
