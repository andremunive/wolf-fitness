import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-trainers-search-bar',
  templateUrl: './trainers-search-bar.component.html',
  styleUrls: ['./trainers-search-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TrainersSearchBarComponent implements OnInit, OnDestroy {
  @Input() initialValue = '';
  @Output() searchChange = new EventEmitter<string>();

  readonly searchControl = new FormControl('');

  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    if (this.initialValue) {
      this.searchControl.setValue(this.initialValue, { emitEvent: false });
    }

    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe((value) => {
      this.searchChange.emit(value ?? '');
    });
  }

  clear(): void {
    this.searchControl.setValue('');
  }

  get hasValue(): boolean {
    const value = this.searchControl.value;
    return !!value && value.length > 0;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
