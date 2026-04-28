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

import { SimpleProviderOption } from '../../models/expense-record.model';

@Component({
  selector: 'app-expense-provider-autocomplete',
  templateUrl: './expense-provider-autocomplete.component.html',
  styleUrls: ['./expense-provider-autocomplete.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseProviderAutocompleteComponent implements OnInit, OnChanges, OnDestroy {
  @Input() providers: SimpleProviderOption[] = [];
  @Input() selectedProvider: SimpleProviderOption | null = null;
  @Input() isInvalid = false;

  @Output() providerSelected = new EventEmitter<SimpleProviderOption>();

  private readonly destroy$ = new Subject<void>();

  readonly searchControl = new FormControl('');
  filteredProviders: SimpleProviderOption[] = [];
  isOpen = false;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.searchControl.valueChanges.pipe(
      debounceTime(150),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe((query) => {
      this.updateFiltered(query ?? '');
      this.isOpen = true;
      this.cdr.markForCheck();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedProvider'] && this.selectedProvider) {
      this.searchControl.setValue(this.selectedProvider.name, { emitEvent: false });
    }
    if (changes['providers']) {
      this.updateFiltered(this.searchControl.value ?? '');
    }
  }

  onFocus(): void {
    this.updateFiltered(this.searchControl.value ?? '');
    this.isOpen = true;
    this.cdr.markForCheck();
  }

  onBlur(): void {
    setTimeout(() => {
      this.isOpen = false;
      if (this.selectedProvider) {
        this.searchControl.setValue(this.selectedProvider.name, { emitEvent: false });
      } else {
        this.searchControl.setValue('', { emitEvent: false });
      }
      this.cdr.markForCheck();
    }, 200);
  }

  select(provider: SimpleProviderOption): void {
    this.providerSelected.emit(provider);
    this.searchControl.setValue(provider.name, { emitEvent: false });
    this.isOpen = false;
    this.cdr.markForCheck();
  }

  trackById(_index: number, provider: SimpleProviderOption): string {
    return provider.id;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateFiltered(query: string): void {
    const q = query.trim().toLowerCase();
    this.filteredProviders = q
      ? this.providers.filter((p) => p.name.toLowerCase().includes(q))
      : this.providers;
  }
}
