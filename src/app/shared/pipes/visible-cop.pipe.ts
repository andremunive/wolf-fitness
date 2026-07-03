import { Pipe, PipeTransform } from '@angular/core';

/**
 * Oculta el monto cuando visible=false.
 * short=false → formato COP completo  (ej. $1.250.000)
 * short=true  → formato abreviado     (ej. $1.25M / $250K)
 */
@Pipe({ name: 'visibleCop', pure: true })
export class VisibleCopPipe implements PipeTransform {
  transform(
    value: number | null | undefined,
    visible: boolean | null | undefined,
    short: boolean = false
  ): string {
    if (!visible) return short ? '$••••' : '••••••';
    const amount = value ?? 0;
    if (short) return this.formatShort(amount);
    return this.formatCop(amount);
  }

  private formatCop(amount: number): string {
    return '$' + amount.toLocaleString('es-CO');
  }

  private formatShort(amount: number): string {
    if (amount >= 1_000_000) {
      const millions = amount / 1_000_000;
      const rounded = Math.round(millions * 100) / 100;
      return `$${rounded}M`;
    }
    if (amount >= 1_000) {
      const thousands = Math.round(amount / 1_000);
      return `$${thousands}K`;
    }
    return `$${amount}`;
  }
}
