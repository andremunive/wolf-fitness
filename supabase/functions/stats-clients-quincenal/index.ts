import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuincenalPayload {
  entrenador_id: string | null;
  fecha_referencia: string; // YYYY-MM-DD
}

interface QuincenaBreakdown {
  total: number;
  plan_6d: number;
  plan_3d: number;
  delta: number | null;
  comparativa: "parcial" | "completa";
}

interface PendientesBreakdown {
  total: number;
  plan_6d: number;
  plan_3d: number;
}

interface PerdidosBreakdown {
  total: number;
  plan_6d: number;
  plan_3d: number;
  delta: number;
}

interface QuincenalResponse {
  q1: QuincenaBreakdown;
  q2: QuincenaBreakdown;
  pendientes: PendientesBreakdown;
  perdidos: PerdidosBreakdown;
}

/** Raw row returned by fn_stats_clients_quincenal SQL function. */
interface QuincenalRawRow {
  q1_total: number;  q1_6d: number;  q1_3d: number;  q1_prev_total: number;
  q2_total: number;  q2_6d: number;  q2_3d: number;  q2_prev_total: number;
  pen_total: number; pen_6d: number; pen_3d: number;
  per_total: number; per_6d: number; per_3d: number; per_prev_total: number;
}

// ─── CORS ───────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function isValidUUID(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// ─── Main handler ───────────────────────────────────────────────────────────

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

  const supabaseUrl        = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey    = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // [A] Verify JWT
  const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerUser) {
    return errResp(401, "UNAUTHORIZED", "Token inválido o expirado.");
  }

  // [B] Authorisation: role lives in app_metadata (never user_metadata)
  const callerRole = (callerUser.app_metadata?.role ?? "") as string;
  if (callerRole === "client") {
    console.warn(JSON.stringify({
      fn: "stats-clients-quincenal", level: "warn",
      msg: "Forbidden: client role", caller_id: callerUser.id,
    }));
    return errResp(403, "FORBIDDEN", "Los clientes no tienen acceso a estas estadísticas.");
  }
  if (!["admin", "trainer", "csm"].includes(callerRole)) {
    return errResp(403, "FORBIDDEN", "Rol no reconocido o sin acceso.");
  }

  // [C] Parse and validate input
  let payload: QuincenalPayload;
  try {
    payload = await req.json() as QuincenalPayload;
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

  // [D] Role-based override: trainer always uses their own id; admin and csm respect payload.
  const effectiveEntrenadorId: string | null =
    callerRole === "trainer" ? callerUser.id : rawEntrenadorId;

  console.log(JSON.stringify({
    fn: "stats-clients-quincenal", level: "info", msg: "Request received",
    caller_id: callerUser.id, caller_role: callerRole,
    fecha_referencia, effective_entrenador_id: effectiveEntrenadorId,
  }));

  // [E] Aggregation via SQL function
  const { data: rpcData, error: rpcError } = await adminClient.rpc(
    "fn_stats_clients_quincenal",
    { p_ref: fecha_referencia, p_te: effectiveEntrenadorId }
  );
  if (rpcError) {
    console.error(JSON.stringify({
      fn: "stats-clients-quincenal", level: "error",
      msg: "RPC fn_stats_clients_quincenal error",
      error: rpcError, caller_id: callerUser.id,
    }));
    return errResp(500, "INTERNAL_ERROR", "Error al calcular estadísticas quincenales.", {
      detail: rpcError.message,
    });
  }

  // [F] Compute booleans from p_ref and assemble response
  const rows = rpcData as QuincenalRawRow[] | null;
  const r: QuincenalRawRow = rows?.[0] ?? {
    q1_total: 0, q1_6d: 0, q1_3d: 0, q1_prev_total: 0,
    q2_total: 0, q2_6d: 0, q2_3d: 0, q2_prev_total: 0,
    pen_total: 0, pen_6d: 0, pen_3d: 0,
    per_total: 0, per_6d: 0, per_3d: 0, per_prev_total: 0,
  };

  // Derive q2_active from the YYYY-MM-DD string directly — avoids TZ pitfalls.
  const day = parseInt(fecha_referencia.split("-")[2], 10);
  const q2Active = day >= 16;

  const response: QuincenalResponse = {
    q1: {
      total: Number(r.q1_total),
      plan_6d: Number(r.q1_6d),
      plan_3d: Number(r.q1_3d),
      delta: Number(r.q1_total) - Number(r.q1_prev_total),
      comparativa: q2Active ? "completa" : "parcial",
    },
    q2: q2Active
      ? {
          total: Number(r.q2_total),
          plan_6d: Number(r.q2_6d),
          plan_3d: Number(r.q2_3d),
          delta: Number(r.q2_total) - Number(r.q2_prev_total),
          comparativa: "parcial",
        }
      : {
          total: 0, plan_6d: 0, plan_3d: 0,
          delta: null,
          comparativa: "parcial",
        },
    pendientes: {
      total: Number(r.pen_total),
      plan_6d: Number(r.pen_6d),
      plan_3d: Number(r.pen_3d),
    },
    perdidos: {
      total: Number(r.per_total),
      plan_6d: Number(r.per_6d),
      plan_3d: Number(r.per_3d),
      delta: Number(r.per_total) - Number(r.per_prev_total),
    },
  };

  console.log(JSON.stringify({
    fn: "stats-clients-quincenal", level: "info",
    msg: "Response built successfully",
    caller_id: callerUser.id, fecha_referencia,
    effective_entrenador_id: effectiveEntrenadorId,
    q1_total: response.q1.total, q2_total: response.q2.total,
    pen_total: response.pendientes.total, per_total: response.perdidos.total,
  }));

  return jsonOk(response);
});
