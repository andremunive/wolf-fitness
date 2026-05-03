import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SendReceiptPayload {
  payment_id: string;
  force_resend?: boolean;
}

interface PaymentData {
  id: string;
  amount_received_cop: number;
  plan_total_cop: number;
  balance_cop: number;
  period_start: string;
  period_end: string;
  reported_date: string;
  reception_date: string;
  status: string;
  payment_method: string | null;
  discount_amount_cop: number;
  discount_percentage_applied: number | null;
  notes: string | null;
}

interface ClaimSuccessResult {
  already_sent: false;
  claimed: true;
  current_attempts: number;
  client_email: string;
  client_full_name: string;
  payment_data: PaymentData;
}

interface ClaimAlreadySentResult {
  already_sent: true;
  claimed: false;
}

type ClaimResult = ClaimSuccessResult | ClaimAlreadySentResult;

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
const FROM_EMAIL = "pagos@wolffitness.co";
const SUBJECT = "Recibo de pago — Wolf Fitness";
const LOGO_URL = "https://ndvssqfurxiuczvrjjgt.supabase.co/storage/v1/object/public/brand-assets/logo_completo.png";
const BRAND_COLOR = "#228d9f";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errResp(status: number, code: string, message: string, details: Record<string, unknown> = {}): Response {
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

/** Valida que un string sea un UUID v4 válido */
function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Formatea un número como moneda COP: 200000 → "$ 200.000" */
function formatCOP(amount: number): string {
  return "$ " + amount.toLocaleString("es-CO", { maximumFractionDigits: 0 });
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

/** Traduce el método de pago al español */
function translatePaymentMethod(method: string | null): string {
  const map: Record<string, string> = {
    cash: "Efectivo",
    transfer: "Transferencia bancaria",
    nequi: "Nequi",
    other: "Otro",
  };
  return method ? (map[method] ?? method) : "—";
}

// ─── HTML Email Builder ───────────────────────────────────────────────────────

function buildReceiptHtml(
  clientFullName: string,
  p: PaymentData
): string {
  const hasDiscount = p.discount_amount_cop > 0;
  const discountRow = hasDiscount
    ? `<tr>
        <td style="padding:6px 0;font-size:14px;color:#555555;">Descuento aplicado</td>
        <td style="padding:6px 0;font-size:14px;color:#e53e3e;text-align:right;">
          - ${formatCOP(p.discount_amount_cop)}
          ${p.discount_percentage_applied != null ? ` (${p.discount_percentage_applied}%)` : ""}
        </td>
       </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${SUBJECT}</title>
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

          <!-- Título -->
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <p style="margin:0;font-size:22px;font-weight:bold;color:#1a202c;">Recibo de pago</p>
              <p style="margin:8px 0 0 0;font-size:15px;color:#555555;">Hola, <strong>${clientFullName}</strong>. Aquí está el comprobante de tu pago.</p>
            </td>
          </tr>

          <!-- Separador -->
          <tr>
            <td style="padding:16px 32px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr><td style="border-top:1px solid #e2e8f0;"></td></tr>
              </table>
            </td>
          </tr>

          <!-- Detalle del pago -->
          <tr>
            <td style="padding:0 32px 24px 32px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">

                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#555555;">Fecha de recepción</td>
                  <td style="padding:6px 0;font-size:14px;color:#1a202c;text-align:right;font-weight:bold;">${formatDate(p.reception_date)}</td>
                </tr>

                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#555555;">Período cubierto</td>
                  <td style="padding:6px 0;font-size:14px;color:#1a202c;text-align:right;font-weight:bold;">${formatDate(p.period_start)} — ${formatDate(p.period_end)}</td>
                </tr>

                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#555555;">Método de pago</td>
                  <td style="padding:6px 0;font-size:14px;color:#1a202c;text-align:right;font-weight:bold;">${translatePaymentMethod(p.payment_method)}</td>
                </tr>

                <!-- Separador interno -->
                <tr>
                  <td colspan="2" style="padding:10px 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr><td style="border-top:1px dashed #e2e8f0;"></td></tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#555555;">Valor del plan</td>
                  <td style="padding:6px 0;font-size:14px;color:#1a202c;text-align:right;">${formatCOP(p.plan_total_cop)}</td>
                </tr>

                ${discountRow}

                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#555555;">Valor pagado</td>
                  <td style="padding:6px 0;font-size:14px;color:#1a202c;text-align:right;font-weight:bold;">${formatCOP(p.amount_received_cop)}</td>
                </tr>

                ${p.balance_cop > 0 ? `
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:#555555;">Saldo pendiente</td>
                  <td style="padding:6px 0;font-size:14px;color:#e53e3e;text-align:right;font-weight:bold;">${formatCOP(p.balance_cop)}</td>
                </tr>` : ""}

                <!-- Separador -->
                <tr>
                  <td colspan="2" style="padding:10px 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr><td style="border-top:1px solid #e2e8f0;"></td></tr>
                    </table>
                  </td>
                </tr>

                <!-- ID interno -->
                <tr>
                  <td style="padding:6px 0;font-size:12px;color:#a0aec0;">ID del pago</td>
                  <td style="padding:6px 0;font-size:12px;color:#a0aec0;text-align:right;">${p.id}</td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f7fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:13px;color:#718096;text-align:center;">
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return errResp(401, "UNAUTHORIZED", "Token de autenticación requerido.");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";

  if (!resendApiKey) {
    console.error(JSON.stringify({ fn: "send-payment-receipt", level: "error", msg: "RESEND_API_KEY not configured" }));
    return errResp(500, "INTERNAL_ERROR", "Servicio de correo no configurado.");
  }

  // callerClient: verifica identidad del invocador con su propio JWT
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  // adminClient: corre como service_role, bypasea RLS para todas las operaciones
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── [A1] Verificar JWT del caller ──────────────────────────────────────────
  const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerUser) {
    return errResp(401, "UNAUTHORIZED", "Token inválido o expirado.");
  }
  const invokerId = callerUser.id;

  // ── [A2] Verificar rol: solo admin ─────────────────────────────────────────
  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", invokerId)
    .single();
  if (profileError || !callerProfile) {
    return errResp(401, "UNAUTHORIZED", "No se pudo verificar la identidad del invocador.");
  }
  if (callerProfile.role !== "admin") {
    console.warn(JSON.stringify({ fn: "send-payment-receipt", level: "warn", msg: "Forbidden: non-admin caller", invoker_id: invokerId, role: callerProfile.role }));
    return errResp(403, "FORBIDDEN", "Solo el admin puede enviar recibos de pago.");
  }

  // ── [B1] Parse payload ─────────────────────────────────────────────────────
  let payload: SendReceiptPayload;
  try {
    payload = await req.json() as SendReceiptPayload;
  } catch {
    return errResp(400, "BAD_REQUEST", "Payload JSON inválido.");
  }

  const { payment_id, force_resend = false } = payload;

  if (!payment_id) {
    return errResp(400, "BAD_REQUEST", "payment_id es obligatorio.");
  }
  if (!isValidUUID(payment_id)) {
    return errResp(400, "BAD_REQUEST", "payment_id debe ser un UUID válido.");
  }

  console.log(JSON.stringify({ fn: "send-payment-receipt", level: "info", msg: "Request received", payment_id, force_resend, invoker_id: invokerId }));

  // ── [C1] Llamar RPC claim_receipt_send ─────────────────────────────────────
  const { data: claimData, error: claimError } = await adminClient
    .rpc("claim_receipt_send", {
      p_payment_id: payment_id,
      p_force_resend: force_resend,
    });

  if (claimError) {
    const code = (claimError as { code?: string }).code ?? "";
    const message = claimError.message ?? "";

    // Lock en uso por otro proceso concurrente
    if (code === "55P03") {
      console.warn(JSON.stringify({ fn: "send-payment-receipt", level: "warn", msg: "Lock contention", payment_id }));
      return errResp(409, "LOCK_CONTENTION", "Otro proceso está procesando este pago. Intenta de nuevo en unos segundos.");
    }

    // Pago no encontrado o no está en status 'paid'
    if (code === "P0002" && message.includes("payment_not_found_or_not_paid")) {
      console.warn(JSON.stringify({ fn: "send-payment-receipt", level: "warn", msg: "Payment not found or not paid", payment_id }));
      return errResp(404, "PAYMENT_NOT_FOUND_OR_NOT_PAID", "El pago no existe o no tiene status 'paid'.");
    }

    // Perfil de cliente no encontrado (inconsistencia de datos)
    if (code === "P0002" && message.includes("client_profile_not_found")) {
      console.error(JSON.stringify({ fn: "send-payment-receipt", level: "error", msg: "Client profile not found — data inconsistency", payment_id }));
      return errResp(500, "CLIENT_PROFILE_NOT_FOUND", "No se encontró el perfil del cliente. Inconsistencia de datos.");
    }

    // Error genérico de RPC
    console.error(JSON.stringify({ fn: "send-payment-receipt", level: "error", msg: "RPC error", payment_id, error: claimError }));
    return errResp(500, "INTERNAL_ERROR", "Error interno al procesar el pago.");
  }

  const claim = claimData as ClaimResult;

  // ── [C2] Pago ya enviado sin force_resend ──────────────────────────────────
  if (claim.already_sent && !claim.claimed) {
    console.log(JSON.stringify({ fn: "send-payment-receipt", level: "info", msg: "Already sent, skipping", payment_id }));
    return jsonOk({ status: "already_sent" });
  }

  // ── [D] Envío a Resend ─────────────────────────────────────────────────────
  const successClaim = claim as ClaimSuccessResult;
  const { client_email, client_full_name, payment_data, current_attempts } = successClaim;

  console.log(JSON.stringify({
    fn: "send-payment-receipt",
    level: "info",
    msg: "Sending email via Resend",
    payment_id,
    to: client_email,
    attempt: current_attempts + 1,
  }));

  const emailHtml = buildReceiptHtml(client_full_name, payment_data);

  let resendOk = false;
  let resendEmailId: string | null = null;
  let resendErrorMsg: string | null = null;

  try {
    const resendRes = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [client_email],
        subject: SUBJECT,
        html: emailHtml,
      }),
    });

    const resendBody = await resendRes.json() as ResendResponse;

    if (resendRes.ok && resendBody.id) {
      resendOk = true;
      resendEmailId = resendBody.id;
      console.log(JSON.stringify({ fn: "send-payment-receipt", level: "info", msg: "Resend success", payment_id, resend_id: resendEmailId }));
    } else {
      resendErrorMsg = resendBody.message ?? `HTTP ${resendRes.status}: ${resendBody.name ?? "Unknown error"}`;
      console.error(JSON.stringify({ fn: "send-payment-receipt", level: "error", msg: "Resend error response", payment_id, error: resendErrorMsg }));
    }
  } catch (fetchErr) {
    resendErrorMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error(JSON.stringify({ fn: "send-payment-receipt", level: "error", msg: "Resend fetch failed", payment_id, error: resendErrorMsg }));
  }

  // ── [E] UPDATE en payments según resultado ─────────────────────────────────
  if (resendOk) {
    const { error: updateError } = await adminClient
      .from("payments")
      .update({
        receipt_sent_at: new Date().toISOString(),
        receipt_email_id: resendEmailId,
        receipt_send_attempts: current_attempts + 1,
        receipt_last_error: null,
      })
      .eq("id", payment_id);

    if (updateError) {
      // El correo llegó pero la BD no quedó actualizada. Loguear para revisión manual.
      console.error(JSON.stringify({
        fn: "send-payment-receipt",
        level: "error",
        msg: "Email sent but DB update failed — manual reconciliation needed",
        payment_id,
        resend_id: resendEmailId,
        db_error: updateError,
      }));
      // Aun así respondemos éxito al frontend ya que el correo fue entregado.
      return jsonOk({ status: "sent", receipt_email_id: resendEmailId, warning: "DB update failed, manual reconciliation required" });
    }

    console.log(JSON.stringify({ fn: "send-payment-receipt", level: "info", msg: "DB updated after success", payment_id, resend_id: resendEmailId }));
    return jsonOk({ status: "sent", receipt_email_id: resendEmailId });

  } else {
    // Registrar el fallo en BD (sin tocar receipt_sent_at)
    const { error: updateError } = await adminClient
      .from("payments")
      .update({
        receipt_send_attempts: current_attempts + 1,
        receipt_last_error: resendErrorMsg,
      })
      .eq("id", payment_id);

    if (updateError) {
      console.error(JSON.stringify({ fn: "send-payment-receipt", level: "error", msg: "Failed to record error in DB", payment_id, db_error: updateError }));
    }

    return errResp(502, "RESEND_ERROR", resendErrorMsg ?? "Error desconocido al enviar el correo.", { payment_id, current_attempts: current_attempts + 1 });
  }
});
