// ─── Contrato de la Edge Function `get-flujo-de-caja` ────────────────────────
//
// PeriodoInfo, PeriodoModo, PeriodoSeleccionado se reutilizan de
// `estado-resultados.model.ts` — no duplicar.

import { PeriodoInfo } from './estado-resultados.model';

export interface FlujoOperativoEntradas {
  mensualidades_cop: number;
  cafeteria_cop: number;
  total_cop: number;
}

export interface FlujoOperativoSalidas {
  costos_directos_cop: number;
  gastos_administrativos_cop: number;
  gastos_operativos_cop: number;
  nomina_entrenadores_cop: number;
  gastos_financieros_cop: number;
  insumos_cafeteria_cop: number;
  total_cop: number;
}

export interface FlujoOperativo {
  entradas: FlujoOperativoEntradas;
  salidas: FlujoOperativoSalidas;
  flujo_neto_cop: number;
}

export interface FlujoInversion {
  inversiones_cop: number;
  /** Siempre `≤ 0` (= -inversiones_cop). */
  flujo_neto_cop: number;
  tiene_datos: boolean;
}

export interface FlujoFinanciamiento {
  /** Salida (expense_type='deuda'). */
  obligaciones_cop: number;
  /** Salida (loans). */
  prestamos_otorgados_cop: number;
  /** Entrada (loan_payments). */
  abonos_recibidos_cop: number;
  /** = abonos − obligaciones − prestamos_otorgados. */
  flujo_neto_cop: number;
  tiene_datos: boolean;
}

export interface FlujoCajaResponse {
  periodo: PeriodoInfo;
  saldo_inicial_cop: number;
  flujo_operativo: FlujoOperativo;
  flujo_inversion: FlujoInversion;
  flujo_financiamiento: FlujoFinanciamiento;
  /** = operativo.neto + inversion.neto + financiamiento.neto */
  variacion_neta_cop: number;
  /** = saldo_inicial + variacion_neta */
  saldo_final_cop: number;
}
