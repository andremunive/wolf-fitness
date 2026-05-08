import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Types ───────────────────────────────────────────────────────────────────

type SendMeasurementsPayload =
  | { mode: "single"; measurement_id: string }
  | { mode: "compare"; measurement_id_a: string; measurement_id_b: string };

interface Measurement {
  id: string;
  client_id: string;
  measured_at: string;
  weight_kg: number;
  calf_left_cm: number | null;
  calf_right_cm: number | null;
  thigh_left_cm: number | null;
  thigh_right_cm: number | null;
  hip_cm: number | null;
  abdomen_cm: number | null;
  chest_cm: number | null;
  arm_left_cm: number | null;
  arm_right_cm: number | null;
  skinfold_chest_mm: number | null;
  skinfold_axilla_mm: number | null;
  skinfold_subscapular_mm: number | null;
  skinfold_biceps_mm: number | null;
  skinfold_triceps_mm: number | null;
  skinfold_abdomen_mm: number | null;
  skinfold_suprailiac_mm: number | null;
  skinfold_thigh_mm: number | null;
  skinfold_calf_mm: number | null;
  body_fat_pct: number | null;
  notes: string | null;
}

interface ResendResponse {
  id?: string;
  name?: string;
  message?: string;
  statusCode?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = "medidas@wolffitness.co";
const LOGO_URL = "https://ndvssqfurxiuczvrjjgt.supabase.co/storage/v1/object/public/brand-assets/logo_completo.png";
const BRAND_COLOR = "#228d9f";
const FN_NAME = "send-measurements-share";

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

function jsonOk(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(data),
    { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
}

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Formatea una fecha ISO YYYY-MM-DD a formato legible: "1 de mayo de 2026" */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Formatea un valor numérico con una unidad, o devuelve el guion largo si es null */
function fmtVal(value: number | null, unit: string): string {
  if (value === null) return "—";
  return `${value} ${unit}`;
}

/** Calcula el delta entre dos valores. Devuelve string formateado o "—" si alguno es null. */
function fmtDelta(a: number | null, b: number | null, unit: string): string {
  if (a === null || b === null) return "—";
  const delta = b - a;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)} ${unit}`;
}

// ─── Metric definitions ───────────────────────────────────────────────────────

interface MetricDef {
  key: keyof Measurement;
  label: string;
  unit: string;
}

const METRICS_GENERAL: MetricDef[] = [
  { key: "weight_kg", label: "Peso", unit: "kg" },
];

const METRICS_BODY: MetricDef[] = [
  { key: "calf_left_cm", label: "Pantorrilla izq.", unit: "cm" },
  { key: "calf_right_cm", label: "Pantorrilla der.", unit: "cm" },
  { key: "thigh_left_cm", label: "Muslo izq.", unit: "cm" },
  { key: "thigh_right_cm", label: "Muslo der.", unit: "cm" },
  { key: "hip_cm", label: "Cadera", unit: "cm" },
  { key: "abdomen_cm", label: "Abdomen", unit: "cm" },
  { key: "chest_cm", label: "Pecho", unit: "cm" },
  { key: "arm_left_cm", label: "Brazo izq.", unit: "cm" },
  { key: "arm_right_cm", label: "Brazo der.", unit: "cm" },
];

const METRICS_SKINFOLD: MetricDef[] = [
  { key: "skinfold_chest_mm", label: "Pliegue pectoral", unit: "mm" },
  { key: "skinfold_axilla_mm", label: "Pliegue midaxilar", unit: "mm" },
  { key: "skinfold_subscapular_mm", label: "Pliegue subescapular", unit: "mm" },
  { key: "skinfold_biceps_mm", label: "Pliegue bicipital", unit: "mm" },
  { key: "skinfold_triceps_mm", label: "Pliegue tricipital", unit: "mm" },
  { key: "skinfold_abdomen_mm", label: "Pliegue abdominal", unit: "mm" },
  { key: "skinfold_suprailiac_mm", label: "Pliegue suprailíaco", unit: "mm" },
  { key: "skinfold_thigh_mm", label: "Pliegue cuadricipital", unit: "mm" },
  { key: "skinfold_calf_mm", label: "Pliegue pantorrilla", unit: "mm" },
  { key: "body_fat_pct", label: "% Grasa corporal", unit: "%" },
];

// ─── HTML Email Builder — Single ──────────────────────────────────────────────

function buildSingleHtml(
  clientFullName: string,
  m: Measurement,
  senderName: string
): string {
  const subject = `Wolf Fitness — Tus medidas del ${formatDate(m.measured_at)}`;

  // Build metric rows — only include rows where value is not null
  // weight_kg is always included (NOT NULL by schema)
  function metricRow(label: string, value: number | null, unit: string): string {
    if (value === null) return "";
    return `
      <tr>
        <td style="padding:7px 0;font-size:14px;color:#555555;border-bottom:1px solid #f0f0f0;">${label}</td>
        <td style="padding:7px 0;font-size:14px;color:#1a202c;text-align:right;font-weight:bold;border-bottom:1px solid #f0f0f0;">${fmtVal(value, unit)}</td>
      </tr>`;
  }

  function sectionHeader(title: string): string {
    return `
      <tr>
        <td colspan="2" style="padding:14px 0 4px 0;font-size:12px;font-weight:bold;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.05em;">${title}</td>
      </tr>`;
  }

  // General block
  const generalRows = METRICS_GENERAL.map((m_def) => metricRow(m_def.label, m[m_def.key] as number | null, m_def.unit)).join("");

  // Body block — only if at least one value is non-null
  const bodyRows = METRICS_BODY.map((m_def) => metricRow(m_def.label, m[m_def.key] as number | null, m_def.unit)).join("");
  const bodyBlock = bodyRows.trim()
    ? sectionHeader("Medidas corporales") + bodyRows
    : "";

  // Skinfold block — only if at least one value is non-null
  const skinfoldRows = METRICS_SKINFOLD.map((m_def) => metricRow(m_def.label, m[m_def.key] as number | null, m_def.unit)).join("");
  const skinfoldBlock = skinfoldRows.trim()
    ? sectionHeader("Pliegues cutáneos") + skinfoldRows
    : "";

  const notesBlock = m.notes
    ? `
          <!-- Observaciones -->
          <tr>
            <td style="padding:20px 32px 0 32px;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:bold;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.05em;">Observaciones</p>
              <p style="margin:0;font-size:14px;color:#4a5568;line-height:1.5;">${m.notes}</p>
            </td>
          </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:24px 16px;">

        <!-- Contenedor principal -->
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Header con logo -->
          <tr>
            <td align="center" style="background-color:${BRAND_COLOR};padding:28px 24px;">
              <img src="${LOGO_URL}" alt="Wolf Fitness" width="160" style="display:block;max-width:160px;height:auto;" />
            </td>
          </tr>

          <!-- Título y saludo -->
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <p style="margin:0;font-size:22px;font-weight:bold;color:#1a202c;">Tus medidas corporales</p>
              <p style="margin:8px 0 0 0;font-size:15px;color:#555555;">Hola, <strong>${clientFullName}</strong>. Aquí están las medidas registradas el <strong>${formatDate(m.measured_at)}</strong>.</p>
            </td>
          </tr>

          <!-- Separador -->
          <tr>
            <td style="padding:16px 32px 0 32px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr><td style="border-top:1px solid #e2e8f0;"></td></tr>
              </table>
            </td>
          </tr>

          <!-- Tabla de métricas -->
          <tr>
            <td style="padding:8px 32px 24px 32px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                ${sectionHeader("General")}
                ${generalRows}
                ${bodyBlock}
                ${skinfoldBlock}
              </table>
            </td>
          </tr>

          ${notesBlock}

          <!-- Footer -->
          <tr>
            <td style="background-color:#f7fafc;padding:20px 32px;border-top:1px solid #e2e8f0;margin-top:16px;">
              <p style="margin:0;font-size:13px;color:#718096;text-align:center;">
                Compartido por <strong>${senderName}</strong> · Wolf Fitness
              </p>
              <p style="margin:6px 0 0 0;font-size:12px;color:#a0aec0;text-align:center;">
                Si tienes alguna duda, contáctanos al gimnasio.
              </p>
            </td>
          </tr>

        </table>
        <!-- Fin contenedor principal -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── HTML Email Builder — Compare ─────────────────────────────────────────────

function buildCompareHtml(
  clientFullName: string,
  mA: Measurement,
  mB: Measurement,
  senderName: string
): string {
  const dateA = formatDate(mA.measured_at);
  const dateB = formatDate(mB.measured_at);
  const subject = `Wolf Fitness — Comparación de medidas: ${dateA} vs ${dateB}`;

  function compareRow(label: string, valA: number | null, valB: number | null, unit: string): string {
    // Omit row if both values are null
    if (valA === null && valB === null) return "";
    return `
      <tr>
        <td style="padding:7px 8px 7px 0;font-size:13px;color:#555555;border-bottom:1px solid #f0f0f0;">${label}</td>
        <td style="padding:7px 4px;font-size:13px;color:#1a202c;text-align:center;border-bottom:1px solid #f0f0f0;">${fmtVal(valA, unit)}</td>
        <td style="padding:7px 4px;font-size:13px;color:#1a202c;text-align:center;border-bottom:1px solid #f0f0f0;">${fmtVal(valB, unit)}</td>
        <td style="padding:7px 0 7px 4px;font-size:13px;color:#4a5568;text-align:center;border-bottom:1px solid #f0f0f0;">${fmtDelta(valA, valB, unit)}</td>
      </tr>`;
  }

  function sectionHeaderCompare(title: string): string {
    return `
      <tr>
        <td colspan="4" style="padding:14px 0 4px 0;font-size:12px;font-weight:bold;color:${BRAND_COLOR};text-transform:uppercase;letter-spacing:0.05em;">${title}</td>
      </tr>`;
  }

  // General block
  const generalRows = METRICS_GENERAL.map((m_def) =>
    compareRow(m_def.label, mA[m_def.key] as number | null, mB[m_def.key] as number | null, m_def.unit)
  ).join("");

  // Body block
  const bodyRows = METRICS_BODY.map((m_def) =>
    compareRow(m_def.label, mA[m_def.key] as number | null, mB[m_def.key] as number | null, m_def.unit)
  ).join("");
  const bodyBlock = bodyRows.trim()
    ? sectionHeaderCompare("Medidas corporales") + bodyRows
    : "";

  // Skinfold block
  const skinfoldRows = METRICS_SKINFOLD.map((m_def) =>
    compareRow(m_def.label, mA[m_def.key] as number | null, mB[m_def.key] as number | null, m_def.unit)
  ).join("");
  const skinfoldBlock = skinfoldRows.trim()
    ? sectionHeaderCompare("Pliegues cutáneos") + skinfoldRows
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:24px 16px;">

        <!-- Contenedor principal -->
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Header con logo -->
          <tr>
            <td align="center" style="background-color:${BRAND_COLOR};padding:28px 24px;">
              <img src="${LOGO_URL}" alt="Wolf Fitness" width="160" style="display:block;max-width:160px;height:auto;" />
            </td>
          </tr>

          <!-- Título y saludo -->
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <p style="margin:0;font-size:22px;font-weight:bold;color:#1a202c;">Comparación de medidas corporales</p>
              <p style="margin:8px 0 0 0;font-size:15px;color:#555555;">Hola, <strong>${clientFullName}</strong>. Aquí está la comparación de tus medidas.</p>
            </td>
          </tr>

          <!-- Separador -->
          <tr>
            <td style="padding:16px 32px 0 32px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr><td style="border-top:1px solid #e2e8f0;"></td></tr>
              </table>
            </td>
          </tr>

          <!-- Tabla comparativa -->
          <tr>
            <td style="padding:8px 32px 24px 32px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <!-- Encabezados de columna -->
                <tr>
                  <td style="padding:0 8px 10px 0;font-size:12px;font-weight:bold;color:#a0aec0;text-transform:uppercase;"></td>
                  <td style="padding:0 4px 10px 4px;font-size:11px;font-weight:bold;color:${BRAND_COLOR};text-align:center;text-transform:uppercase;">${dateA}</td>
                  <td style="padding:0 4px 10px 4px;font-size:11px;font-weight:bold;color:${BRAND_COLOR};text-align:center;text-transform:uppercase;">${dateB}</td>
                  <td style="padding:0 0 10px 4px;font-size:11px;font-weight:bold;color:#718096;text-align:center;text-transform:uppercase;">Cambio</td>
                </tr>
                ${sectionHeaderCompare("General")}
                ${generalRows}
                ${bodyBlock}
                ${skinfoldBlock}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f7fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:13px;color:#718096;text-align:center;">
                Compartido por <strong>${senderName}</strong> · Wolf Fitness
              </p>
              <p style="margin:6px 0 0 0;font-size:12px;color:#a0aec0;text-align:center;">
                Si tienes alguna duda, contáctanos al gimnasio.
              </p>
            </td>
          </tr>

        </table>
        <!-- Fin contenedor principal -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errResp(405, "METHOD_NOT_ALLOWED", "Método no permitido. Usar POST.");
  }

  // ── [A1] Verificar header Authorization ────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errResp(401, "UNAUTHORIZED_NO_AUTH_HEADER", "Token de autenticación requerido.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";

  if (!resendApiKey) {
    console.error(JSON.stringify({ fn: FN_NAME, level: "error", msg: "RESEND_API_KEY not configured" }));
    return errResp(500, "RESEND_AUTH_ERROR", "Servicio de correo no configurado. Contacta al administrador.");
  }

  // callerClient: verifica identidad del invocador con su propio JWT
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  // adminClient: corre como service_role, bypasea RLS para todas las operaciones
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── [A2] Verificar JWT del caller ──────────────────────────────────────────
  const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerUser) {
    return errResp(401, "UNAUTHORIZED_INVALID_TOKEN", "Token inválido o expirado.");
  }
  const invokerId = callerUser.id;

  // ── [A3] Obtener rol del caller ────────────────────────────────────────────
  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role, full_name")
    .eq("id", invokerId)
    .single();

  if (profileError || !callerProfile) {
    return errResp(401, "UNAUTHORIZED_INVALID_TOKEN", "No se pudo verificar la identidad del invocador.");
  }

  const callerRole: string = callerProfile.role;
  const senderName: string = callerProfile.full_name ?? "Wolf Fitness";

  // ── [A4] Verificar rol: solo admin o trainer ───────────────────────────────
  if (callerRole !== "admin" && callerRole !== "trainer") {
    console.warn(JSON.stringify({
      fn: FN_NAME, level: "warn",
      msg: "Forbidden: non-admin non-trainer caller",
      invoker_id: invokerId,
      role: callerRole,
    }));
    return errResp(403, "FORBIDDEN_ROLE", "No tienes permisos para compartir medidas.");
  }

  // ── [B1] Parse payload ─────────────────────────────────────────────────────
  let payload: SendMeasurementsPayload;
  try {
    payload = await req.json() as SendMeasurementsPayload;
  } catch {
    return errResp(400, "BAD_REQUEST_INVALID_PAYLOAD", "Payload JSON inválido.");
  }

  // ── [V1] Validar mode ──────────────────────────────────────────────────────
  if (!payload || (payload.mode !== "single" && payload.mode !== "compare")) {
    return errResp(400, "BAD_REQUEST_INVALID_PAYLOAD", "El campo 'mode' debe ser 'single' o 'compare'.");
  }

  // ── [V2/V3] Validar UUIDs según mode ──────────────────────────────────────
  if (payload.mode === "single") {
    if (!payload.measurement_id || !isValidUUID(payload.measurement_id)) {
      return errResp(400, "BAD_REQUEST_INVALID_PAYLOAD", "'measurement_id' debe ser un UUID válido.");
    }
    console.log(JSON.stringify({
      fn: FN_NAME, level: "info", msg: "Request received",
      mode: "single", invoker_id: invokerId,
      measurement_id: payload.measurement_id,
    }));
  } else {
    if (!payload.measurement_id_a || !isValidUUID(payload.measurement_id_a)) {
      return errResp(400, "BAD_REQUEST_INVALID_PAYLOAD", "'measurement_id_a' debe ser un UUID válido.");
    }
    if (!payload.measurement_id_b || !isValidUUID(payload.measurement_id_b)) {
      return errResp(400, "BAD_REQUEST_INVALID_PAYLOAD", "'measurement_id_b' debe ser un UUID válido.");
    }
    // ── [V4] IDs no pueden ser iguales ────────────────────────────────────────
    if (payload.measurement_id_a === payload.measurement_id_b) {
      return errResp(400, "BAD_REQUEST_SAME_MEASUREMENT", "Selecciona dos medidas diferentes para comparar.");
    }
    console.log(JSON.stringify({
      fn: FN_NAME, level: "info", msg: "Request received",
      mode: "compare", invoker_id: invokerId,
      measurement_id_a: payload.measurement_id_a,
      measurement_id_b: payload.measurement_id_b,
    }));
  }

  // ── [B1] Lookup de medida(s) en BD ─────────────────────────────────────────
  const MEASUREMENT_COLUMNS = [
    "id", "client_id", "measured_at", "weight_kg",
    "calf_left_cm", "calf_right_cm", "thigh_left_cm", "thigh_right_cm",
    "hip_cm", "abdomen_cm", "chest_cm", "arm_left_cm", "arm_right_cm",
    "skinfold_chest_mm", "skinfold_axilla_mm", "skinfold_subscapular_mm",
    "skinfold_biceps_mm", "skinfold_triceps_mm", "skinfold_abdomen_mm",
    "skinfold_suprailiac_mm", "skinfold_thigh_mm", "skinfold_calf_mm",
    "body_fat_pct", "notes",
  ].join(", ");

  let measurementA: Measurement;
  let measurementB: Measurement | null = null;
  let clientId: string;

  if (payload.mode === "single") {
    const { data: mData, error: mError } = await adminClient
      .from("client_measurements")
      .select(MEASUREMENT_COLUMNS)
      .eq("id", payload.measurement_id)
      .single();

    if (mError || !mData) {
      return errResp(404, "MEASUREMENT_NOT_FOUND", "La medida no existe.", {});
    }
    measurementA = mData as Measurement;
    clientId = measurementA.client_id;

  } else {
    // Compare: fetch both measurements in one query using IN
    const { data: mDataArr, error: mError } = await adminClient
      .from("client_measurements")
      .select(MEASUREMENT_COLUMNS)
      .in("id", [payload.measurement_id_a, payload.measurement_id_b]);

    if (mError) {
      console.error(JSON.stringify({ fn: FN_NAME, level: "error", msg: "DB error fetching measurements", error: mError }));
      return errResp(500, "INTERNAL_ERROR", "Error interno al consultar las medidas.");
    }

    const foundA = (mDataArr ?? []).find((r: Measurement) => r.id === payload.measurement_id_a);
    const foundB = (mDataArr ?? []).find((r: Measurement) => r.id === payload.measurement_id_b);

    if (!foundA || !foundB) {
      const missingId = !foundA ? payload.measurement_id_a : payload.measurement_id_b;
      return errResp(404, "MEASUREMENT_NOT_FOUND", "Una o ambas medidas no existen.", { missing_id: missingId });
    }

    // ── [V6] Validar que ambas medidas pertenecen al mismo cliente ────────────
    if (foundA.client_id !== foundB.client_id) {
      console.warn(JSON.stringify({
        fn: FN_NAME, level: "warn",
        msg: "Client mismatch between measurements",
        measurement_id_a: payload.measurement_id_a,
        client_id_a: foundA.client_id,
        measurement_id_b: payload.measurement_id_b,
        client_id_b: foundB.client_id,
      }));
      return errResp(400, "BAD_REQUEST_CLIENT_MISMATCH", "Las medidas seleccionadas pertenecen a clientes distintos.", {
        measurement_id_a: payload.measurement_id_a,
        client_id_a: foundA.client_id,
        measurement_id_b: payload.measurement_id_b,
        client_id_b: foundB.client_id,
      });
    }

    measurementA = foundA as Measurement;
    measurementB = foundB as Measurement;
    clientId = measurementA.client_id;
  }

  // ── [A5/A6] Verificar asignación activa si es trainer ─────────────────────
  if (callerRole === "trainer") {
    const { data: assignData, error: assignError } = await adminClient
      .from("client_trainer_assignments")
      .select("id")
      .eq("trainer_id", invokerId)
      .eq("client_id", clientId)
      .is("ended_at", null)
      .limit(1)
      .single();

    if (assignError || !assignData) {
      console.warn(JSON.stringify({
        fn: FN_NAME, level: "warn",
        msg: "Forbidden: trainer not assigned to client",
        invoker_id: invokerId,
        client_id: clientId,
      }));
      return errResp(403, "FORBIDDEN_NOT_ASSIGNED", "No tienes acceso a las medidas de este cliente.");
    }
  }

  // ── [C1] Obtener perfil del cliente ────────────────────────────────────────
  const { data: clientProfile, error: clientProfileError } = await adminClient
    .from("profiles")
    .select("email, full_name")
    .eq("id", clientId)
    .single();

  if (clientProfileError || !clientProfile) {
    console.error(JSON.stringify({
      fn: FN_NAME, level: "error",
      msg: "Client profile not found — data inconsistency",
      client_id: clientId,
    }));
    return errResp(500, "CLIENT_PROFILE_NOT_FOUND", "Error de datos. Contacta al administrador.");
  }

  const clientEmail: string = clientProfile.email;
  const clientFullName: string = clientProfile.full_name;

  // ── [D] Construir HTML y subject ──────────────────────────────────────────
  let emailHtml: string;
  let subject: string;
  const mode = payload.mode;

  if (mode === "single") {
    const dateFormatted = formatDate(measurementA.measured_at);
    subject = `Wolf Fitness — Tus medidas del ${dateFormatted}`;
    emailHtml = buildSingleHtml(clientFullName, measurementA, senderName);
  } else {
    const dateA = formatDate(measurementA.measured_at);
    const dateB = formatDate(measurementB!.measured_at);
    subject = `Wolf Fitness — Comparación de medidas: ${dateA} vs ${dateB}`;
    emailHtml = buildCompareHtml(clientFullName, measurementA, measurementB!, senderName);
  }

  // ── [E] Envío a Resend ─────────────────────────────────────────────────────
  const logBase = {
    fn: FN_NAME, mode,
    to: clientEmail,
    client_id: clientId,
    ...(mode === "single"
      ? { measurement_id: measurementA.id }
      : { measurement_id_a: measurementA.id, measurement_id_b: measurementB!.id }),
  };

  console.log(JSON.stringify({ ...logBase, level: "info", msg: "Sending email via Resend" }));

  try {
    const resendRes = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [clientEmail],
        subject,
        html: emailHtml,
      }),
    });

    const resendBody = await resendRes.json() as ResendResponse;

    // Detect rate limit
    if (resendRes.status === 429 || resendBody.statusCode === 429) {
      console.warn(JSON.stringify({ ...logBase, level: "warn", msg: "Resend rate limit hit" }));
      return errResp(429, "RESEND_RATE_LIMIT", "Demasiados envíos en poco tiempo. Espera un momento e intenta de nuevo.", {
        ...logBase,
      });
    }

    if (resendRes.ok && resendBody.id) {
      const resendId = resendBody.id;
      console.log(JSON.stringify({
        fn: FN_NAME, level: "info", msg: "Resend success",
        mode, resend_id: resendId, client_id: clientId,
      }));
      console.log(JSON.stringify({
        fn: FN_NAME, level: "info", msg: "Email sent successfully",
        mode, resend_id: resendId,
        invoker_id: invokerId,
        client_id: clientId,
      }));
      return jsonOk({ status: "sent", resend_id: resendId });
    }

    // Non-ok response from Resend
    const resendErrorMsg = resendBody.message ?? `HTTP ${resendRes.status}: ${resendBody.name ?? "Unknown error"}`;
    console.error(JSON.stringify({
      ...logBase, level: "error",
      msg: "Resend error response",
      error: resendErrorMsg,
    }));
    return errResp(502, "RESEND_ERROR", resendErrorMsg, { ...logBase });

  } catch (fetchErr) {
    const resendErrorMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error(JSON.stringify({
      fn: FN_NAME, level: "error", msg: "Resend fetch failed",
      mode, client_id: clientId, error: resendErrorMsg,
    }));
    return errResp(502, "RESEND_ERROR", "Error al conectar con el servicio de correo.", {});
  }
});
