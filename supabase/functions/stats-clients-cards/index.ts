import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StatsPayload {
  entrenador_id: string | null;
  fecha_referencia: string; // YYYY-MM-DD
}

interface Breakdown {
  total: number;
  plan_6d: number;
  plan_3d: number;
  delta: number;
}

interface StatsCardsResponse {
  tipo_a: Breakdown;
  tipo_b: Breakdown;
  total_activos_hoy: Breakdown;
  total_clientes_sistema: number;
  parciales_mes: number;
}

/** Raw row returned by fn_stats_clients_cards SQL function */
interface StatsRawRow {
  ta_total: number;
  ta_6d: number;
  ta_3d: number;
  ta_prev_total: number;
  tb_total: number;
  tb_6d: number;
  tb_3d: number;
  tb_prev_total: number;
  tah_total: number;
  tah_6d: number;
  tah_3d: number;
  tah_prev_total: number;
  total_sistema: number;
  parciales_mes: number;
}

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

/** Returns true if v is a lower-case UUID v4. */
function isValidUUID(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
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

  // callerClient — validates caller JWT; role is read from app_metadata (memory note: never user_metadata)
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
      fn: "stats-clients-cards",
      level: "warn",
      msg: "Forbidden: client role",
      caller_id: callerUser.id,
    }));
    return errResp(403, "FORBIDDEN", "Los clientes no tienen acceso a estas estadísticas.");
  }
  if (!Object.freeze(["admin", "trainer", "csm"]).includes(callerRole)) {
    return errResp(403, "FORBIDDEN", "Rol no reconocido o sin acceso.");
  }

  // ── [C] Parse and validate input ─────────────────────────────────────────
  let payload: StatsPayload;
  try {
    payload = await req.json() as StatsPayload;
  } catch {
    return errResp(400, "INVALID_INPUT", "Payload JSON inválido.");
  }

  const { fecha_referencia } = payload;

  if (!fecha_referencia || typeof fecha_referencia !== "string") {
    return errResp(400, "INVALID_INPUT", "fecha_referencia es obligatorio.");
  }
  if (!isValidDate(fecha_referencia)) {
    return errResp(400, "INVALID_INPUT", "fecha_referencia debe ser una fecha válida en formato YYYY-MM-DD.", {
      received: fecha_referencia,
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
  //   csm     → respects entrenador_id (null = all trainers), same as admin
  const effectiveEntrenadorId: string | null =
    callerRole === "trainer" ? callerUser.id : rawEntrenadorId;

  console.log(JSON.stringify({
    fn: "stats-clients-cards",
    level: "info",
    msg: "Request received",
    caller_id: callerUser.id,
    caller_role: callerRole,
    fecha_referencia,
    effective_entrenador_id: effectiveEntrenadorId,
  }));

  // ── [E] Execute aggregation via SQL function fn_stats_clients_cards ───────
  //
  // fn_stats_clients_cards(p_ref date, p_te uuid) returns a single row with
  // 14 columns: ta_*, tb_*, tah_*, total_sistema, parciales_mes.
  // The function is defined in migration stats_clients_cards_fn_add_total_activos.
  // Filters use status != 'voided' AND voided_at IS NULL — exact partial index predicate.
  const { data: rpcData, error: rpcError } = await adminClient.rpc(
    "fn_stats_clients_cards",
    {
      p_ref: fecha_referencia,
      p_te: effectiveEntrenadorId,
    }
  );

  if (rpcError) {
    console.error(JSON.stringify({
      fn: "stats-clients-cards",
      level: "error",
      msg: "RPC fn_stats_clients_cards error",
      error: rpcError,
      caller_id: callerUser.id,
    }));
    return errResp(500, "INTERNAL_ERROR", "Error al calcular estadísticas de clientes.", {
      detail: rpcError.message,
    });
  }

  // ── [F] Build response ────────────────────────────────────────────────────
  // rpcData is an array of rows when called via .rpc() returning SETOF; we expect exactly one row.
  const rows = rpcData as StatsRawRow[] | null;
  const row: StatsRawRow = rows?.[0] ?? {
    ta_total: 0, ta_6d: 0, ta_3d: 0, ta_prev_total: 0,
    tb_total: 0, tb_6d: 0, tb_3d: 0, tb_prev_total: 0,
    tah_total: 0, tah_6d: 0, tah_3d: 0, tah_prev_total: 0,
    total_sistema: 0, parciales_mes: 0,
  };

  const response: StatsCardsResponse = {
    tipo_a: {
      total: Number(row.ta_total),
      plan_6d: Number(row.ta_6d),
      plan_3d: Number(row.ta_3d),
      delta: Number(row.ta_total) - Number(row.ta_prev_total),
    },
    tipo_b: {
      total: Number(row.tb_total),
      plan_6d: Number(row.tb_6d),
      plan_3d: Number(row.tb_3d),
      delta: Number(row.tb_total) - Number(row.tb_prev_total),
    },
    total_activos_hoy: {
      total:   Number(row.tah_total),
      plan_6d: Number(row.tah_6d),
      plan_3d: Number(row.tah_3d),
      delta:   Number(row.tah_total) - Number(row.tah_prev_total),
    },
    total_clientes_sistema: Number(row.total_sistema),
    parciales_mes: Number(row.parciales_mes),
  };

  console.log(JSON.stringify({
    fn: "stats-clients-cards",
    level: "info",
    msg: "Response built successfully",
    caller_id: callerUser.id,
    fecha_referencia,
    effective_entrenador_id: effectiveEntrenadorId,
    ta_total: response.tipo_a.total,
    tb_total: response.tipo_b.total,
    tah_total: response.total_activos_hoy.total,
    total_clientes_sistema: response.total_clientes_sistema,
    parciales_mes: response.parciales_mes,
  }));

  return jsonOk(response);
});
