import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'deltaArrow', pure: true })
export class DeltaArrowPipe implements PipeTransform {
  transform(delta: number | null | undefined): string {
    if (delta == null) return '→';
    if (delta > 0) return '↑';
    if (delta < 0) return '↓';
    return '→';
  }
}
