import { jsPDF } from 'jspdf';

/**
 * Helpers de generación de PDF compartidos por los informes de Contabilidad.
 * Cubren formato, tipografía y trozos genéricos (footer, fecha/hora,
 * sanitización de unicode) — todo lo específico de la estructura del
 * documento vive en el `buildPDF` de cada componente.
 */

const COP_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

// ─── Formato de moneda ──────────────────────────────────────────────────────

export function formatCOPForPdf(amount: number): string {
  return COP_FORMATTER.format(amount);
}

/**
 * Formato contable: positivos normales, negativos entre paréntesis.
 * Positivo: "$1.000.000"; negativo: "(-$1.000.000)".
 * Usa guión ASCII para compatibilidad con WinAnsi de Helvetica en jsPDF.
 */
export function formatCOPAccounting(amount: number): string {
  if (amount < 0) return '(-' + COP_FORMATTER.format(Math.abs(amount)) + ')';
  return COP_FORMATTER.format(amount);
}

/**
 * "-$X" prefix con guión ASCII para salidas/montos negativos en línea.
 * Si `amount === 0` devuelve "$0" sin prefijo.
 */
export function formatCOPMinusPrefix(amount: number): string {
  if (amount === 0) return COP_FORMATTER.format(0);
  return '-' + COP_FORMATTER.format(Math.abs(amount));
}

// ─── Texto ──────────────────────────────────────────────────────────────────

/** Trunca el texto con "…" para que quepa en el ancho dado. */
export function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 4 && doc.getTextWidth(truncated + '...') > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}

/**
 * Reemplaza caracteres unicode que no están en WinAnsi (codificación por
 * defecto de Helvetica en jsPDF) por equivalentes seguros.
 */
export function sanitizeForPdf(text: string): string {
  return text
    .replace(/−/g, '-')   // MINUS SIGN → hyphen
    .replace(/—/g, '—') // em dash (sí está en WinAnsi 0x97)
    .replace(/●/g, '•'); // BLACK CIRCLE → bullet •
}

// ─── Nombres de archivo / fechas ───────────────────────────────────────────

/** "Mayo 2026" → "Mayo2026"; "T2 2026 · Abril — Junio 2026" → "T2_2026_Abril_Junio_2026". */
export function slugifyLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')             // strip diacritics
    .replace(/[·—–−]/g, ' ')                // separators → space
    .replace(/[^A-Za-z0-9]+/g, '_')          // non-alphanum → underscore
    .replace(/^_+|_+$/g, '')
    .replace(/__+/g, '_');
}

/** Hoy en formato YYYYMMDD (para nombres de archivo). */
export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** Fecha-hora actual "DD/MM/YYYY HH:mm" (para "Generado el:" del header). */
export function nowDmyHm(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

// ─── Footer estándar ───────────────────────────────────────────────────────

/**
 * Footer estándar en cada página: marca + disclaimer +
 * número de página si hay más de una. Debe llamarse por página
 * después de generar todo el contenido.
 */
export function drawPdfFooter(
  doc: jsPDF,
  pageNum: number,
  totalPages: number,
  pageW: number,
  pageH: number,
  M: number
): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(170, 170, 170);
  const footerY = pageH - M + 6;
  doc.text(
    'Wolf Fitness · Documento generado desde el sistema de gestion interno',
    pageW / 2,
    footerY,
    { align: 'center' }
  );
  doc.text(
    'Este documento es de uso gerencial. No reemplaza estados financieros certificados.',
    pageW / 2,
    footerY + 4,
    { align: 'center' }
  );
  if (totalPages > 1) {
    doc.text(`Pagina ${pageNum} de ${totalPages}`, pageW - M, footerY + 4, {
      align: 'right'
    });
  }
}
