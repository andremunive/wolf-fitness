import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  switchMap,
  takeUntil
} from 'rxjs/operators';

import { ClientsService } from '../../services/clients.service';

export interface ClientSearchResult {
  id: string;
  fullName: string;
}

/**
 * Componente de búsqueda incremental de clientes activos.
 * Usado en el wizard (step de origen=referido) y en el modal de edición.
 * Es un componente presentacional que delega la búsqueda al ClientsService.
 * Emite `selected` con el id y nombre del cliente elegido.
 */
@Component({
  selector: 'app-client-search-input',
  templateUrl: './client-search-input.component.html',
  styleUrls: ['./client-search-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientSearchInputComponent implements OnInit, OnDestroy {
  @Input() placeholder = 'Buscar cliente por nombre...';
  /** UUID del cliente que se está editando (para excluirlo de resultados). */
  @Input() excludeId?: string;
  /** Valor inicial (nombre del cliente ya seleccionado en edición). */
  @Input() initialLabel = '';

  @Output() selected = new EventEmitter<ClientSearchResult | null>();

  @ViewChild('inputRef') inputRef?: ElementRef<HTMLInputElement>;

  readonly searchControl = new FormControl<string>('');

  results: ClientSearchResult[] = [];
  isLoading = false;
  hasError = false;
  isOpen = false;

  /** El item actualmente seleccionado (para mostrarlo como valor del input). */
  selectedItem: ClientSearchResult | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly clientsService: ClientsService,
    private readonly host: ElementRef<HTMLElement>,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (this.initialLabel) {
      this.searchControl.setValue(this.initialLabel, { emitEvent: false });
    }

    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        filter((value): value is string => typeof value === 'string'),
        takeUntil(this.destroy$)
      )
      .subscribe((value) => {
        // Si el usuario editó el texto después de haber seleccionado, limpiamos la selección.
        if (this.selectedItem && value !== this.selectedItem.fullName) {
          this.selectedItem = null;
          this.selected.emit(null);
        }

        if (value.trim().length < 2) {
          this.results = [];
          this.isOpen = false;
          this.cdr.markForCheck();
          return;
        }

        this.search(value.trim());
      });
  }

  private search(term: string): void {
    this.isLoading = true;
    this.hasError = false;
    this.isOpen = true;
    this.cdr.markForCheck();

    this.clientsService
      .searchActiveClients(term, this.excludeId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          this.results = results;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.hasError = true;
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  select(item: ClientSearchResult): void {
    this.selectedItem = item;
    this.searchControl.setValue(item.fullName, { emitEvent: false });
    this.isOpen = false;
    this.results = [];
    this.selected.emit(item);
    this.cdr.markForCheck();
  }

  clear(): void {
    this.selectedItem = null;
    this.searchControl.setValue('', { emitEvent: false });
    this.results = [];
    this.isOpen = false;
    this.selected.emit(null);
    this.cdr.markForCheck();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) return;
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.isOpen = false;
      this.cdr.markForCheck();
    }
  }

  trackById(_index: number, item: ClientSearchResult): string {
    return item.id;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
