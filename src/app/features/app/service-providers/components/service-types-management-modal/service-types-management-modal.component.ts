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

import { ServiceTypesService } from '../../services/service-types.service';
import { ServiceTypeViewModel } from '../../models/service-provider.model';

@Component({
  selector: 'app-service-types-management-modal',
  templateUrl: './service-types-management-modal.component.html',
  styleUrls: ['./service-types-management-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceTypesManagementModalComponent implements OnInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  serviceTypes: ServiceTypeViewModel[] = [];
  isLoading = false;
  isAdding = false;
  isSaving = false;
  actionError: string | null = null;

  readonly newNameControl = new FormControl('', [Validators.required, Validators.minLength(2)]);
  readonly newDescriptionControl = new FormControl('');

  editingTypeId: string | null = null;
  editNameControl = new FormControl('', [Validators.required, Validators.minLength(2)]);
  editDescriptionControl = new FormControl('');

  constructor(
    private readonly serviceTypesService: ServiceTypesService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  private loadAll(): void {
    this.isLoading = true;
    this.cdr.markForCheck();

    this.serviceTypesService
      .listAll()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (types) => {
          this.serviceTypes = types;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoading = false;
          this.actionError = 'Error al cargar los tipos de servicio.';
          this.cdr.markForCheck();
        }
      });
  }

  startAdd(): void {
    this.isAdding = true;
    this.editingTypeId = null;
    this.newNameControl.reset('');
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

    this.serviceTypesService
      .create({
        name: this.newNameControl.value!,
        description: this.newDescriptionControl.value?.trim() || null
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (created) => {
          this.serviceTypes = [...this.serviceTypes, created];
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

  startEdit(type: ServiceTypeViewModel): void {
    this.editingTypeId = type.id;
    this.isAdding = false;
    this.editNameControl.setValue(type.name);
    this.editDescriptionControl.setValue(type.description ?? '');
    this.actionError = null;
    this.cdr.markForCheck();
  }

  cancelEdit(): void {
    this.editingTypeId = null;
    this.cdr.markForCheck();
  }

  saveEdit(type: ServiceTypeViewModel): void {
    if (this.editNameControl.invalid || this.isSaving) return;

    this.isSaving = true;
    this.actionError = null;
    this.cdr.markForCheck();

    this.serviceTypesService
      .update(type.id, {
        name: this.editNameControl.value!,
        description: this.editDescriptionControl.value?.trim() || null
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.serviceTypes = this.serviceTypes.map((t) => (t.id === updated.id ? updated : t));
          this.editingTypeId = null;
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

  toggleActive(type: ServiceTypeViewModel): void {
    if (this.isSaving) return;

    const action = type.isActive
      ? this.serviceTypesService.deactivate(type.id)
      : this.serviceTypesService.activate(type.id);

    this.isSaving = true;
    this.actionError = null;
    this.cdr.markForCheck();

    action.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.serviceTypes = this.serviceTypes.map((t) =>
          t.id === type.id ? { ...t, isActive: !t.isActive } : t
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

  trackByTypeId(_index: number, type: ServiceTypeViewModel): string {
    return type.id;
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
