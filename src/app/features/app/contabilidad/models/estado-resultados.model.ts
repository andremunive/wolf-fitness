// ─── Contrato de la Edge Function `get-estado-resultados` ────────────────────

export interface PeriodoInfo {
  fecha_inicio: string;   // YYYY-MM-DD
  fecha_fin: string;      // YYYY-MM-DD
  es_parcial: boolean;
  fecha_corte: string;    // YYYY-MM-DD
}

export interface LineaFinanciera {
  categoria: string;
  total_cop: number;
  /** Sólo presente en líneas de gastos_operativos. */
  es_nomina_entrenadores?: boolean;
}

export interface IngresosData {
  mensualidades_cop: number;
  cafeteria_cop: number;
  total_cop: number;
}

export interface CostosCafeteriaData {
  lineas: LineaFinanciera[];
  total_cop: number;
}

export interface CostosDirectosData {
  lineas: LineaFinanciera[];
  total_cop: number;
}

export interface GastosAdministrativosData {
  lineas: LineaFinanciera[];
  total_cop: number;
}

export interface GastosOperativosData {
  lineas: LineaFinanciera[];
  total_cop: number;
}

export interface GastosFinancierosData {
  lineas: LineaFinanciera[];
  total_cop: number;
}

export interface EstadoResultadosResponse {
  periodo: PeriodoInfo;
  ingresos: IngresosData;
  costos_directos: CostosDirectosData;
  costos_cafeteria: CostosCafeteriaData;
  utilidad_bruta_cop: number;
  gastos_administrativos: GastosAdministrativosData;
  gastos_operativos: GastosOperativosData;
  utilidad_operativa_cop: number;
  gastos_financieros: GastosFinancierosData;
  resultado_periodo_cop: number;
}

// ─── Estado del selector de período ──────────────────────────────────────────

export type PeriodoModo = 'mensual' | 'trimestral' | 'semestral';

export interface PeriodoSeleccionado {
  modo: PeriodoModo;
  fecha_inicio: string;   // YYYY-MM-DD
  fecha_fin: string;      // YYYY-MM-DD
  /** "Mayo 2026" · "T2 2026 · Abr–Jun" · "S1 2026 · Ene–Jun" */
  label: string;
  /** true cuando fecha_fin >= hoy → deshabilita navegación hacia adelante. */
  es_actual: boolean;
}
