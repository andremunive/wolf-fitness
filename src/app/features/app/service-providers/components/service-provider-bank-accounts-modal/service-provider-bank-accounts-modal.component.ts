import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ServiceProvidersService } from '../../services/service-providers.service';
import {
  Bank,
  BankAccountType,
  BankAccountViewModel,
  ServiceProviderViewModel
} from '../../models/service-provider.model';
import { BANK_LABELS } from '../shared/display-labels';

@Component({
  selector: 'app-service-provider-bank-accounts-modal',
  templateUrl: './service-provider-bank-accounts-modal.component.html',
  styleUrls: ['./service-provider-bank-accounts-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceProviderBankAccountsModalComponent implements OnChanges, OnDestroy {
  @Input() provider!: ServiceProviderViewModel;
  @Output() closed = new EventEmitter<void>();
  @Output() accountsUpdated = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  accounts: BankAccountViewModel[] = [];
  editingAccountId: string | null = null;
  isAdding = false;
  isSaving = false;
  actionError: string | null = null;

  readonly bankOptions: Array<{ value: Bank; label: string }> = Object.entries(BANK_LABELS).map(
    ([value, label]) => ({ value: value as Bank, label })
  );

  readonly accountTypeOptions: Array<{ value: BankAccountType; label: string }> = [
    { value: 'ahorros', label: 'Ahorros' },
    { value: 'corriente', label: 'Corriente' }
  ];

  readonly addForm: FormGroup = this.fb.group({
    bank: ['', [Validators.required]],
    account_type: ['ahorros', [Validators.required]],
    account_number: ['', [Validators.required]],
    account_holder_name: ['']
  });

  readonly editForm: FormGroup = this.fb.group({
    bank: ['', [Validators.required]],
    account_type: ['ahorros', [Validators.required]],
    account_number: ['', [Validators.required]],
    account_holder_name: ['']
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly serviceProvidersService: ServiceProvidersService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['provider'] && this.provider) {
      this.accounts = [...this.provider.bankAccounts];
      this.cdr.markForCheck();
    }
  }

  getBankLabel(bank: Bank): string {
    return BANK_LABELS[bank] ?? bank;
  }

  getAccountTypeLabel(type: BankAccountType): string {
    return type === 'ahorros' ? 'Ahorros' : 'Corriente';
  }

  startAdd(): void {
    this.isAdding = true;
    this.editingAccountId = null;
    this.addForm.reset({ bank: '', account_type: 'ahorros', account_number: '', account_holder_name: '' });
    this.actionError = null;
    this.cdr.markForCheck();
  }

  cancelAdd(): void {
    this.isAdding = false;
    this.cdr.markForCheck();
  }

  saveAdd(): void {
    if (this.addForm.invalid || this.isSaving) return;

    this.isSaving = true;
    this.actionError = null;
    this.cdr.markForCheck();

    const isFirstAccount = this.accounts.length === 0;

    this.serviceProvidersService
      .addBankAccount(this.provider.id, {
        bank: this.addForm.value.bank,
        account_type: this.addForm.value.account_type,
        account_number: this.addForm.value.account_number,
        account_holder_name: this.addForm.value.account_holder_name?.trim() || null,
        is_primary: isFirstAccount
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (newAccount) => {
          this.accounts = [...this.accounts, newAccount];
          this.isAdding = false;
          this.isSaving = false;
          this.accountsUpdated.emit();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSaving = false;
          this.actionError = this.extractErrorMessage(err);
          this.cdr.markForCheck();
        }
      });
  }

  startEdit(account: BankAccountViewModel): void {
    this.editingAccountId = account.id;
    this.isAdding = false;
    this.editForm.patchValue({
      bank: account.bank,
      account_type: account.accountType,
      account_number: account.accountNumber,
      account_holder_name: account.accountHolderName ?? ''
    });
    this.actionError = null;
    this.cdr.markForCheck();
  }

  cancelEdit(): void {
    this.editingAccountId = null;
    this.cdr.markForCheck();
  }

  saveEdit(): void {
    if (!this.editingAccountId || this.editForm.invalid || this.isSaving) return;

    this.isSaving = true;
    this.actionError = null;
    this.cdr.markForCheck();

    this.serviceProvidersService
      .updateBankAccount(this.editingAccountId, {
        bank: this.editForm.value.bank,
        account_type: this.editForm.value.account_type,
        account_number: this.editForm.value.account_number,
        account_holder_name: this.editForm.value.account_holder_name?.trim() || null
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.accounts = this.accounts.map((a) => (a.id === updated.id ? updated : a));
          this.editingAccountId = null;
          this.isSaving = false;
          this.accountsUpdated.emit();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSaving = false;
          this.actionError = this.extractErrorMessage(err);
          this.cdr.markForCheck();
        }
      });
  }

  deleteAccount(account: BankAccountViewModel): void {
    const confirmed = window.confirm(
      `¿Eliminar la cuenta ${this.getBankLabel(account.bank)} terminada en ${account.accountNumber.slice(-4)}?`
    );
    if (!confirmed) return;

    this.isSaving = true;
    this.actionError = null;
    this.cdr.markForCheck();

    this.serviceProvidersService
      .deleteBankAccount(account.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.accounts = this.accounts.filter((a) => a.id !== account.id);
          this.isSaving = false;
          this.accountsUpdated.emit();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSaving = false;
          this.actionError = this.extractErrorMessage(err);
          this.cdr.markForCheck();
        }
      });
  }

  setPrimary(account: BankAccountViewModel): void {
    if (account.isPrimary || this.isSaving) return;

    this.isSaving = true;
    this.actionError = null;
    this.cdr.markForCheck();

    this.serviceProvidersService
      .setPrimaryBankAccount(this.provider.id, account.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.accounts = this.accounts.map((a) => ({ ...a, isPrimary: a.id === account.id }));
          this.isSaving = false;
          this.accountsUpdated.emit();
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

  trackByAccountId(_index: number, account: BankAccountViewModel): string {
    return account.id;
  }

  trackByValue(_index: number, item: { value: string; label: string }): string {
    return item.value;
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
