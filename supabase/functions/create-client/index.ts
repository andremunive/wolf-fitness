import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Types ───────────────────────────────────────────────────────────────────

type ClientOrigin = "referido" | "publicidad" | "llego_solo";
type Gender = "male" | "female" | "other" | "prefer_not_to_say";

interface CreateClientPayload {
  full_name: string;
  email: string;
  phone: string;
  birth_date: string;
  gender: Gender;
  neighborhood: string;
  avatar_url?: string;
  origin: ClientOrigin;
  plan_id: string;
  referred_by?: string;
  joined_at?: string;
  trainer_id?: string;
}

interface ErrorResponse {
  error: string;
  detail?: string;
}

// ─── CORS ────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Handler principal ────────────────────────────────────────────────────────

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
    return errorResponse(403, "Solo admin o trainer pueden registrar clientes.");
  }

  let payload: CreateClientPayload;
  try {
    payload = await req.json() as CreateClientPayload;
  } catch {
    return errorResponse(400, "Payload JSON inválido.");
  }

  const required: (keyof CreateClientPayload)[] = [
    "full_name", "email", "phone", "birth_date", "gender",
    "neighborhood", "origin", "plan_id",
  ];
  for (const field of required) {
    if (!payload[field]) {
      return errorResponse(400, `Campo requerido ausente: ${field}`);
    }
  }

  const validOrigins: ClientOrigin[] = ["referido", "publicidad", "llego_solo"];
  if (!validOrigins.includes(payload.origin)) {
    return errorResponse(400, `origin inválido. Valores aceptados: ${validOrigins.join(", ")}`);
  }

  if (payload.origin === "referido" && !payload.referred_by) {
    return errorResponse(400, "referred_by es obligatorio cuando origin es 'referido'.");
  }
  if (payload.origin !== "referido" && payload.referred_by) {
    return errorResponse(400, "referred_by debe ser null cuando origin no es 'referido'.");
  }

  const { data: planData, error: planError } = await adminClient
    .from("plans")
    .select("id, is_active")
    .eq("id", payload.plan_id)
    .single();

  if (planError || !planData) {
    return errorResponse(400, "plan_id no existe.");
  }
  if (!planData.is_active) {
    return errorResponse(400, "El plan especificado no está activo.");
  }

  if (payload.referred_by) {
    const { data: refProfile, error: refError } = await adminClient
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", payload.referred_by)
      .single();

    if (refError || !refProfile) {
      return errorResponse(400, "referred_by no corresponde a un perfil existente.");
    }
    if (refProfile.role !== "client") {
      return errorResponse(400, "referred_by debe ser un perfil con rol 'client'.");
    }
    if (!refProfile.is_active) {
      return errorResponse(400, "El referidor (referred_by) no está activo.");
    }

    const { data: refClient, error: refClientError } = await adminClient
      .from("clients")
      .select("status")
      .eq("id", payload.referred_by)
      .single();

    if (refClientError || !refClient) {
      return errorResponse(400, "referred_by no tiene registro en clients.");
    }
    if (refClient.status !== "active") {
      return errorResponse(400, "El referidor (referred_by) no tiene status 'active'.");
    }
  }

  let resolvedTrainerId: string | null = null;

  if (callerRole === "trainer") {
    resolvedTrainerId = callerUser.id;
  } else if (callerRole === "admin") {
    if (payload.trainer_id) {
      const { data: trainerProfile, error: trainerError } = await adminClient
        .from("profiles")
        .select("id, role, is_active")
        .eq("id", payload.trainer_id)
        .single();

      if (trainerError || !trainerProfile) {
        return errorResponse(400, "trainer_id no corresponde a un perfil existente.");
      }
      if (trainerProfile.role !== "trainer") {
        return errorResponse(400, "trainer_id debe tener rol 'trainer'.");
      }
      if (!trainerProfile.is_active) {
        return errorResponse(400, "El trainer especificado no está activo.");
      }
      resolvedTrainerId = payload.trainer_id;
    }
  }

  const tempPassword = payload.email.split("@")[0] + Math.floor(1000 + Math.random() * 9000);

  const { data: newAuthUser, error: authError } = await adminClient.auth.admin.createUser({
    email: payload.email,
    password: tempPassword,
    email_confirm: true,
    app_metadata: { role: "client" },
    user_metadata: { full_name: payload.full_name },
  });

  if (authError || !newAuthUser.user) {
    console.error("[create-client] auth.admin.createUser error:", authError);
    return errorResponse(500, "Error al crear usuario en auth.", authError?.message);
  }

  const newUserId = newAuthUser.user.id;

  const { error: profileError } = await adminClient
    .from("profiles")
    .insert({
      id: newUserId,
      role: "client",
      full_name: payload.full_name,
      email: payload.email,
      phone: payload.phone,
      birth_date: payload.birth_date,
      gender: payload.gender,
      neighborhood: payload.neighborhood,
      avatar_url: payload.avatar_url ?? null,
      is_active: true,
      password_change_required: true,
      created_by: callerUser.id,
    });

  if (profileError) {
    console.error("[create-client] profiles insert error:", profileError);
    await adminClient.auth.admin.deleteUser(newUserId);
    return errorResponse(500, "Error al crear perfil del cliente.", profileError.message);
  }

  const { error: clientError } = await adminClient
    .from("clients")
    .insert({
      id: newUserId,
      plan_id: payload.plan_id,
      status: "active",
      origin: payload.origin,
      referred_by: payload.referred_by ?? null,
      joined_at: payload.joined_at ?? new Date().toISOString().split("T")[0],
    });

  if (clientError) {
    console.error("[create-client] clients insert error:", clientError);
    await adminClient.from("profiles").delete().eq("id", newUserId);
    await adminClient.auth.admin.deleteUser(newUserId);
    return errorResponse(500, "Error al crear registro del cliente.", clientError.message);
  }

  const { error: cphError } = await adminClient
    .from("client_plan_history")
    .insert({
      client_id: newUserId,
      plan_id: payload.plan_id,
      started_at: new Date().toISOString(),
      ended_at: null,
      changed_by: callerUser.id,
      notes: "Registro inicial al crear cliente.",
    });

  if (cphError) {
    console.error("[create-client] client_plan_history insert error:", cphError);
    await adminClient.from("clients").delete().eq("id", newUserId);
    await adminClient.from("profiles").delete().eq("id", newUserId);
    await adminClient.auth.admin.deleteUser(newUserId);
    return errorResponse(500, "Error al registrar historial de plan inicial.", cphError.message);
  }

  if (resolvedTrainerId) {
    const { error: ctaError } = await adminClient
      .from("client_trainer_assignments")
      .insert({
        client_id: newUserId,
        trainer_id: resolvedTrainerId,
        started_at: new Date().toISOString(),
        ended_at: null,
        assigned_by: callerUser.id,
        notes: "Asignación inicial al crear cliente.",
      });

    if (ctaError) {
      console.error("[create-client] client_trainer_assignments insert error:", ctaError);
      await adminClient.from("client_plan_history").delete().eq("client_id", newUserId);
      await adminClient.from("clients").delete().eq("id", newUserId);
      await adminClient.from("profiles").delete().eq("id", newUserId);
      await adminClient.auth.admin.deleteUser(newUserId);
      return errorResponse(500, "Error al asignar trainer al cliente.", ctaError.message);
    }
  }

  console.log(`[create-client] Cliente creado exitosamente. user_id=${newUserId}, caller_role=${callerRole}`);

  return jsonOk({
    id: newUserId,
    email: payload.email,
    full_name: payload.full_name,
    plan_id: payload.plan_id,
    status: "active",
    origin: payload.origin,
    trainer_assigned: resolvedTrainerId !== null,
    trainer_id: resolvedTrainerId,
    temporary_password: tempPassword,
  }, 201);
});
