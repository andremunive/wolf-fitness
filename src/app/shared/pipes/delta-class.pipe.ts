import { Pipe, PipeTransform } from '@angular/core';

/**
 * Retorna la clase CSS del pill de delta.
 * Las clases base (fv2-pill / cv2-pill) son distintas por dashboard;
 * este pipe usa el prefijo neutro que cada sección aplica vía host binding
 * o via ngClass compuesto en el template.
 *
 * Replicado del comportamiento de deltaPillClass en FinanzasDashboard:
 *   fv2-pill fv2-pill--up / fv2-pill--down / fv2-pill--flat
 *
 * Para clientes el prefijo es cv2-pill (idéntica lógica, distinto namespace).
 * El pipe expone sólo el sufijo '--up' | '--down' | '--flat' más una clase base
 * configurable mediante el parámetro `prefix` (default 'fv2-pill').
 */
@Pipe({ name: 'deltaClass', pure: true })
export class DeltaClassPipe implements PipeTransform {
  transform(delta: number | null | undefined, prefix: string = 'fv2-pill'): string {
    if (delta == null) return `${prefix} ${prefix}--flat`;
    if (delta > 0) return `${prefix} ${prefix}--up`;
    if (delta < 0) return `${prefix} ${prefix}--down`;
    return `${prefix} ${prefix}--flat`;
  }
}
