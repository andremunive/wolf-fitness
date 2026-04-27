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
import { ServiceTypesService } from '../../services/service-types.service';
import {
  DocumentType,
  ProviderEntityType,
  ServiceProviderViewModel,
  ServiceTypeViewModel
} from '../../models/service-provider.model';

function emailOrEmptyValidator(control: import('@angular/forms').AbstractControl): import('@angular/forms').ValidationErrors | null {
  const v = (control.value ?? '').trim();
  if (!v) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : { invalidEmail: true };
}

@Component({
  selector: 'app-edit-service-provider-modal',
  templateUrl: './edit-service-provider-modal.component.html',
  styleUrls: ['./edit-service-provider-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditServiceProviderModalComponent implements OnChanges, OnDestroy {
  @Input() provider!: ServiceProviderViewModel;
  @Input() serviceTypes: ServiceTypeViewModel[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() providerUpdated = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  currentTab: 'identity' | 'contact' = 'identity';
  isSaving = false;
  saveError: string | null = null;
  saveSuccess = false;

  readonly documentTypeOptions: Array<{ value: DocumentType; label: string }> = [
    { value: 'cc', label: 'Cédula de ciudadanía (CC)' },
    { value: 'ce', label: 'Cédula de extranjería (CE)' },
    { value: 'ti', label: 'Tarjeta de identidad (TI)' },
    { value: 'pa', label: 'Pasaporte (PA)' },
    { value: 'nit', label: 'NIT' }
  ];

  readonly entityTypeOptions: Array<{ value: ProviderEntityType; label: string }> = [
    { value: 'persona', label: 'Persona natural' },
    { value: 'empresa', label: 'Empresa' }
  ];

  readonly tabs: Array<{ id: 'identity' | 'contact'; label: string }> = [
    { id: 'identity', label: 'Identidad' },
    { id: 'contact', label: 'Contacto' }
  ];

  readonly identityForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    entity_type: ['', [Validators.required]],
    document_type: ['', [Validators.required]],
    document_number: ['', [Validators.required, Validators.minLength(4)]],
    service_type_id: ['', [Validators.required]]
  });

  readonly contactForm: FormGroup = this.fb.group({
    phone: ['', [Validators.pattern(/^\d{7,15}$/)]],
    email: ['', [emailOrEmptyValidator]],
    description: ['']
  });

  private originalValues!: ReturnType<typeof this.captureValues>;

  constructor(
    private readonly fb: FormBuilder,
    private readonly serviceProvidersService: ServiceProvidersService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['provider'] && this.provider) {
      this.patchForms();
    }
  }

  get avatarInitials(): string {
    return this.provider.name
      .split(' ')
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  get activeForm(): FormGroup {
    return this.currentTab === 'identity' ? this.identityForm : this.contactForm;
  }

  get hasChanges(): boolean {
    return JSON.stringify(this.captureValues()) !== JSON.stringify(this.originalValues);
  }

  switchTab(tab: typeof this.currentTab): void {
    this.currentTab = tab;
    this.saveError = null;
    this.cdr.markForCheck();
  }

  save(): void {
    if (!this.hasChanges || this.isSaving) return;

    this.isSaving = true;
    this.saveError = null;
    this.saveSuccess = false;
    this.cdr.markForCheck();

    const current = this.captureValues();
    const original = this.originalValues;

    const patch: Record<string, unknown> = {};
    if (current.identity.name !== original.identity.name) patch['name'] = current.identity.name;
    if (current.identity.entity_type !== original.identity.entity_type) patch['entity_type'] = current.identity.entity_type;
    if (current.identity.document_type !== original.identity.document_type) patch['document_type'] = current.identity.document_type;
    if (current.identity.document_number !== original.identity.document_number) patch['document_number'] = current.identity.document_number;
    if (current.identity.service_type_id !== original.identity.service_type_id) patch['service_type_id'] = current.identity.service_type_id;
    if (current.contact.phone !== original.contact.phone) patch['phone'] = current.contact.phone?.trim() || null;
    if (current.contact.email !== original.contact.email) patch['email'] = current.contact.email?.trim() || null;
    if (current.contact.description !== original.contact.description) patch['description'] = current.contact.description?.trim() || null;

    this.serviceProvidersService
      .update(this.provider.id, patch)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.saveSuccess = true;
          this.originalValues = this.captureValues();
          this.providerUpdated.emit();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSaving = false;
          this.saveError = this.extractErrorMessage(err);
          this.cdr.markForCheck();
        }
      });
  }

  closeWithConfirmation(): void {
    if (this.hasChanges) {
      const confirmed = window.confirm('¿Descartar los cambios sin guardar?');
      if (!confirmed) return;
    }
    this.closed.emit();
  }

  close(): void {
    this.closeWithConfirmation();
  }

  trackByTabId(_index: number, tab: { id: string; label: string }): string { return tab.id; }
  trackByValue(_index: number, item: { value: string; label: string }): string { return item.value; }
  trackByTypeId(_index: number, t: ServiceTypeViewModel): string { return t.id; }

  private patchForms(): void {
    const p = this.provider;
    this.identityForm.patchValue({
      name: p.name,
      entity_type: p.entityType,
      document_type: p.documentType,
      document_number: p.documentNumber,
      service_type_id: p.serviceTypeId
    }, { emitEvent: false });

    this.contactForm.patchValue({
      phone: p.phone ?? '',
      email: p.email ?? '',
      description: p.description ?? ''
    }, { emitEvent: false });

    this.originalValues = this.captureValues();
    this.cdr.markForCheck();
  }

  private captureValues() {
    return {
      identity: this.identityForm.value,
      contact: this.contactForm.value
    };
  }

  private extractErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object') {
      const anyErr = err as Record<string, unknown>;
      if (typeof anyErr['message'] === 'string') return anyErr['message'];
    }
    return 'Ocurrió un error al guardar. Intenta de nuevo.';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
