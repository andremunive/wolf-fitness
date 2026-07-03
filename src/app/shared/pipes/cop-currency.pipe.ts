import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'copCurrency', pure: true })
export class CopCurrencyPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return '$' + value.toLocaleString('es-CO');
  }
}
