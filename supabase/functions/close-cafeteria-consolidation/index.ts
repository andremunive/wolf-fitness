import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface CloseConsolidationPayload {
  period_start: string;
  period_end: string;
}

interface ErrorResponse {
  error: string;
  detail?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function errorResponse(status: number, message: string, detail?: string): Response {
  const body: ErrorResponse = { error: message };
  if (detail) body.detail = detail;
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse(405, "Método no permitido. Usar POST.");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse(401, "Token de autenticación requerido.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) {
    return errorResponse(401, "Token inválido o expirado.");
  }

  const role = user.app_metadata?.role;
  if (role !== "admin") {
    return errorResponse(403, "Solo administradores pueden realizar el cierre quincenal.");
  }

  let payload: CloseConsolidationPayload;
  try {
    payload = await req.json() as CloseConsolidationPayload;
  } catch {
    return errorResponse(400, "Payload JSON inválido.");
  }

  const { period_start, period_end } = payload;

  if (!period_start || !period_end) {
    return errorResponse(400, "Los campos period_start y period_end son requeridos.");
  }

  if (!isValidDate(period_start)) {
    return errorResponse(400, "period_start debe tener formato YYYY-MM-DD válido.");
  }

  if (!isValidDate(period_end)) {
    return errorResponse(400, "period_end debe tener formato YYYY-MM-DD válido.");
  }

  if (period_start > period_end) {
    return errorResponse(400, "period_start debe ser anterior o igual a period_end.");
  }

  // Verificar cierre exacto existente
  const { data: exactMatch, error: exactError } = await serviceClient
    .from("cafeteria_consolidations")
    .select("id")
    .eq("status", "closed")
    .eq("period_start", period_start)
    .eq("period_end", period_end)
    .limit(1)
    .maybeSingle();

  if (exactError) {
    console.error("[close-cafeteria-consolidation] exact match check error:", exactError);
    return errorResponse(500, "Error al verificar cierres existentes.", exactError.message);
  }

  if (exactMatch) {
    return errorResponse(409, "Ya existe un cierre cerrado para este período.");
  }

  // Verificar overlap con otro cierre cerrado
  const { data: overlapMatch, error: overlapError } = await serviceClient
    .from("cafeteria_consolidations")
    .select("id")
    .eq("status", "closed")
    .not("period_end", "lt", period_start)
    .not("period_start", "gt", period_end)
    .limit(1)
    .maybeSingle();

  if (overlapError) {
    console.error("[close-cafeteria-consolidation] overlap check error:", overlapError);
    return errorResponse(500, "Error al verificar solapamiento de períodos.", overlapError.message);
  }

  if (overlapMatch) {
    return errorResponse(409, "Este período se cruza con otro cierre ya cerrado.");
  }

  // Ejecutar RPC transaccional con service_role (REVOKE de anon/authenticated)
  const { data: rpcData, error: rpcError } = await serviceClient.rpc(
    "close_cafeteria_consolidation",
    {
      p_period_start: period_start,
      p_period_end: period_end,
      p_user_id: user.id,
    }
  );

  if (rpcError) {
    console.error("[close-cafeteria-consolidation] RPC error:", rpcError);
    return errorResponse(500, "Error al ejecutar el cierre quincenal.", rpcError.message);
  }

  console.log(
    `[close-cafeteria-consolidation] Cierre creado exitosamente. user_id=${user.id}, period=${period_start}/${period_end}`
  );

  return jsonOk({ consolidation: rpcData });
});
