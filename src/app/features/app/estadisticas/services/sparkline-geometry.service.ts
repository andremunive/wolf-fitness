import { Injectable } from '@angular/core';

// ─── Tipo ─────────────────────────────────────────────────────────────────────

/**
 * Geometría SVG precalculada para una sparkline de línea + área.
 * El color y el id del gradient se aplican en el template — este tipo
 * solo carga coordenadas puras.
 */
export interface SparklineGeometry {
  /** Path "d" para la línea (M + L). */
  linePath: string;
  /** Path "d" para el área debajo de la línea (line + Z hacia el baseline). */
  areaPath: string;
  /** Coordenadas del último punto, para dibujar el dot destacado. */
  lastX: number;
  lastY: number;
  /** Dimensiones efectivas del viewBox. */
  width: number;
  height: number;
}

// ─── Diferencias encontradas entre clientes vs finanzas ───────────────────────
//
// ClientesDashboard:
//   - defaults: width = SPARKLINE_VB_WIDTH (320), height = SPARKLINE_VB_HEIGHT (60)
//   - se usa principalmente en buildHeroSparkline con esos defaults grandes
//   - también expone el método público para las cards individuales
//
// FinanzasDashboard:
//   - defaults: width = 80, height = 40 (cards pequeñas)
//   - buildHeroSparkline llama con width=320, height=60
//   - SPARKLINE_PADDING_Y = 6 en ambos (idéntico)
//
// Unificación: el servicio usa width=80 y height=40 como defaults para el caso
// más común (sparklines de cards). El llamador pasa width/height explícitamente
// cuando necesita las dimensiones del hero (320×60). SPARKLINE_PADDING_Y = 6 fijo.

const PADDING_Y = 6;

// ─── Servicio ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class SparklineGeometryService {
  /**
   * Construye paths SVG de línea + área para una sparkline.
   *
   * @param values  Serie de valores numéricos (mínimo 2 puntos para dibujar).
   * @param width   Ancho lógico del viewBox. Default 80 (cards pequeñas).
   * @param height  Alto lógico del viewBox. Default 40 (cards pequeñas).
   *
   * Para el hero de ambos dashboards, pasar width=320 y height=60.
   * Devuelve null si la serie es insuficiente (<2 puntos).
   */
  build(
    values: number[],
    width = 80,
    height = 40
  ): SparklineGeometry | null {
    if (!values || values.length < 2) return null;

    const min   = Math.min(...values, 0);
    const max   = Math.max(...values, 0);
    const range = max - min || 1;

    const pad    = PADDING_Y;
    const innerH = height - pad * 2;
    const stepX  = width / (values.length - 1);

    const coords = values.map((v, i) => {
      const x = i * stepX;
      const y = pad + innerH - ((v - min) / range) * innerH;
      return { x, y };
    });

    const linePath = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
      .join(' ');

    const first = coords[0];
    const last  = coords[coords.length - 1];
    const areaPath =
      `${linePath} L${last.x.toFixed(2)},${height} L${first.x.toFixed(2)},${height} Z`;

    return {
      linePath,
      areaPath,
      lastX: last.x,
      lastY: last.y,
      width,
      height
    };
  }
}
