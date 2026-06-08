import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { ExpenseCategoryViewModel } from '../../models/expense-record.model';

export interface AutocompleteOption {
  category: ExpenseCategoryViewModel | null;
  /** If null, this is the "create new" option. */
  isCreateNew: boolean;
  label: string;
}

@Component({
  selector: 'app-expense-category-autocomplete',
  templateUrl: './expense-category-autocomplete.component.html',
  styleUrls: ['./expense-category-autocomplete.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseCategoryAutocompleteComponent implements OnInit, OnChanges, OnDestroy {
  @Input() categories: ExpenseCategoryViewModel[] = [];
  @Input() selectedCategory: ExpenseCategoryViewModel | null = null;
  @Input() isInvalid = false;

  @Output() categorySelected = new EventEmitter<ExpenseCategoryViewModel>();
  @Output() createNewRequested = new EventEmitter<string>();

  private readonly destroy$ = new Subject<void>();

  readonly searchControl = new FormControl('');
  filteredOptions: AutocompleteOption[] = [];
  isOpen = false;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.searchControl.valueChanges.pipe(
      debounceTime(150),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe((query) => {
      this.updateFilteredOptions(query ?? '');
      this.isOpen = true;
      this.cdr.markForCheck();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedCategory'] && this.selectedCategory) {
      this.searchControl.setValue(this.selectedCategory.name, { emitEvent: false });
    }
    if (changes['categories']) {
      this.updateFilteredOptions(this.searchControl.value ?? '');
    }
  }

  onFocus(): void {
    this.updateFilteredOptions(this.searchControl.value ?? '');
    this.isOpen = true;
    this.cdr.markForCheck();
  }

  onBlur(): void {
    // Delay close to allow click on options to fire first.
    setTimeout(() => {
      this.isOpen = false;
      // If nothing valid is selected, revert the input to the selected value.
      if (this.selectedCategory) {
        this.searchControl.setValue(this.selectedCategory.name, { emitEvent: false });
      } else {
        this.searchControl.setValue('', { emitEvent: false });
      }
      this.cdr.markForCheck();
    }, 200);
  }

  selectOption(option: AutocompleteOption): void {
    if (option.isCreateNew) {
      this.createNewRequested.emit(this.searchControl.value ?? '');
      this.isOpen = false;
      this.cdr.markForCheck();
      return;
    }
    if (option.category) {
      this.categorySelected.emit(option.category);
      this.searchControl.setValue(option.category.name, { emitEvent: false });
      this.isOpen = false;
      this.cdr.markForCheck();
    }
  }

  trackByOptionLabel(_index: number, option: AutocompleteOption): string {
    return option.label;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateFilteredOptions(query: string): void {
    const q = query.trim().toLowerCase();

    const matched = this.categories.filter((c) =>
      c.name.toLowerCase().includes(q)
    );

    const options: AutocompleteOption[] = matched.map((c) => ({
      category: c,
      isCreateNew: false,
      label: c.name
    }));

    // Show "create new" option when query doesn't exactly match any existing name.
    const exactMatch = this.categories.some(
      (c) => c.name.toLowerCase() === q
    );

    if (q.length >= 2 && !exactMatch) {
      options.push({
        category: null,
        isCreateNew: true,
        label: `+ Crear nueva categoría: «${query.trim()}»`
      });
    }

    this.filteredOptions = options;
  }
}
