import { Pipe, PipeTransform } from '@angular/core';

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
];

/**
 * Convierte 'YYYY-MM' en 'May 26' (mes abreviado capitalizado + año 2 dígitos).
 * Replicado de shortMonthLabel en ClientesDashboardComponent.
 */
@Pipe({ name: 'shortMonth', pure: true })
export class ShortMonthPipe implements PipeTransform {
  transform(mesIso: string | null | undefined): string {
    if (!mesIso) return '—';
    const parts = mesIso.split('-');
    if (parts.length !== 2) return '—';
    const [y, m] = parts.map(Number);
    if (!m || m < 1 || m > 12) return '—';
    const yy = String(y).slice(-2);
    const ms = MESES_CORTOS[m - 1];
    return `${ms.charAt(0).toUpperCase()}${ms.slice(1)} ${yy}`;
  }
}
