import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Types ───────────────────────────────────────────────────────────────────

interface QuincenalTendenciaPayload {
  entrenador_id: string | null;
  fecha_referencia: string; // YYYY-MM-DD
  meses_atras: number;      // must be one of: 1, 2, 3, 6
}

interface QuincenalTendenciaRawRow {
  mes: string;          // "YYYY-MM"
  cut_date: string;     // "YYYY-MM-DD"
  is_current: boolean;
  q1_total: number;
  q1_6d: number;
  q1_3d: number;
  q2_total: number;
  q2_6d: number;
  q2_3d: number;
}

type QuincenaEstado = "completa" | "parcial" | "no_iniciada";

interface QuincenalTendenciaItem {
  mes: string;              // "YYYY-MM"
  label: string;            // "Abr 26"
  q1_total: number;
  q1_plan_6d: number;
  q1_plan_3d: number;
  q1_estado: QuincenaEstado;
  q2_total: number;
  q2_plan_6d: number;
  q2_plan_3d: number;
  q2_estado: QuincenaEstado;
  es_mes_actual: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_MESES_ATRAS = new Set([1, 2, 3, 6]);

const MES_LABELS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errResp(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {}
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, details } }),
    { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
}

function jsonOk(data: unknown): Response {
  return new Response(
    JSON.stringify(data),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
}

/** Returns true if s is a valid YYYY-MM-DD calendar date. */
function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

/** Returns true if v is a valid UUID (case-insensitive). */
function isValidUUID(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Derives a short Spanish label from a "YYYY-MM" string.
 * Examples: "2026-04" → "Abr 26", "2025-12" → "Dic 25"
 */
function buildLabel(mes: string): string {
  const [yearStr, monthStr] = mes.split("-");
  const monthIndex = parseInt(monthStr, 10) - 1; // 0-based
  const yearShort = yearStr.slice(2);             // last 2 digits
  return `${MES_LABELS[monthIndex]} ${yearShort}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errResp(405, "METHOD_NOT_ALLOWED", "Método no permitido. Usar POST.");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errResp(401, "UNAUTHORIZED", "Token de autenticación requerido.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // callerClient — validates caller JWT; role is read from app_metadata
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // adminClient — runs as service_role, bypasses RLS; authorisation is explicit below
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── [A] Verify JWT ────────────────────────────────────────────────────────
  const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerUser) {
    return errResp(401, "UNAUTHORIZED", "Token inválido o expirado.");
  }

  // ── [B] Authorisation: role lives in app_metadata (never user_metadata) ──
  const callerRole = (callerUser.app_metadata?.role ?? "") as string;

  if (callerRole === "client") {
    console.warn(JSON.stringify({
      fn: "stats-clients-quincenal-tendencia",
      level: "warn",
      msg: "Forbidden: client role",
      caller_id: callerUser.id,
    }));
    return errResp(403, "FORBIDDEN", "Los clientes no tienen acceso a estas estadísticas.");
  }
  if (!["admin", "trainer", "csm"].includes(callerRole)) {
    return errResp(403, "FORBIDDEN", "Rol no reconocido o sin acceso.");
  }

  // ── [C] Parse and validate input ─────────────────────────────────────────
  let payload: QuincenalTendenciaPayload;
  try {
    payload = await req.json() as QuincenalTendenciaPayload;
  } catch {
    return errResp(400, "INVALID_INPUT", "Payload JSON inválido.");
  }

  const { fecha_referencia, meses_atras } = payload;

  if (!fecha_referencia || typeof fecha_referencia !== "string") {
    return errResp(400, "INVALID_INPUT", "fecha_referencia es obligatorio.");
  }
  if (!isValidDate(fecha_referencia)) {
    return errResp(400, "INVALID_INPUT", "fecha_referencia debe ser una fecha válida en formato YYYY-MM-DD.", {
      received: fecha_referencia,
    });
  }

  if (meses_atras === undefined || meses_atras === null) {
    return errResp(400, "INVALID_INPUT", "meses_atras es obligatorio.");
  }
  if (typeof meses_atras !== "number" || !Number.isInteger(meses_atras) || !VALID_MESES_ATRAS.has(meses_atras)) {
    return errResp(400, "INVALID_INPUT", "meses_atras debe ser uno de: 1, 2, 3, 6.", {
      received: meses_atras,
      allowed: [1, 2, 3, 6],
    });
  }

  const rawEntrenadorId = payload.entrenador_id ?? null;
  if (rawEntrenadorId !== null && !isValidUUID(rawEntrenadorId)) {
    return errResp(400, "INVALID_INPUT", "entrenador_id debe ser un UUID válido o null.", {
      received: rawEntrenadorId,
    });
  }

  // ── [D] Apply role-based entrenador_id override ───────────────────────────
  //   admin   → respects entrenador_id (null = all trainers)
  //   trainer → always forced to own uid; payload.entrenador_id is ignored
  //   csm     → respects entrenador_id (null = all trainers)
  const effectiveEntrenadorId: string | null =
    callerRole === "trainer" ? callerUser.id : rawEntrenadorId;

  console.log(JSON.stringify({
    fn: "stats-clients-quincenal-tendencia",
    level: "info",
    msg: "Request received",
    caller_id: callerUser.id,
    caller_role: callerRole,
    fecha_referencia,
    meses_atras,
    effective_entrenador_id: effectiveEntrenadorId,
  }));

  // ── [E] Execute aggregation via SQL function fn_stats_clients_quincenal_tendencia
  //
  // fn_stats_clients_quincenal_tendencia(p_ref date, p_meses_atras int, p_te uuid)
  // returns SETOF rows — one per month from (p_ref - p_meses_atras months) to p_ref inclusive.
  // Defined in migration stats_clients_quincenal_tendencia_fn.
  const { data: rpcData, error: rpcError } = await adminClient.rpc(
    "fn_stats_clients_quincenal_tendencia",
    {
      p_ref: fecha_referencia,
      p_meses_atras: meses_atras,
      p_te: effectiveEntrenadorId,
    }
  );

  if (rpcError) {
    console.error(JSON.stringify({
      fn: "stats-clients-quincenal-tendencia",
      level: "error",
      msg: "RPC fn_stats_clients_quincenal_tendencia error",
      error: rpcError,
      caller_id: callerUser.id,
    }));
    return errResp(500, "INTERNAL_ERROR", "Error al calcular estadísticas quincenal tendencia.", {
      detail: rpcError.message,
    });
  }

  // ── [F] Derive quincena estados and map rows to response items ────────────
  //
  // Estado logic is derived from fecha_referencia and is_current:
  //   - Months before current: both Q1 and Q2 are "completa"
  //   - Current month, ref day <= 15: Q1 = "parcial", Q2 = "no_iniciada"
  //   - Current month, ref day > 15:  Q1 = "completa", Q2 = "parcial"
  const refDay = parseInt(fecha_referencia.split("-")[2], 10);
  const isFirstHalfOnly = refDay <= 15;

  const rows = (rpcData ?? []) as QuincenalTendenciaRawRow[];

  const response: QuincenalTendenciaItem[] = rows.map((row) => {
    let q1Estado: QuincenaEstado;
    let q2Estado: QuincenaEstado;

    if (!row.is_current) {
      q1Estado = "completa";
      q2Estado = "completa";
    } else if (isFirstHalfOnly) {
      q1Estado = "parcial";
      q2Estado = "no_iniciada";
    } else {
      q1Estado = "completa";
      q2Estado = "parcial";
    }

    return {
      mes: row.mes,
      label: buildLabel(row.mes),
      q1_total: Number(row.q1_total),
      q1_plan_6d: Number(row.q1_6d),
      q1_plan_3d: Number(row.q1_3d),
      q1_estado: q1Estado,
      q2_total: Number(row.q2_total),
      q2_plan_6d: Number(row.q2_6d),
      q2_plan_3d: Number(row.q2_3d),
      q2_estado: q2Estado,
      es_mes_actual: row.is_current,
    };
  });

  console.log(JSON.stringify({
    fn: "stats-clients-quincenal-tendencia",
    level: "info",
    msg: "Response built successfully",
    caller_id: callerUser.id,
    fecha_referencia,
    meses_atras,
    effective_entrenador_id: effectiveEntrenadorId,
    row_count: response.length,
  }));

  return jsonOk(response);
});
