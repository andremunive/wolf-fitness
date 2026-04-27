import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnDestroy,
  Output
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';

export interface AdjustmentFormValue {
  amount_cop: number;
  reason: string;
}

@Component({
  selector: 'app-closure-adjustment-form',
  templateUrl: './closure-adjustment-form.component.html',
  styleUrls: ['./closure-adjustment-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClosureAdjustmentFormComponent implements OnDestroy {
  @Output() formSubmit = new EventEmitter<AdjustmentFormValue>();
  @Output() formCancel = new EventEmitter<void>();

  readonly form: FormGroup;
  submitting = false;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly fb: FormBuilder) {
    this.form = this.fb.group({
      amount_cop: [null, [Validators.required]],
      reason: ['', [Validators.required, Validators.minLength(1)]]
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.value;
    // amount_cop cannot be 0 (backend validates, but we also guard here).
    if (raw.amount_cop === 0) {
      this.form.get('amount_cop')?.setErrors({ notZero: true });
      return;
    }
    this.formSubmit.emit({ amount_cop: Number(raw.amount_cop), reason: raw.reason.trim() });
  }

  hasError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl && ctrl.invalid && ctrl.touched);
  }
}
