import {
  PeriodoModo,
  PeriodoSeleccionado
} from '../models/estado-resultados.model';

/**
 * Helpers puros de cálculo de período (mensual/trimestral/semestral).
 * Compartidos entre los servicios de Contabilidad (P&G, Flujo de Caja, etc.)
 * para garantizar que todos los informes usen exactamente la misma semántica
 * de períodos y la misma forma del label.
 */

const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// ─── Date helpers (timezone-safe, sin shenanigans) ──────────────────────────

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function containsToday(start: Date, end: Date): boolean {
  const hoy = todayLocal();
  return hoy >= start && hoy <= end;
}

// ─── Builders por modo ──────────────────────────────────────────────────────

export function buildMensual(year: number, monthIdx: number): PeriodoSeleccionado {
  // Normalizar overflow (monthIdx puede venir como -1 o 12 desde navegación).
  const normalized = new Date(year, monthIdx, 1);
  const y = normalized.getFullYear();
  const m = normalized.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  return {
    modo: 'mensual',
    fecha_inicio: toIsoDate(start),
    fecha_fin: toIsoDate(end),
    label: `${MESES_LARGOS[m]} ${y}`,
    es_actual: containsToday(start, end)
  };
}

export function buildTrimestral(year: number, trimestreIdx: number): PeriodoSeleccionado {
  let y = year;
  let q = trimestreIdx;
  while (q < 0) { q += 4; y -= 1; }
  while (q > 3) { q -= 4; y += 1; }
  const startMonth = q * 3;
  const endMonth = startMonth + 2;
  const start = new Date(y, startMonth, 1);
  const end = new Date(y, endMonth + 1, 0);
  return {
    modo: 'trimestral',
    fecha_inicio: toIsoDate(start),
    fecha_fin: toIsoDate(end),
    label: `T${q + 1} ${y} · ${MESES_LARGOS[startMonth]} — ${MESES_LARGOS[endMonth]} ${y}`,
    es_actual: containsToday(start, end)
  };
}

export function buildSemestral(year: number, semestreIdx: number): PeriodoSeleccionado {
  let y = year;
  let s = semestreIdx;
  while (s < 0) { s += 2; y -= 1; }
  while (s > 1) { s -= 2; y += 1; }
  const startMonth = s * 6;
  const endMonth = startMonth + 5;
  const start = new Date(y, startMonth, 1);
  const end = new Date(y, endMonth + 1, 0);
  return {
    modo: 'semestral',
    fecha_inicio: toIsoDate(start),
    fecha_fin: toIsoDate(end),
    label: `S${s + 1} ${y} · ${MESES_LARGOS[startMonth]} — ${MESES_LARGOS[endMonth]} ${y}`,
    es_actual: containsToday(start, end)
  };
}

// ─── Período "actual" según el modo ────────────────────────────────────────

export function getMensualActual(): PeriodoSeleccionado {
  const now = todayLocal();
  return buildMensual(now.getFullYear(), now.getMonth());
}

export function getTrimestreActual(): PeriodoSeleccionado {
  const now = todayLocal();
  return buildTrimestral(now.getFullYear(), Math.floor(now.getMonth() / 3));
}

export function getSemestreActual(): PeriodoSeleccionado {
  const now = todayLocal();
  return buildSemestral(now.getFullYear(), now.getMonth() < 6 ? 0 : 1);
}

/** Devuelve el "actual" según el modo dado. */
export function getActualForModo(modo: PeriodoModo): PeriodoSeleccionado {
  switch (modo) {
    case 'mensual':    return getMensualActual();
    case 'trimestral': return getTrimestreActual();
    case 'semestral':  return getSemestreActual();
  }
}

// ─── Navegación temporal ───────────────────────────────────────────────────

export function shiftPeriodo(
  current: PeriodoSeleccionado,
  direccion: -1 | 1
): PeriodoSeleccionado {
  const start = parseIsoDate(current.fecha_inicio);
  const y = start.getFullYear();
  const m = start.getMonth();

  switch (current.modo) {
    case 'mensual':
      return buildMensual(y, m + direccion);
    case 'trimestral': {
      const q = Math.floor(m / 3);
      return buildTrimestral(y, q + direccion);
    }
    case 'semestral': {
      const s = m < 6 ? 0 : 1;
      return buildSemestral(y, s + direccion);
    }
  }
}
