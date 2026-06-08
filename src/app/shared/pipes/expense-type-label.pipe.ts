import { Pipe, PipeTransform } from '@angular/core';

import {
  EXPENSE_TYPE_LABELS,
  ExpenseTypeValue
} from 'src/app/features/app/expense-records/models/expense-record.model';

/**
 * Devuelve la etiqueta humana para un `expense_type`.
 * Pure pipe — sólo recalcula cuando cambia la referencia del input.
 * Uso: `{{ expenseType | expenseTypeLabel }}`.
 */
@Pipe({ name: 'expenseTypeLabel', pure: true })
export class ExpenseTypeLabelPipe implements PipeTransform {
  transform(value: ExpenseTypeValue | null | undefined): string {
    if (!value) return '';
    return EXPENSE_TYPE_LABELS[value] ?? '';
  }
}
