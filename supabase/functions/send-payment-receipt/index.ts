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
const STORAGE_BASE_URL = "https://ndvssqfurxiuczvrjjgt.supabase.co/storage/v1/object/public/brand-assets";
const KETTLEBELL_URL = `${STORAGE_BASE_URL}/logo_sin_nombre.png`;
const WORDMARK_URL = `${STORAGE_BASE_URL}/name.png`;
const BRAND_COLOR = "#228d9f";
const DARK_BG = "#0B0B0F";
const DARK_BG_OUTER = "#1a1a1f";
const LIGHT_BG = "#F7F7F5";
const CARD_BORDER = "#E6E6E2";
const DASHED_BORDER = "#D8D8D2";
const CONTACT_EMAIL = "wolffitnessgimnasio@gmail.com";
const CONTACT_PHONE_DISPLAY = "+57 318 936 7287";
const CONTACT_PHONE_WHATSAPP = "573189367287";

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

/** Formato corto tipo "03·05·26" usado en la etiqueta del header del recibo */
function formatDateShort(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}·${month}·${year.slice(-2)}`;
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

/** Toma el primer nombre del nombre completo para el saludo */
function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  const space = trimmed.indexOf(" ");
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

/** Genera un identificador legible del recibo a partir del UUID del pago */
function receiptNumber(paymentId: string): string {
  return paymentId.replace(/-/g, "").slice(-6).toUpperCase();
}

/** Deriva la etiqueta del plan a partir del valor total (mapeo conocido del negocio) */
function derivePlanLabel(planTotalCop: number): string {
  if (planTotalCop === 200000) return "Plan 6 días / semana";
  if (planTotalCop === 150000) return "Plan 3 días / semana";
  return "Mensualidad";
}

/** Escapa texto que se inserta en el HTML para evitar romper el markup */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── HTML Email Builder ───────────────────────────────────────────────────────

function buildReceiptHtml(
  clientFullName: string,
  p: PaymentData
): string {
  const safeName = escapeHtml(firstName(clientFullName));
  const planLabel = escapeHtml(derivePlanLabel(p.plan_total_cop));
  const periodStart = formatDate(p.period_start);
  const periodEnd = formatDate(p.period_end);
  const receptionDate = formatDate(p.reception_date);
  const receptionDateShort = formatDateShort(p.reception_date);
  const receiptNo = receiptNumber(p.id);
  const amountReceived = formatCOP(p.amount_received_cop);
  const planTotal = formatCOP(p.plan_total_cop);
  const balance = formatCOP(p.balance_cop);
  const method = escapeHtml(translatePaymentMethod(p.payment_method));
  const year = new Date().getFullYear();

  const discountRow = p.discount_amount_cop > 0
    ? `<tr>
                      <td align="left" style="padding:10px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#6a6a72;">Descuento aplicado</td>
                      <td align="right" style="padding:10px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#c53030;">
                        - ${formatCOP(p.discount_amount_cop)}${p.discount_percentage_applied != null ? ` (${p.discount_percentage_applied}%)` : ""}
                      </td>
                    </tr>`
    : "";

  const balanceRow = p.balance_cop > 0
    ? `<tr>
                      <td align="left" style="padding:10px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#6a6a72;">Saldo pendiente</td>
                      <td align="right" style="padding:10px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:#c53030;">${balance}</td>
                    </tr>`
    : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${SUBJECT}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${DARK_BG_OUTER};font-family:Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!-- Preheader (oculto, aparece como preview en bandeja) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${DARK_BG_OUTER};">
  Pago recibido — ${amountReceived}. Tu mensualidad en Wolf Fitness está activa hasta ${periodEnd}.
</div>

<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:${DARK_BG_OUTER};">
  <tr>
    <td align="center" style="padding:24px 12px;">

      <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" style="width:600px;max-width:600px;background-color:${LIGHT_BG};">

        <!-- HEADER OSCURO + LOGO -->
        <tr>
          <td align="center" bgcolor="${DARK_BG}" style="background-color:${DARK_BG};padding:28px 36px 36px 36px;">

            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="left" style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:3px;color:${BRAND_COLOR};font-weight:bold;">
                  RECIBO &middot; #${receiptNo}
                </td>
                <td align="right" style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:3px;color:${BRAND_COLOR};font-weight:bold;">
                  ${receptionDateShort}
                </td>
              </tr>
            </table>

            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:18px;">
              <tr>
                <td align="center" style="padding-top:18px;">
                  <img src="${KETTLEBELL_URL}" width="180" height="180" alt="Wolf Fitness" style="display:block;border:0;outline:none;text-decoration:none;width:180px;max-width:180px;height:auto;" />
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-top:18px;">
                  <img src="${WORDMARK_URL}" width="260" height="auto" alt="WOLF FITNESS" style="display:block;border:0;outline:none;text-decoration:none;width:260px;max-width:260px;height:auto;" />
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-top:18px;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:6px;color:#888888;text-transform:uppercase;">
                  Unleash &middot; Train &middot; Repeat
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- BANDA DE CONFIRMACIÓN TURQUESA -->
        <tr>
          <td bgcolor="${BRAND_COLOR}" style="background-color:${BRAND_COLOR};padding:20px 36px;">
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td width="56" valign="middle" style="width:56px;">
                  <table role="presentation" width="44" height="44" border="0" cellspacing="0" cellpadding="0" style="background-color:${LIGHT_BG};border-radius:22px;">
                    <tr>
                      <td align="center" valign="middle" height="44" style="height:44px;font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:bold;color:${DARK_BG};line-height:44px;">
                        &#10004;
                      </td>
                    </tr>
                  </table>
                </td>
                <td valign="middle" style="padding-left:16px;">
                  <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:3px;color:${DARK_BG};font-weight:bold;text-transform:uppercase;">
                    Pago confirmado
                  </div>
                  <div style="font-family:Impact,'Arial Black',Helvetica,sans-serif;font-size:32px;line-height:34px;color:${DARK_BG};letter-spacing:1px;margin-top:4px;text-transform:uppercase;">
                    ${amountReceived}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- SALUDO -->
        <tr>
          <td bgcolor="${LIGHT_BG}" style="background-color:${LIGHT_BG};padding:36px 36px 0 36px;">
            <h1 style="margin:0;font-family:Impact,'Arial Black',Helvetica,sans-serif;font-weight:normal;font-size:36px;line-height:38px;letter-spacing:1px;color:${DARK_BG};text-transform:uppercase;">
              ¡A entrenar, ${safeName}!
            </h1>
            <p style="margin:14px 0 28px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#3a3a42;">
              Tu mensualidad quedó registrada. Aquí tienes el comprobante oficial — te recomendamos guardarlo.
            </p>
          </td>
        </tr>

        <!-- CARD DETALLE DEL PLAN -->
        <tr>
          <td bgcolor="${LIGHT_BG}" style="background-color:${LIGHT_BG};padding:0 36px;">
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#FFFFFF;border:1px solid ${CARD_BORDER};border-radius:14px;">

              <tr>
                <td style="padding:24px 24px 18px 24px;border-bottom:2px solid ${DARK_BG};">
                  <div style="font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:3px;color:${BRAND_COLOR};font-weight:bold;text-transform:uppercase;">
                    Plan activo
                  </div>
                  <div style="font-family:Impact,'Arial Black',Helvetica,sans-serif;font-size:22px;line-height:24px;letter-spacing:1px;color:${DARK_BG};margin-top:4px;text-transform:uppercase;">
                    ${planLabel}
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding:20px 24px;border-bottom:1px dashed ${DASHED_BORDER};">
                  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="left" valign="middle" width="45%" style="width:45%;">
                        <div style="font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:3px;color:#7a7a82;font-weight:bold;text-transform:uppercase;">
                          Desde
                        </div>
                        <div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;color:${DARK_BG};margin-top:4px;">
                          ${periodStart}
                        </div>
                      </td>
                      <td align="center" valign="middle" width="10%" style="width:10%;font-family:Helvetica,Arial,sans-serif;font-size:22px;color:${BRAND_COLOR};font-weight:bold;">
                        &rarr;
                      </td>
                      <td align="right" valign="middle" width="45%" style="width:45%;">
                        <div style="font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:3px;color:#7a7a82;font-weight:bold;text-transform:uppercase;">
                          Hasta
                        </div>
                        <div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;color:${DARK_BG};margin-top:4px;">
                          ${periodEnd}
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td style="padding:8px 24px 4px 24px;">
                  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="left" style="padding:10px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#6a6a72;">Fecha de recepción</td>
                      <td align="right" style="padding:10px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${DARK_BG_OUTER};">${receptionDate}</td>
                    </tr>
                    <tr>
                      <td align="left" style="padding:10px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#6a6a72;">Método</td>
                      <td align="right" style="padding:10px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${DARK_BG_OUTER};">${method}</td>
                    </tr>
                    <tr>
                      <td align="left" style="padding:10px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#6a6a72;">Valor del plan</td>
                      <td align="right" style="padding:10px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${DARK_BG_OUTER};">${planTotal}</td>
                    </tr>
                    ${discountRow}
                    <tr>
                      <td align="left" style="padding:10px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#6a6a72;">Valor pagado</td>
                      <td align="right" style="padding:10px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:${DARK_BG};">${amountReceived}</td>
                    </tr>
                    ${balanceRow}
                  </table>
                </td>
              </tr>

              <tr>
                <td style="padding:0 24px 24px 24px;">
                  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#F4F4F0;border-radius:8px;">
                    <tr>
                      <td style="padding:10px 12px;font-family:'Courier New',Courier,monospace;font-size:11px;color:#5a5a62;word-break:break-all;">
                        <span style="color:${BRAND_COLOR};font-weight:bold;letter-spacing:2px;">ID&nbsp;</span>${p.id}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- QUOTE / mensaje motivacional -->
        <tr>
          <td bgcolor="${LIGHT_BG}" style="background-color:${LIGHT_BG};padding:28px 36px 32px 36px;">
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#FFFFFF;border:1px solid ${CARD_BORDER};border-radius:10px;">
              <tr>
                <td width="6" bgcolor="${BRAND_COLOR}" style="background-color:${BRAND_COLOR};width:6px;border-top-left-radius:10px;border-bottom-left-radius:10px;">&nbsp;</td>
                <td style="padding:16px 18px;">
                  <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:15px;line-height:22px;color:${DARK_BG_OUTER};">
                    "Cada repetición cuenta. Cada mes también."
                  </div>
                  <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:1px;color:#7a7a82;margin-top:6px;">
                    — Equipo Wolf Fitness
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER NEGRO -->
        <tr>
          <td bgcolor="${DARK_BG}" style="background-color:${DARK_BG};padding:30px 36px;">
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#cccccc;padding-bottom:16px;">
                  ¿Dudas con tu pago o tu plan?<br />
                  Escríbenos a
                  <a href="mailto:${CONTACT_EMAIL}" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">${CONTACT_EMAIL}</a>
                  o por WhatsApp al
                  <a href="https://wa.me/${CONTACT_PHONE_WHATSAPP}" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">${CONTACT_PHONE_DISPLAY}</a>.
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #2a2a30;padding-top:14px;font-family:'Courier New',Courier,monospace;font-size:11px;line-height:18px;color:#666666;">
                  Wolf Fitness<br />
                  © ${year} &middot; Este es un comprobante automático, no respondas a este correo.
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>

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
