import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DetallePayload {
  entrenador_id: string | null;
  fecha_referencia: string; // YYYY-MM-DD
}

interface DetalleRawRow {
  retencion_activos_prev:        number | bigint;
  retencion_repitieron:          number | bigint;
  nuevos_total:                  number | bigint;
  nuevos_6d:                     number | bigint;
  nuevos_3d:                     number | bigint;
  nuevos_prev_total:             number | bigint;
  nuevos_referido_total:         number | bigint;
  nuevos_referido_6d:            number | bigint;
  nuevos_referido_3d:            number | bigint;
  nuevos_referido_prev_total:    number | bigint;
  nuevos_publicidad_total:       number | bigint;
  nuevos_publicidad_6d:          number | bigint;
  nuevos_publicidad_3d:          number | bigint;
  nuevos_publicidad_prev_total:  number | bigint;
  nuevos_llego_solo_total:       number | bigint;
  nuevos_llego_solo_6d:          number | bigint;
  nuevos_llego_solo_3d:          number | bigint;
  nuevos_llego_solo_prev_total:  number | bigint;
  recuperados_total:             number | bigint;
  recuperados_6d:                number | bigint;
  recuperados_3d:                number | bigint;
  recuperados_prev_total:        number | bigint;
  en_riesgo:                     EnRiesgoEntry[] | null;
}

interface EnRiesgoEntry {
  cliente_id:  string;
  nombre:      string;
  entrenador:  string;
  plan:        string; // "6d" | "3d"
  ultimo_pago: string; // "YYYY-MM-DD"
  vence_el:    string; // "YYYY-MM-DD"
  estado:      string; // "pendiente" | "por_vencer"
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

/** Returns true if v is a valid UUID (case-insensitive). */
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

  const supabaseUrl      = Deno.env.get("SUPABASE_URL")              ?? "";
  const supabaseAnonKey  = Deno.env.get("SUPABASE_ANON_KEY")         ?? "";
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
  const { data: { user: callerUser }, error: callerError } =
    await callerClient.auth.getUser();
  if (callerError || !callerUser) {
    return errResp(401, "UNAUTHORIZED", "Token inválido o expirado.");
  }

  // ── [B] Authorisation: role lives in app_metadata (never user_metadata) ──
  const callerRole = (callerUser.app_metadata?.role ?? "") as string;

  if (callerRole === "client") {
    console.warn(JSON.stringify({
      fn: "stats-clients-detalle",
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
  let payload: DetallePayload;
  try {
    payload = await req.json() as DetallePayload;
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
  //   admin   → respects entrenador_id from payload (null = all trainers)
  //   trainer → always forced to own uid; payload.entrenador_id is ignored
  //   csm     → respects entrenador_id from payload (null = all trainers)
  const effectiveEntrenadorId: string | null =
    callerRole === "trainer" ? callerUser.id : rawEntrenadorId;

  console.log(JSON.stringify({
    fn: "stats-clients-detalle",
    level: "info",
    msg: "Request received",
    caller_id: callerUser.id,
    caller_role: callerRole,
    fecha_referencia,
    effective_entrenador_id: effectiveEntrenadorId,
  }));

  // ── [E] Execute aggregation via SQL function fn_stats_clients_detalle ────
  //
  // fn_stats_clients_detalle(p_ref date, p_te uuid)
  // returns exactly 1 row with cohort + breakdowns + nuevos por origen +
  // jsonb en_riesgo array.
  const { data: rpcData, error: rpcError } = await adminClient.rpc(
    "fn_stats_clients_detalle",
    {
      p_ref: fecha_referencia,
      p_te:  effectiveEntrenadorId,
    }
  );

  if (rpcError) {
    console.error(JSON.stringify({
      fn: "stats-clients-detalle",
      level: "error",
      msg: "RPC fn_stats_clients_detalle error",
      error: rpcError,
      caller_id: callerUser.id,
    }));
    return errResp(500, "INTERNAL_ERROR", "Error al calcular estadísticas de detalle.", {
      detail: rpcError.message,
    });
  }

  const rows = (rpcData ?? []) as DetalleRawRow[];
  if (rows.length === 0) {
    return errResp(500, "INTERNAL_ERROR", "La función SQL no devolvió datos.");
  }
  const row = rows[0];

  // ── [F] Map raw row to structured response ────────────────────────────────
  //
  // BigInt columns arrive as number in Deno; cast with Number() to be explicit.
  // tasa: percentage with one decimal, null when activos_prev === 0 (no data).
  const activosPrev    = Number(row.retencion_activos_prev);
  const repitieron     = Number(row.retencion_repitieron);

  const tasa: number | null =
    activosPrev > 0
      ? Math.round((repitieron / activosPrev) * 1000) / 10
      : null;

  const nuevosTotal       = Number(row.nuevos_total);
  const nuevosPrevTotal   = Number(row.nuevos_prev_total);
  const recuperadosTotal      = Number(row.recuperados_total);
  const recuperadosPrevTotal  = Number(row.recuperados_prev_total);

  const referidoTotal       = Number(row.nuevos_referido_total);
  const referidoPrevTotal   = Number(row.nuevos_referido_prev_total);
  const publicidadTotal     = Number(row.nuevos_publicidad_total);
  const publicidadPrevTotal = Number(row.nuevos_publicidad_prev_total);
  const llegoSoloTotal      = Number(row.nuevos_llego_solo_total);
  const llegoSoloPrevTotal  = Number(row.nuevos_llego_solo_prev_total);

  const response = {
    retencion: {
      tasa,
      activos_mes_anterior: activosPrev,
      repitieron_este_mes:  repitieron,
    },
    nuevos: {
      total:   nuevosTotal,
      plan_6d: Number(row.nuevos_6d),
      plan_3d: Number(row.nuevos_3d),
      delta:   nuevosTotal - nuevosPrevTotal,
    },
    nuevos_por_origen: {
      referido: {
        total:   referidoTotal,
        plan_6d: Number(row.nuevos_referido_6d),
        plan_3d: Number(row.nuevos_referido_3d),
        delta:   referidoTotal - referidoPrevTotal,
      },
      publicidad: {
        total:   publicidadTotal,
        plan_6d: Number(row.nuevos_publicidad_6d),
        plan_3d: Number(row.nuevos_publicidad_3d),
        delta:   publicidadTotal - publicidadPrevTotal,
      },
      llego_solo: {
        total:   llegoSoloTotal,
        plan_6d: Number(row.nuevos_llego_solo_6d),
        plan_3d: Number(row.nuevos_llego_solo_3d),
        delta:   llegoSoloTotal - llegoSoloPrevTotal,
      },
    },
    recuperados: {
      total:   recuperadosTotal,
      plan_6d: Number(row.recuperados_6d),
      plan_3d: Number(row.recuperados_3d),
      delta:   recuperadosTotal - recuperadosPrevTotal,
    },
    en_riesgo: (row.en_riesgo ?? []) as EnRiesgoEntry[],
  };

  console.log(JSON.stringify({
    fn: "stats-clients-detalle",
    level: "info",
    msg: "Response built successfully",
    caller_id: callerUser.id,
    fecha_referencia,
    effective_entrenador_id: effectiveEntrenadorId,
    tasa,
    nuevos_total:        response.nuevos.total,
    nuevos_referido:     response.nuevos_por_origen.referido.total,
    nuevos_publicidad:   response.nuevos_por_origen.publicidad.total,
    nuevos_llego_solo:   response.nuevos_por_origen.llego_solo.total,
    recuperados_total:   response.recuperados.total,
    en_riesgo_count:     response.en_riesgo.length,
  }));

  return jsonOk(response);
});
