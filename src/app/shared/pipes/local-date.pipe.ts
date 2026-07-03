import { Pipe, PipeTransform } from '@angular/core';

/**
 * short → DD/MM/YYYY  (espera una fecha ISO YYYY-MM-DD)
 * long  → DD/MM/YYYY HH:mm  (espera una fecha ISO completa)
 */
@Pipe({ name: 'localDate', pure: true })
export class LocalDatePipe implements PipeTransform {
  transform(
    value: string | null | undefined,
    format: 'short' | 'long' = 'short'
  ): string {
    if (!value) return '—';
    return format === 'long'
      ? this.formatDateTime(value)
      : this.formatDateShort(value);
  }

  /** Convierte 'YYYY-MM-DD' → 'DD/MM/YYYY' sin pasar por Date para evitar offsets de zona. */
  private formatDateShort(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }

  /** Convierte un ISO completo → 'DD/MM/YYYY HH:mm' usando Date local. */
  private formatDateTime(isoStr: string): string {
    const d = new Date(isoStr);
    const day   = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year  = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins  = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  }
}
