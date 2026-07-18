import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Types ───────────────────────────────────────────────────────────────────

type CohortKey = "pendientes" | "por_vencer" | "no_renovaron";
const VALID_COHORTS: readonly CohortKey[] = ["pendientes", "por_vencer", "no_renovaron"];

interface CarteraDetallePayload {
  entrenador_id:    string | null;
  fecha_referencia: string; // YYYY-MM-DD
  cohort:           CohortKey;
}

interface ResumenRaw {
  total:   number | string;
  plan_6d: number | string;
  plan_3d: number | string;
  delta:   number | string;
}

interface EntrenadorRaw {
  entrenador_id: string | null;
  nombre:        string;
  total_actual:  number | string;
  total_prev:    number | string;
  delta:         number | string;
}

interface ClienteRaw {
  cliente_id:   string;
  nombre:       string;
  plan:         string;
  entrenador:   string;
  fecha_inicio: string;
  debe_cop:     number | string;
  vence_el:     string | null;   // period_end del último pago (nullable)
}

interface RpcRow {
  resumen:        ResumenRaw;
  por_entrenador: EntrenadorRaw[] | null;
  clientes:       ClienteRaw[] | null;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age":       "86400",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errResp(status: number, code: string, message: string, details: Record<string, unknown> = {}): Response {
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

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return errResp(405, "METHOD_NOT_ALLOWED", "Metodo no permitido. Usar POST.");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return errResp(401, "UNAUTHORIZED", "Token de autenticacion requerido.");

  const supabaseUrl        = Deno.env.get("SUPABASE_URL")              ?? "";
  const supabaseAnonKey    = Deno.env.get("SUPABASE_ANON_KEY")         ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient  = createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerUser) return errResp(401, "UNAUTHORIZED", "Token invalido o expirado.");

  const callerRole = (callerUser.app_metadata?.role ?? "") as string;
  if (callerRole === "client") return errResp(403, "FORBIDDEN", "Los clientes no tienen acceso a estas estadisticas.");
  if (!["admin", "trainer", "csm"].includes(callerRole)) return errResp(403, "FORBIDDEN", "Rol no reconocido o sin acceso.");

  let payload: CarteraDetallePayload;
  try { payload = await req.json() as CarteraDetallePayload; }
  catch { return errResp(400, "INVALID_INPUT", "Payload JSON invalido."); }

  const { fecha_referencia, cohort } = payload;
  if (!fecha_referencia || typeof fecha_referencia !== "string") return errResp(400, "INVALID_INPUT", "fecha_referencia es obligatorio.");
  if (!isValidDate(fecha_referencia)) return errResp(400, "INVALID_INPUT", "fecha_referencia debe ser YYYY-MM-DD valido.", { received: fecha_referencia });
  if (!cohort || !VALID_COHORTS.includes(cohort)) return errResp(400, "INVALID_INPUT", `cohort debe ser uno de: ${VALID_COHORTS.join(", ")}.`, { received: cohort });

  const rawEntrenadorId = payload.entrenador_id ?? null;
  if (rawEntrenadorId !== null && !isValidUUID(rawEntrenadorId)) return errResp(400, "INVALID_INPUT", "entrenador_id debe ser UUID valido o null.", { received: rawEntrenadorId });

  const effectiveEntrenadorId: string | null = callerRole === "trainer" ? callerUser.id : rawEntrenadorId;

  console.log(JSON.stringify({
    fn: "stats-clients-cartera-detalle", level: "info", msg: "Request received",
    caller_id: callerUser.id, caller_role: callerRole,
    fecha_referencia, cohort, effective_entrenador_id: effectiveEntrenadorId,
  }));

  const { data: rpcData, error: rpcError } = await adminClient.rpc(
    "fn_stats_clients_cartera_detalle",
    { p_ref: fecha_referencia, p_te: effectiveEntrenadorId, p_cohort: cohort }
  );

  if (rpcError) {
    console.error(JSON.stringify({ fn: "stats-clients-cartera-detalle", level: "error", msg: "RPC error", error: rpcError, caller_id: callerUser.id }));
    return errResp(500, "INTERNAL_ERROR", "Error al calcular detalle de cartera.", { detail: rpcError.message });
  }

  const rows = (rpcData ?? []) as RpcRow[];
  if (rows.length === 0) return errResp(500, "INTERNAL_ERROR", "La funcion SQL no devolvio datos.");
  const row = rows[0];

  const resumen = {
    total:   Number(row.resumen.total   ?? 0),
    plan_6d: Number(row.resumen.plan_6d ?? 0),
    plan_3d: Number(row.resumen.plan_3d ?? 0),
    delta:   Number(row.resumen.delta   ?? 0),
  };

  const por_entrenador = (row.por_entrenador ?? []).map((e) => ({
    entrenador_id: e.entrenador_id,
    nombre:        e.nombre,
    total_actual:  Number(e.total_actual ?? 0),
    total_prev:    Number(e.total_prev   ?? 0),
    delta:         Number(e.delta        ?? 0),
  }));

  const clientes = (row.clientes ?? []).map((c) => ({
    cliente_id:   c.cliente_id,
    nombre:       c.nombre,
    plan:         c.plan,
    entrenador:   c.entrenador,
    fecha_inicio: c.fecha_inicio,
    debe_cop:     Number(c.debe_cop ?? 0),
    vence_el:     c.vence_el ?? null,
  }));

  const response = { resumen, por_entrenador, clientes };

  console.log(JSON.stringify({
    fn: "stats-clients-cartera-detalle", level: "info", msg: "Response built",
    caller_id: callerUser.id, cohort,
    resumen_total: resumen.total, entrenadores_count: por_entrenador.length, clientes_count: clientes.length,
  }));

  return jsonOk(response);
});
