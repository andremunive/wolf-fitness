import { Pipe, PipeTransform } from '@angular/core';

const METHOD_MAP: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  nequi: 'Nequi',
  other: 'Otro'
};

@Pipe({ name: 'paymentMethodLabel', pure: true })
export class PaymentMethodLabelPipe implements PipeTransform {
  transform(method: string | null | undefined): string {
    if (method === null || method === undefined) return '—';
    return METHOD_MAP[method] ?? method;
  }
}
