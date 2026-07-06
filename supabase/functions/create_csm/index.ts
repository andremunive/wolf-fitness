import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CreateCsmPayload {
  full_name: string;
  email: string;
  phone?: string;
}

interface JsonError {
  error: string;
  details?: unknown;
}

// ─── CORS ────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jsonError(message: string, status: number, details?: unknown): Response {
  const body: JsonError = { error: message };
  if (details !== undefined) body.details = details;
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

function generateTemporaryPassword(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => alphabet[b % alphabet.length])
    .join("");
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonError("Método no permitido. Usa POST.", 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError("Authorization header requerido", 401);
  }
  const callerToken = authHeader.slice(7);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ── [A1] Verificar JWT del caller ─────────────────────────────────────────
  const { data: { user: callerUser }, error: userErr } = await adminClient.auth.getUser(callerToken);
  if (userErr || !callerUser) {
    return jsonError("Token inválido o expirado", 401);
  }

  // ── [A2] Verificar rol del caller (debe ser admin) ────────────────────────
  // El rol que las RLS policies leen vive en `app_metadata`
  // (auth.jwt() -> 'app_metadata' ->> 'role'). `user_metadata` es editable
  // por el propio usuario y NO debe usarse para autorización.
  const callerAppRole = callerUser.app_metadata?.role as string | undefined;
  if (callerAppRole !== "admin") {
    // Doble check: también verificamos en profiles por consistencia
    const { data: callerProfile, error: profileErr } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", callerUser.id)
      .single();

    if (profileErr || !callerProfile || callerProfile.role !== "admin") {
      console.warn(`create_csm: acceso denegado — caller ${callerUser.id} no es admin`);
      return jsonError("Solo admins pueden crear CSMs", 403);
    }
  }

  const adminUid = callerUser.id;

  // ── [B] Parse y validar payload ───────────────────────────────────────────
  let payload: Partial<CreateCsmPayload>;
  try {
    payload = await req.json();
  } catch {
    return jsonError("Payload JSON inválido", 400);
  }

  if (!payload.full_name || String(payload.full_name).trim() === "") {
    return jsonError("Campo requerido ausente: full_name", 400);
  }
  if (!payload.email || String(payload.email).trim() === "") {
    return jsonError("Campo requerido ausente: email", 400);
  }

  const fullName = String(payload.full_name).trim();
  const email = String(payload.email).trim().toLowerCase();
  const phone = payload.phone ? String(payload.phone).trim() : null;

  // ── [C] Generar contraseña temporal ──────────────────────────────────────
  const temporaryPassword = generateTemporaryPassword();

  // ── [D] Crear usuario en auth con role=csm en app_metadata ───────────────
  const { data: newUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    app_metadata: {
      role: "csm",
    },
    user_metadata: {
      full_name: fullName,
    },
  });

  if (createUserError || !newUser?.user) {
    console.error(`create_csm: error creando auth user — ${createUserError?.message}`);
    return jsonError(
      "Error al crear el usuario de autenticación",
      422,
      createUserError?.message
    );
  }

  const csmUid = newUser.user.id;

  // ── [E] INSERT INTO profiles ──────────────────────────────────────────────
  const { error: profileError } = await adminClient
    .from("profiles")
    .insert({
      id: csmUid,
      role: "csm",
      full_name: fullName,
      email,
      phone,
      is_active: true,
      password_change_required: true,
      created_by: adminUid,
    });

  if (profileError) {
    console.error(`create_csm: error insertando profiles — ${profileError.message}`);
    // Rollback: eliminar el usuario de auth
    const { error: rollbackErr } = await adminClient.auth.admin.deleteUser(csmUid);
    if (rollbackErr) {
      console.error(`create_csm: rollback auth.deleteUser falló — ${rollbackErr.message}`);
    }
    return jsonError(
      "Error al guardar el perfil del CSM. Se revirtió la operación.",
      500,
      profileError.message
    );
  }

  // ── [F] Garantizar sincronización de app_metadata ────────────────────────
  // Se llama updateUserById para asegurar que app_metadata.role quede
  // correctamente establecido (sincronización explícita, ver memoria del proyecto).
  const { error: updateMetaError } = await adminClient.auth.admin.updateUserById(csmUid, {
    app_metadata: { role: "csm" },
  });

  if (updateMetaError) {
    // No es bloqueante: el usuario ya fue creado con el role correcto en createUser.
    // Solo se loguea como advertencia.
    console.warn(`create_csm: updateUserById app_metadata warning — ${updateMetaError.message}`);
  }

  console.log(`create_csm: CSM creado exitosamente uid=${csmUid} por admin=${adminUid}`);

  return jsonOk(
    {
      id: csmUid,
      email,
      full_name: fullName,
      role: "csm",
    },
    200
  );
});
