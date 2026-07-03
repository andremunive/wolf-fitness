import { Injectable } from '@angular/core';

// ─── Tipo ─────────────────────────────────────────────────────────────────────

/**
 * Geometría SVG precalculada para un gauge semicircular (arco 180°).
 */
export interface GaugeGeometry {
  /** Path del arco completo (track gris). */
  trackD: string;
  /** Path del arco de progreso (coloreado). */
  barD: string;
  /** Color hex del arco de progreso. */
  color: string;
  grade: 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'CRÍTICO';
  description: string;
  /** Porcentaje como string entero: "85". */
  pctLabel: string;
  cx: number;
  cy: number;
  r: number;
  /** Ancho del SVG (igual a `size`). */
  width: number;
  /** Alto del SVG: `size / 2 + 12` para acomodar el stroke del arco. */
  height: number;
  /** viewBox precalculado: "0 0 W H". */
  viewBox: string;
}

// ─── Diferencias encontradas entre clientes vs finanzas ───────────────────────
//
// Ambos componentes tienen:
//   - arcPath idéntico (firma, lógica, result).
//   - gaugeSize = 160.
//   - stroke = 12, r = size/2 − stroke − 8, cx = size/2, cy = size/2 + 4.
//   - startA = Math.PI, endA = Math.PI*2, valA = startA + (endA - startA) * ratio.
//   - width = size, height = size/2 + 12, viewBox = `0 0 ${width} ${height}`.
//   - thresholds: >=80 EXCELENTE, >=60 BUENO, >=40 REGULAR, else CRÍTICO.
//   - Colores: 80+ → #10b981, 60+ → #f59e0b, 40+ → #f97316, else → #dc2626.
//
// Diferencia real: los textos de `description` y el caso especial pct===100
// en FinanzasDashboard (sin egresos registrados).
// Diferencia real: el cálculo del RATIO se hace en el componente (activos/total
// en clientes; utilidad/ingresos en finanzas) — el servicio recibe el ratio ya.
//
// Unificación:
//   - El parámetro `texts` permite al llamador sobrescribir grade y description.
//   - Los thresholds de color y grade son iguales en ambos → se unifican.
//   - Si `texts` no se pasa, el servicio deriva grade y description genéricos.
//   - FinanzasDashboard pasa texts explícitamente cuando pct===100 (caso especial).

const DEFAULT_SIZE   = 160;
const DEFAULT_STROKE = 12;

/** Thresholds de porcentaje para determinar el grado. */
const THRESHOLD_EXCELENTE = 80;
const THRESHOLD_BUENO     = 60;
const THRESHOLD_REGULAR   = 40;

// ─── Servicio ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class GaugeGeometryService {
  /**
   * Construye la geometría del gauge semicircular (arco 180°).
   *
   * @param ratio       Valor normalizado 0..1 (ya clampeado por el llamador).
   * @param thresholds  Porcentajes de corte para los grados. Default: 80/60/40.
   * @param texts       Sobrescribe `grade` y `description` calculados. Útil para
   *                    textos contextuales (ej: "sin egresos registrados" en finanzas).
   * @param size        Tamaño del SVG en px. Default 160.
   */
  build(
    ratio: number,
    thresholds: { good: number; medium: number; low: number } = {
      good:   THRESHOLD_EXCELENTE,
      medium: THRESHOLD_BUENO,
      low:    THRESHOLD_REGULAR
    },
    texts?: { grade: GaugeGeometry['grade']; description: string },
    size = DEFAULT_SIZE
  ): GaugeGeometry {
    const clampedRatio = Math.min(Math.max(ratio, 0), 1);
    const pct          = Math.round(clampedRatio * 100);

    let color: string;
    let grade: GaugeGeometry['grade'];
    let description: string;

    if (pct >= thresholds.good) {
      color       = '#10b981';
      grade       = 'EXCELENTE';
      description = 'Excelente nivel en el período actual.';
    } else if (pct >= thresholds.medium) {
      color       = '#f59e0b';
      grade       = 'BUENO';
      description = 'Buen nivel. Hay margen de mejora.';
    } else if (pct >= thresholds.low) {
      color       = '#f97316';
      grade       = 'REGULAR';
      description = 'Nivel ajustado. Revisar los indicadores clave.';
    } else {
      color       = '#dc2626';
      grade       = 'CRÍTICO';
      description = 'Nivel crítico. Se requiere atención inmediata.';
    }

    // Sobrescribir con textos del llamador si se proporcionan.
    if (texts) {
      grade       = texts.grade;
      description = texts.description;
    }

    const stroke = DEFAULT_STROKE;
    const r      = size / 2 - stroke - 8;
    const cx     = size / 2;
    const cy     = size / 2 + 4;

    const startA = Math.PI;
    const endA   = Math.PI * 2;
    const valA   = startA + (endA - startA) * clampedRatio;

    const width  = size;
    const height = size / 2 + 12;

    return {
      trackD: this.arcPath(cx, cy, r, startA, endA),
      barD:   this.arcPath(cx, cy, r, startA, valA),
      color,
      grade,
      description,
      pctLabel: pct.toString(),
      cx,
      cy,
      r,
      width,
      height,
      viewBox: `0 0 ${width} ${height}`
    };
  }

  /** Construye el path SVG de un arco entre dos ángulos en radianes. */
  private arcPath(
    cx: number,
    cy: number,
    r: number,
    a1: number,
    a2: number
  ): string {
    // Evitar arco degenerado (inicio = fin produce path inválido).
    const safeA2 = a2 <= a1 ? a1 + 0.001 : a2;
    const x1     = cx + r * Math.cos(a1);
    const y1     = cy + r * Math.sin(a1);
    const x2     = cx + r * Math.cos(safeA2);
    const y2     = cy + r * Math.sin(safeA2);
    const large  = safeA2 - a1 > Math.PI ? 1 : 0;
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  }
}
