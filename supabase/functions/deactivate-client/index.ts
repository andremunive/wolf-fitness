import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface DeactivateClientPayload {
  client_id: string;
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

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerUser) {
    return errorResponse(401, "Token inválido o expirado.");
  }

  // Lee el rol desde profiles vía service_role (no depende de app_metadata).
  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", callerUser.id)
    .single();

  if (callerProfileError || !callerProfile) {
    return errorResponse(401, "No se pudo verificar la identidad del invocador.");
  }

  const callerRole = callerProfile.role;
  if (!callerRole || !["admin", "trainer"].includes(callerRole)) {
    return errorResponse(403, "Solo admin o trainer pueden desactivar clientes.");
  }

  let payload: DeactivateClientPayload;
  try {
    payload = await req.json() as DeactivateClientPayload;
  } catch {
    return errorResponse(400, "Payload JSON inválido.");
  }

  if (!payload.client_id) {
    return errorResponse(400, "Campo requerido ausente: client_id.");
  }

  const { data: clientData, error: clientError } = await adminClient
    .from("clients")
    .select("id, status")
    .eq("id", payload.client_id)
    .single();

  if (clientError || !clientData) {
    return errorResponse(404, "Cliente no encontrado.");
  }

  if (clientData.status === "inactive") {
    return errorResponse(400, "El cliente ya está inactivo.");
  }

  if (callerRole === "trainer") {
    const { data: assignment, error: assignError } = await adminClient
      .from("client_trainer_assignments")
      .select("id")
      .eq("client_id", payload.client_id)
      .eq("trainer_id", callerUser.id)
      .is("ended_at", null)
      .single();

    if (assignError || !assignment) {
      return errorResponse(403, "No tienes permiso para desactivar este cliente. Solo puedes desactivar clientes actualmente asignados a ti.");
    }
  }

  const { error: clientUpdateError } = await adminClient
    .from("clients")
    .update({ status: "inactive" })
    .eq("id", payload.client_id);

  if (clientUpdateError) {
    console.error("[deactivate-client] clients update error:", clientUpdateError);
    return errorResponse(500, "Error al actualizar estado del cliente.", clientUpdateError.message);
  }

  const { error: profileUpdateError } = await adminClient
    .from("profiles")
    .update({ is_active: false })
    .eq("id", payload.client_id);

  if (profileUpdateError) {
    console.error("[deactivate-client] profiles update error:", profileUpdateError);
    await adminClient
      .from("clients")
      .update({ status: "active" })
      .eq("id", payload.client_id);
    return errorResponse(500, "Error al desactivar acceso del cliente.", profileUpdateError.message);
  }

  const { error: ctaUpdateError } = await adminClient
    .from("client_trainer_assignments")
    .update({
      ended_at: new Date().toISOString(),
      ended_by: callerUser.id,
    })
    .eq("client_id", payload.client_id)
    .is("ended_at", null);

  if (ctaUpdateError) {
    console.error("[deactivate-client] client_trainer_assignments update error:", ctaUpdateError);
    await adminClient
      .from("profiles")
      .update({ is_active: true })
      .eq("id", payload.client_id);
    await adminClient
      .from("clients")
      .update({ status: "active" })
      .eq("id", payload.client_id);
    return errorResponse(500, "Error al cerrar asignación de trainer.", ctaUpdateError.message);
  }

  console.log(`[deactivate-client] Cliente desactivado. client_id=${payload.client_id}, caller_role=${callerRole}, caller_id=${callerUser.id}`);

  return jsonOk({
    success: true,
    client_id: payload.client_id,
    status: "inactive",
    is_active: false,
    assignment_closed: true,
  }, 200);
});
