import { Pipe, PipeTransform } from '@angular/core';

const STATUS_MAP: Record<string, string> = {
  paid: 'Pagado',
  partial: 'Parcial',
  pending: 'Pendiente'
};

@Pipe({ name: 'statusLabel', pure: true })
export class StatusLabelPipe implements PipeTransform {
  transform(status: string | null | undefined): string {
    if (status === null || status === undefined) return '—';
    return STATUS_MAP[status] ?? status;
  }
}
