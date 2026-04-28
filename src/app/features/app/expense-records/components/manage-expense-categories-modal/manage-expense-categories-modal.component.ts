import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ExpenseCategoriesService } from '../../services/expense-categories.service';
import { ExpenseCategoryViewModel } from '../../models/expense-record.model';

@Component({
  selector: 'app-manage-expense-categories-modal',
  templateUrl: './manage-expense-categories-modal.component.html',
  styleUrls: ['./manage-expense-categories-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManageExpenseCategoriesModalComponent implements OnInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  categories: ExpenseCategoryViewModel[] = [];
  isLoading = false;
  isAdding = false;
  isSaving = false;
  actionError: string | null = null;

  readonly newNameControl = new FormControl('', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]);
  readonly newEmojiControl = new FormControl('', [Validators.maxLength(8)]);
  readonly newDescriptionControl = new FormControl('');

  editingCategoryId: string | null = null;
  editNameControl = new FormControl('', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]);
  editEmojiControl = new FormControl('', [Validators.maxLength(8)]);
  editDescriptionControl = new FormControl('');

  constructor(
    private readonly categoriesService: ExpenseCategoriesService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  private loadAll(): void {
    this.isLoading = true;
    this.cdr.markForCheck();

    this.categoriesService
      .listAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (categories) => {
          this.categories = categories;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoading = false;
          this.actionError = 'Error al cargar las categorías.';
          this.cdr.markForCheck();
        }
      });
  }

  startAdd(): void {
    this.isAdding = true;
    this.editingCategoryId = null;
    this.newNameControl.reset('');
    this.newEmojiControl.reset('');
    this.newDescriptionControl.reset('');
    this.actionError = null;
    this.cdr.markForCheck();
  }

  cancelAdd(): void {
    this.isAdding = false;
    this.cdr.markForCheck();
  }

  saveAdd(): void {
    if (this.newNameControl.invalid || this.isSaving) return;

    this.isSaving = true;
    this.actionError = null;
    this.cdr.markForCheck();

    this.categoriesService
      .create({
        name: this.newNameControl.value!,
        emoji: this.newEmojiControl.value || null,
        description: this.newDescriptionControl.value?.trim() || null
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (created) => {
          this.categories = [...this.categories, created].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          this.isAdding = false;
          this.isSaving = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSaving = false;
          this.actionError = this.extractErrorMessage(err);
          this.cdr.markForCheck();
        }
      });
  }

  startEdit(category: ExpenseCategoryViewModel): void {
    this.editingCategoryId = category.id;
    this.isAdding = false;
    this.editNameControl.setValue(category.name);
    this.editEmojiControl.setValue(category.emoji ?? '');
    this.editDescriptionControl.setValue(category.description ?? '');
    this.actionError = null;
    this.cdr.markForCheck();
  }

  cancelEdit(): void {
    this.editingCategoryId = null;
    this.cdr.markForCheck();
  }

  saveEdit(category: ExpenseCategoryViewModel): void {
    if (this.editNameControl.invalid || this.isSaving) return;

    this.isSaving = true;
    this.actionError = null;
    this.cdr.markForCheck();

    this.categoriesService
      .update(category.id, {
        name: this.editNameControl.value!,
        emoji: this.editEmojiControl.value || null,
        description: this.editDescriptionControl.value?.trim() || null
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.categories = this.categories
            .map((c) => (c.id === updated.id ? updated : c))
            .sort((a, b) => a.name.localeCompare(b.name));
          this.editingCategoryId = null;
          this.isSaving = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSaving = false;
          this.actionError = this.extractErrorMessage(err);
          this.cdr.markForCheck();
        }
      });
  }

  toggleActive(category: ExpenseCategoryViewModel): void {
    if (this.isSaving) return;

    const action = category.isActive
      ? this.categoriesService.deactivate(category.id)
      : this.categoriesService.activate(category.id);

    this.isSaving = true;
    this.actionError = null;
    this.cdr.markForCheck();

    action.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.categories = this.categories.map((c) =>
          c.id === category.id ? { ...c, isActive: !c.isActive } : c
        );
        this.isSaving = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isSaving = false;
        this.actionError = this.extractErrorMessage(err);
        this.cdr.markForCheck();
      }
    });
  }

  close(): void {
    this.closed.emit();
  }

  trackByCategoryId(_index: number, category: ExpenseCategoryViewModel): string {
    return category.id;
  }

  private extractErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object') {
      const anyErr = err as Record<string, unknown>;
      if (typeof anyErr['message'] === 'string') return anyErr['message'];
    }
    return 'Ocurrió un error. Intenta de nuevo.';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
