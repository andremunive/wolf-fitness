import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import {
  ClosureBankAccount,
  ClosureAdjustment,
  MONTH_NAMES_ES,
  PAYMENT_METHOD_LABELS,
  TrainerClosureResult
} from '../models/closure.model';

function formatCop(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export interface PdfLogo {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
}

@Injectable({ providedIn: 'root' })
export class ClosurePdfService {
  /**
   * Genera y descarga el PDF de comprobante de cierre quincenal.
   * Solo llama a este método cuando el cierre está en estado 'closed' o 'paid'.
   */
  generateClosure(
    closure: TrainerClosureResult,
    trainerName: string,
    logo?: PdfLogo
  ): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const quincenaLabel = closure.quincena === 'q1' ? 'Q1 (1–15)' : 'Q2 (16–fin)';
    const monthName = MONTH_NAMES_ES[closure.month - 1];
    const periodo = `${monthName} ${closure.year} · ${quincenaLabel}`;
    const today = new Date().toLocaleDateString('es-CO');

    // ─── Header ──────────────────────────────────────────────────────────────
    let cursorY = 15;

    if (logo) {
      // Mantener el aspect ratio nativo. Acotamos el alto máximo a 22mm para
      // que logos verticales no invadan el resto del header.
      const maxHeightMm = 22;
      const maxWidthMm = 30;
      const nativeRatio = logo.naturalWidth / logo.naturalHeight;
      let widthMm: number;
      let heightMm: number;
      if (nativeRatio >= 1) {
        // Logo apaisado o cuadrado: dimensiona por ancho.
        widthMm = maxWidthMm;
        heightMm = widthMm / nativeRatio;
      } else {
        // Logo vertical: dimensiona por alto.
        heightMm = maxHeightMm;
        widthMm = heightMm * nativeRatio;
      }
      doc.addImage(logo.dataUrl, 'PNG', 14, cursorY, widthMm, heightMm);
      cursorY += heightMm + 4;
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Comprobante de Cierre Quincenal', 14, cursorY);
    cursorY += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Entrenador: ${trainerName}`, 14, cursorY);
    cursorY += 5;
    doc.text(`Período: ${periodo}`, 14, cursorY);
    cursorY += 5;
    doc.text(`Generado: ${today}`, 14, cursorY);
    cursorY += 8;

    doc.setTextColor(0);

    // ─── Tabla de resumen financiero ─────────────────────────────────────────
    const summaryBody: string[][] = [
      ['Clientes plan 6 días', String(closure.count_six_days)],
      ['Clientes plan 3 días', String(closure.count_three_days)],
      ['Equivalente total quincena', closure.equivalente_q.toFixed(1)],
      ['Salario base', formatCop(closure.base_cop)],
      ['Bono de la quincena', formatCop(closure.bonus_q_cop)]
    ];

    // Ajustes (si hay)
    if (closure.adjustments && closure.adjustments.length > 0) {
      closure.adjustments.forEach((adj: ClosureAdjustment) => {
        const sign = adj.amount_cop > 0 ? '+' : '';
        summaryBody.push([`Ajuste: ${adj.reason}`, `${sign}${formatCop(adj.amount_cop)}`]);
      });
    }

    summaryBody.push(['TOTAL A PAGAR', formatCop(closure.total_cop)]);

    autoTable(doc, {
      startY: cursorY,
      head: [['Concepto', 'Valor']],
      body: summaryBody,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [34, 141, 159], textColor: 255 },
      bodyStyles: { textColor: 50 },
      didParseCell: (data) => {
        // Resaltar la fila de total
        if (
          data.section === 'body' &&
          data.row.index === summaryBody.length - 1
        ) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 12;
          data.cell.styles.textColor = [34, 141, 159];
        }
      },
      columnStyles: {
        0: { cellWidth: 110 },
        1: { cellWidth: 50, halign: 'right' }
      }
    });

    // @ts-ignore — jsPDF-AutoTable augments the doc object
    cursorY = (doc as any).lastAutoTable.finalY + 8;

    // ─── Cuenta bancaria del trainer ─────────────────────────────────────────
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Cuenta bancaria del entrenador:', 14, cursorY);
    cursorY += 5;
    doc.setFont('helvetica', 'normal');

    const bankAccount: ClosureBankAccount | null = closure.bank_account;
    if (bankAccount) {
      const lastFour = bankAccount.account_number.slice(-4);
      doc.text(
        `${bankAccount.bank} · ${bankAccount.account_type} · terminada en ${lastFour}`,
        14,
        cursorY
      );
    } else {
      doc.setTextColor(150);
      doc.text('Cuenta bancaria no registrada.', 14, cursorY);
      doc.setTextColor(0);
    }
    cursorY += 8;

    // ─── Datos del pago (solo si paid) ───────────────────────────────────────
    if (closure.status === 'paid' && closure.payment_date) {
      doc.setFont('helvetica', 'bold');
      doc.text('Datos del pago:', 14, cursorY);
      cursorY += 5;
      doc.setFont('helvetica', 'normal');
      doc.text(`Fecha: ${formatDate(closure.payment_date)}`, 14, cursorY);
      cursorY += 5;
      const methodLabel = closure.payment_method
        ? (PAYMENT_METHOD_LABELS[closure.payment_method] ?? closure.payment_method)
        : '—';
      doc.text(`Método: ${methodLabel}`, 14, cursorY);
      cursorY += 5;
      if (closure.payment_notes) {
        doc.text(`Notas: ${closure.payment_notes}`, 14, cursorY);
      }
    }

    // ─── Descarga ────────────────────────────────────────────────────────────
    const fileName =
      `cierre_${trainerName.replace(/\s+/g, '_').toLowerCase()}_${closure.year}_${String(closure.month).padStart(2, '0')}_${closure.quincena}.pdf`;
    doc.save(fileName);
  }

  /**
   * Convierte el logo local a base64 para incluirlo en el PDF.
   * Carga el asset desde /assets/logo/logo_completo.png.
   */
  loadLogoAsDataUrl(): Promise<PdfLogo | undefined> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(undefined);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight
        });
      };
      img.onerror = () => resolve(undefined);
      img.src = '/assets/logo/logo_completo.png';
    });
  }
}
