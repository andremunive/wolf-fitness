import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface DashboardPayload {
  fecha_inicio: string;
  fecha_fin: string;
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
    return errorResponse(403, "Solo administradores pueden acceder al dashboard de cafetería.");
  }

  let payload: DashboardPayload;
  try {
    payload = await req.json() as DashboardPayload;
  } catch {
    return errorResponse(400, "Payload JSON inválido.");
  }

  const { fecha_inicio, fecha_fin } = payload;

  if (!fecha_inicio || !fecha_fin) {
    return errorResponse(400, "Los campos fecha_inicio y fecha_fin son requeridos.");
  }

  if (!isValidDate(fecha_inicio)) {
    return errorResponse(400, "fecha_inicio debe tener formato YYYY-MM-DD válido.");
  }

  if (!isValidDate(fecha_fin)) {
    return errorResponse(400, "fecha_fin debe tener formato YYYY-MM-DD válido.");
  }

  if (fecha_inicio > fecha_fin) {
    return errorResponse(400, "fecha_inicio debe ser anterior o igual a fecha_fin.");
  }

  const { data: rpcData, error: rpcError } = await serviceClient.rpc(
    "get_cafeteria_dashboard",
    {
      p_fecha_inicio: fecha_inicio,
      p_fecha_fin: fecha_fin,
    }
  );

  if (rpcError) {
    console.error("[get-cafeteria-dashboard] RPC error:", rpcError);
    return errorResponse(500, "Error al obtener el dashboard de cafetería.", rpcError.message);
  }

  console.log(
    `[get-cafeteria-dashboard] Dashboard generado. user_id=${user.id}, period=${fecha_inicio}/${fecha_fin}`
  );

  return jsonOk({ data: rpcData });
});
