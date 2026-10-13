// Nova Negocio · función "cobro-terminal" (Supabase Edge Function).
//
// 1) Alta de vendedores (acción "alta"): la ÚNICA forma de crear una cuenta. Valida
//    el código de invitación (un solo uso), crea la cuenta y la liga al teléfono.
//    Con esto el registro abierto de Supabase se deja apagado.
// 2) Cobro en terminal: guarda la clave (Access Token) de Mercado Pago del lado
//    del servidor para que los teléfonos de los vendedores cobren SIN conocerla.
// Solo permite: crear un cobro en TU terminal, consultarlo, cancelarlo antes de
// que se pague y leer los datos de la tarjeta para el comprobante. No permite
// devoluciones ni ver otros datos de tu cuenta.
// 2.0.3: si la terminal está en modo normal (no Punto de Venta) no se le pueden
// mandar cobros; el vendedor cobra directo en la terminal y aquí se busca ese pago
// (aprobado, de terminal, por el monto exacto y sin usar) para ligarlo a la venta.
//
// Configuración (una sola vez, en el panel de Supabase):
//   1. Edge Functions → Deploy a new function → Via Editor → nombre: cobro-terminal
//      → pega este archivo completo → Deploy function.
//   2. Edge Functions → Secrets → Add new secret: MP_ACCESS_TOKEN = tu Access Token
//      de producción (APP_USR-…).
// La terminal elegida la publica la app del dueño (tabla config, clave "terminal").

type Env = { url: string; serviceKey: string; mpToken: string };
type Fetch = (input: string, init?: any) => Promise<Response>;

const MP = "https://api.mercadopago.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (status: number, code: string, message: string) => json(status, { code, message, errors: [{ code, message }] });

export async function handle(req: Request, env: Env, fetcher: Fetch = fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Usa POST.");
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Solicitud inválida.");
  }
  // Clave de servidor: las nuevas (sb_secret_…) van solo en "apikey"; las antiguas (JWT) también en Authorization.
  const admin: Record<string, string> = { apikey: env.serviceKey, ...(env.serviceKey.startsWith("eyJ") ? { Authorization: `Bearer ${env.serviceKey}` } : {}) };
  if (body.action === "alta") return signup(req, env, fetcher, body, admin);
  if (!env.mpToken) return fail(503, "mp_token_missing", "Falta configurar el secreto MP_ACCESS_TOKEN en Supabase (Edge Functions → Secrets).");

  // 1) ¿Quién llama? Debe ser un integrante activo de la tienda, desde SU teléfono.
  const auth = req.headers.get("Authorization") || "";
  const userRes = await fetcher(`${env.url}/auth/v1/user`, { headers: { Authorization: auth, apikey: env.serviceKey } });
  if (!userRes.ok) return fail(401, "unauthorized_user", "Tu sesión venció. Vuelve a entrar en la app.");
  const user = await userRes.json();
  const members = await (await fetcher(`${env.url}/rest/v1/members?user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=role,name,device_id,methods`, { headers: admin })).json();
  if (!Array.isArray(members) || !members.length) return fail(403, "not_a_member", "Tu usuario aún no está autorizado por el dueño de la tienda.");
  const device = req.headers.get("x-device-id") || "";
  if (!device || members[0].device_id !== device) return fail(403, "other_device", "Este teléfono no está autorizado para tu cuenta. Pídele al dueño que autorice el cambio de teléfono.");
  const isOwner = members[0].role === "owner";
  // Cuentas de la tienda (solo el dueño): ver correos y dar de baja.
  if (body.action === "usuarios" || body.action === "eliminar_usuario" || body.action === "cambiar_contrasena") {
    if (!isOwner) return fail(403, "owner_only", "Solo el dueño puede administrar usuarios.");
    return manageUsers(env, fetcher, admin, body, String(user.id));
  }
  const cfg = await (await fetcher(`${env.url}/rest/v1/config?key=eq.terminal&select=value`, { headers: admin })).json();
  const terminal = Array.isArray(cfg) ? cfg[0]?.value : null;
  const terminalId: string = terminal?.terminalId || "";

  const mp = (method: string, path: string, payload?: unknown, idem?: string) =>
    fetcher(MP + path, {
      method,
      headers: { Authorization: `Bearer ${env.mpToken}`, "Content-Type": "application/json", ...(idem ? { "X-Idempotency-Key": idem } : {}) },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  const relay = async (res: Response) => {
    const text = await res.text();
    return new Response(text || "{}", { status: res.status, headers: { ...CORS, "Content-Type": "application/json" } });
  };
  const db = async (method: string, path: string, payload?: unknown) => {
    const r = await fetcher(`${env.url}/rest/v1/${path}`, {
      method,
      headers: { ...admin, "Content-Type": "application/json", Prefer: "return=representation" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  };
  /** El cobro debe ser de quien llama (o el dueño). */
  const ownOrder = async (filter: string) => {
    const rows = await db("GET", `terminal_orders?${filter}&select=*`);
    const row = Array.isArray(rows) ? rows[0] : null;
    return row && (row.created_by === user.id || members[0].role === "owner") ? row : null;
  };
  const orderId = String(body.orderId || "");
  const validOrder = /^[A-Za-z0-9_-]{1,80}$/.test(orderId);
  /** Modo de la terminal elegida (PDV, STANDALONE…); "" si Mercado Pago no lo dijo. */
  const terminalMode = async (): Promise<string> => {
    try {
      const r = await mp("GET", "/terminals/v1/list?limit=50&offset=0");
      if (!r.ok) return "";
      const j = await r.json();
      const list = j?.data?.terminals ?? j?.terminals ?? [];
      const t = Array.isArray(list) ? list.find((x: any) => x?.id === terminalId) : null;
      return t?.operating_mode ? String(t.operating_mode) : "";
    } catch {
      return "";
    }
  };
  /** Mismas reglas que "create": terminal habilitada y tarjeta permitida para quien cobra. */
  const cardAllowed = () => {
    if (!terminalId || terminal?.enabled === false) return fail(409, "terminal_off", "El dueño no ha habilitado la terminal para vendedores.");
    const methods: string[] = Array.isArray(members[0].methods) ? members[0].methods : ["Tarjeta", "Efectivo", "Transferencia"];
    if (!isOwner && !methods.includes("Tarjeta")) return fail(403, "card_off", "El dueño no te habilitó cobrar con tarjeta.");
    return null;
  };
  /** Pagos ya ligados a un cobro (de terminal o a mano). */
  const usedRefs = async (ids: string[]): Promise<Set<string>> => {
    if (!ids.length) return new Set();
    const rows = await db("GET", `terminal_orders?reference=in.(${ids.map(encodeURIComponent).join(",")})&select=reference`);
    return new Set(Array.isArray(rows) ? rows.map((r: any) => String(r.reference)) : []);
  };

  switch (body.action) {
    case "ping":
      return json(200, { ok: true, role: members[0].role, name: members[0].name, terminal: !!terminalId && terminal?.enabled !== false });
    case "create": {
      const denied = cardAllowed();
      if (denied) return denied;
      const amount = Number(body.amount);
      if (!Number.isSafeInteger(amount) || amount < 100 || amount > 10_000_000) return fail(400, "bad_amount", "Monto inválido.");
      const reference = String(body.reference || "");
      if (!/^NOVA-[A-Za-z0-9-]{4,58}$/.test(reference)) return fail(400, "bad_reference", "Referencia inválida.");
      // Solo el modo Punto de Venta recibe cobros de la app. En modo normal se cobra a mano
      // y se liga con "buscar_pago" / "usar_pago". Si no se pudo saber el modo, se intenta.
      const mode = await terminalMode();
      if (mode && mode !== "PDV")
        return json(409, { code: "terminal_not_pdv", mode, message: "La terminal está en modo normal: cobra directamente en la terminal y luego toca «Ya cobré».", errors: [{ code: "terminal_not_pdv", message: "Terminal fuera de modo Punto de Venta." }] });
      const res = await mp(
        "POST",
        "/v1/orders",
        {
          type: "point",
          external_reference: reference,
          expiration_time: "PT5M",
          transactions: { payments: [{ amount: (amount / 100).toFixed(2) }] },
          config: { point: { terminal_id: terminalId, print_on_terminal: "no_ticket" } },
          description: `Venta Nova Negocio · ${String(members[0].name).slice(0, 40)}`,
        },
        reference,
      );
      const text = await res.text();
      if (res.ok) {
        const order = JSON.parse(text || "{}");
        // Registro de quién creó el cobro: solo esa persona (o el dueño) podrá consultarlo, cancelarlo y usarlo en una venta.
        await db("POST", "terminal_orders", { order_id: order.id, created_by: user.id, amount, status: "creada" });
      }
      return new Response(text || "{}", { status: res.status, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    case "get":
    case "cancel": {
      if (!validOrder) return fail(400, "bad_order", "Cobro inválido.");
      const own = await ownOrder(`order_id=eq.${encodeURIComponent(orderId)}`);
      if (!own) return fail(403, "not_your_order", "Ese cobro no es tuyo.");
      if (body.action === "cancel") return relay(await mp("POST", `/v1/orders/${orderId}/cancel`, undefined, `cancel-${orderId}-${Date.now()}`));
      const res = await mp("GET", `/v1/orders/${orderId}`);
      const text = await res.text();
      if (res.ok) {
        // Estado verificado por el servidor: la venta con tarjeta solo se acepta si aquí quedó "aprobada" y por el monto exacto.
        const o = JSON.parse(text || "{}");
        const pay = o?.transactions?.payments?.[0] ?? {};
        const paid = Math.round(Number(pay.paid_amount || pay.amount || 0) * 100);
        const st = o.status === "processed" && (!pay.status || pay.status === "processed") ? (paid === own.amount ? "aprobada" : "revisar") : ["canceled", "failed", "expired", "refunded"].includes(o.status) ? o.status : own.status;
        if (st !== own.status || (pay.reference_id && pay.reference_id !== own.reference))
          await db("PATCH", `terminal_orders?order_id=eq.${encodeURIComponent(orderId)}`, { status: st, reference: pay.reference_id ? String(pay.reference_id) : own.reference });
      }
      return new Response(text || "{}", { status: res.status, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    case "buscar_pago": {
      const denied = cardAllowed();
      if (denied) return denied;
      const amount = Number(body.amount);
      if (!Number.isSafeInteger(amount) || amount < 100 || amount > 10_000_000) return fail(400, "bad_amount", "Monto inválido.");
      // Ventana: desde que empezó el cobro (con 5 min de margen por el reloj del teléfono),
      // al menos los últimos 45 min y nunca más de 24 h.
      const now = Date.now();
      const asked = Date.parse(String(body.since || ""));
      const since = Math.max(now - 24 * 3600_000, Math.min(now - 45 * 60_000, Number.isFinite(asked) ? asked - 5 * 60_000 : now));
      const results: any[] = [];
      for (let page = 0; page < 4; page++) {
        const r = await mp("GET", `/v1/payments/search?sort=date_created&criteria=desc&range=date_created&begin_date=NOW-1DAYS&end_date=NOW&limit=50&offset=${page * 50}`);
        if (!r.ok) return relay(r);
        const list: any[] = (await r.json())?.results ?? [];
        results.push(...list);
        const last = list[list.length - 1];
        if (list.length < 50 || !last || Date.parse(last.date_created) < since) break;
      }
      const candidates = results.filter((p) => p?.status === "approved" && Math.round(Number(p.transaction_amount || 0) * 100) === amount && Date.parse(p.date_created || p.date_approved) >= since);
      // Los cobros que la app mandó a la terminal (NOVA-…) ya están ligados a su venta.
      const fromTerminal = candidates.filter((p) => isTerminalPayment(p) && !/^NOVA-/.test(String(p.external_reference || "")));
      const used = await usedRefs(fromTerminal.map((p) => String(p.id)));
      const payments = fromTerminal
        .filter((p) => !used.has(String(p.id)))
        .map(paymentSummary)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 8);
      return json(200, { payments, other: candidates.filter((p) => !isTerminalPayment(p)).length });
    }
    case "usar_pago": {
      const denied = cardAllowed();
      if (denied) return denied;
      const id = String(body.paymentId || "");
      const amount = Number(body.amount);
      if (!/^\d{1,20}$/.test(id)) return fail(400, "bad_payment", "Pago inválido.");
      if (!Number.isSafeInteger(amount) || amount < 100) return fail(400, "bad_amount", "Monto inválido.");
      const res = await mp("GET", `/v1/payments/${id}`);
      if (!res.ok) return relay(res);
      const p = await res.json();
      if (p.status !== "approved") return fail(409, "payment_not_approved", "Ese pago no está aprobado en Mercado Pago.");
      if (!isTerminalPayment(p)) return fail(409, "not_terminal_payment", "Ese pago no se cobró en la terminal.");
      if (/^NOVA-/.test(String(p.external_reference || ""))) return fail(409, "payment_used", "Ese pago ya está ligado a otra venta.");
      if (Math.round(Number(p.transaction_amount || 0) * 100) !== amount) return fail(409, "amount_mismatch", "El pago no coincide con el total de la venta.");
      if (!(Date.parse(p.date_created || p.date_approved) >= Date.now() - 24 * 3600_000)) return fail(409, "payment_too_old", "Ese pago tiene más de 24 horas; pídele al dueño que lo registre.");
      const key = "PAY-" + id;
      const mine = (rows: any) => Array.isArray(rows) && rows.length === 1 && rows[0].order_id === key && rows[0].created_by === user.id && !rows[0].sale_id;
      const existing = await db("GET", `terminal_orders?reference=eq.${id}&select=order_id,created_by,sale_id`);
      // Reintento del mismo vendedor (se cortó la red): se devuelve lo mismo.
      if (Array.isArray(existing) && existing.length && !mine(existing)) return fail(409, "payment_used", "Ese pago ya está ligado a otra venta.");
      if (!mine(existing)) {
        const ins = await fetcher(`${env.url}/rest/v1/terminal_orders`, {
          method: "POST",
          headers: { ...admin, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ order_id: key, created_by: user.id, amount, status: "aprobada", reference: id }),
        });
        if (!ins.ok) return fail(409, "payment_used", "Ese pago ya está ligado a otra venta.");
      }
      return json(200, { orderId: key, referenceId: id, payment: paymentSummary(p) });
    }
    case "payment": {
      const id = String(body.paymentId || "");
      if (!/^\d{1,20}$/.test(id)) return fail(400, "bad_payment", "Pago inválido.");
      if (!(await ownOrder(`reference=eq.${id}`))) return fail(403, "not_your_order", "Ese pago no es tuyo.");
      const res = await mp("GET", `/v1/payments/${id}`);
      if (!res.ok) return relay(res);
      const p = await res.json();
      // Solo los datos que necesita el comprobante.
      return json(200, {
        id: p.id,
        status: p.status,
        transaction_amount: p.transaction_amount,
        authorization_code: p.authorization_code,
        payment_method_id: p.payment_method_id,
        payment_type_id: p.payment_type_id,
        installments: p.installments,
        date_approved: p.date_approved,
        card: { last_four_digits: p.card?.last_four_digits },
      });
    }
    default:
      return fail(400, "bad_action", "Acción no permitida.");
  }
}

/** ¿Lo cobró una terminal Point? (igual que src/mercadopago.ts → isTerminalPayment). */
function isTerminalPayment(p: any): boolean {
  return p?.operation_type === "pos_payment" || /point/i.test(String(p?.point_of_interaction?.type || ""));
}
/** Lo que necesita el teléfono para elegir el pago y armar el comprobante. */
function paymentSummary(p: any) {
  return {
    id: String(p.id),
    amount: Math.round(Number(p.transaction_amount || 0) * 100),
    date: String(p.date_approved || p.date_created || ""),
    last4: String(p.card?.last_four_digits || ""),
    brand: String(p.payment_method_id || ""),
    type: String(p.payment_type_id || ""),
    installments: Number(p.installments || 1),
    authorization: String(p.authorization_code || ""),
  };
}

/** Lista de cuentas (correo, alta, último acceso) y baja definitiva de un vendedor o de una cuenta sin acceso. */
async function manageUsers(env: Env, fetcher: Fetch, admin: Record<string, string>, body: any, ownerId: string): Promise<Response> {
  const members = await (await fetcher(`${env.url}/rest/v1/members?select=user_id,role,name`, { headers: admin })).json();
  const roleOf = (id: string) => (Array.isArray(members) ? members.find((m: any) => m.user_id === id) : null);
  if (body.action === "usuarios") {
    const r = await fetcher(`${env.url}/auth/v1/admin/users?page=1&per_page=500`, { headers: admin });
    if (!r.ok) return fail(502, "users_failed", "No se pudo leer la lista de cuentas.");
    const data = await r.json();
    const list = (Array.isArray(data) ? data : data?.users || [])
      .filter((u: any) => u.id !== ownerId)
      .map((u: any) => ({ id: u.id, email: u.email || "", created_at: u.created_at || null, last_sign_in_at: u.last_sign_in_at || null, member: !!roleOf(u.id), name: roleOf(u.id)?.name || "" }));
    return json(200, { users: list });
  }
  const id = String(body.userId || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "bad_user", "Usuario inválido.");
  if (id === ownerId || roleOf(id)?.role === "owner") return fail(403, "owner_protected", "La cuenta del dueño no se puede cambiar desde aquí.");
  if (body.action === "cambiar_contrasena") {
    const password = String(body.password || "");
    if (password.length < 8) return fail(400, "weak_password", "La contraseña debe tener al menos 8 caracteres.");
    const r = await fetcher(`${env.url}/auth/v1/admin/users/${id}`, { method: "PUT", headers: { ...admin, "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (!r.ok) return fail(502, "password_failed", "No se pudo cambiar la contraseña.");
    return json(200, { ok: true });
  }
  const r = await fetcher(`${env.url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin });
  if (!r.ok && r.status !== 404) return fail(502, "delete_failed", "No se pudo eliminar la cuenta. Revisa que ya ejecutaste el schema.sql de la versión 1.3.");
  return json(200, { ok: true });
}

const INVITE_ERRORS: Record<string, string> = {
  invalid: "Ese código no existe o fue revocado. Revísalo o pide uno nuevo al dueño.",
  used: "Ese código ya se usó. Cada código sirve una sola vez: pide uno nuevo al dueño.",
  expired: "Ese código venció. Pide uno nuevo al dueño.",
  locked: "Demasiados intentos con códigos incorrectos. Espera una hora.",
};
/** Alta de vendedor: código válido → cuenta nueva ligada a este teléfono. */
async function signup(req: Request, env: Env, fetcher: Fetch, body: any, admin: Record<string, string>): Promise<Response> {
  const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const name = String(body.name || "").trim().slice(0, 80);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const device = String(body.device || "");
  if (!/^GNS[A-Z0-9]{8}$/.test(code)) return fail(400, "invalid", INVITE_ERRORS.invalid);
  if (!name) return fail(400, "bad_name", "Escribe tu nombre.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, "bad_email", "Escribe un correo válido.");
  if (password.length < 8) return fail(400, "weak_password", "La contraseña debe tener al menos 8 caracteres.");
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(device)) return fail(400, "update_app", "Actualiza la app a la versión más reciente.");
  // Sin dirección conocida se manda vacío: la base no usa un contador compartido
  // (así nadie puede bloquear el alta de todos con intentos fallidos).
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64);
  const rpc = async (fn: string, args: unknown) => {
    const r = await fetcher(`${env.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: { ...admin, "Content-Type": "application/json" }, body: JSON.stringify(args) });
    const text = await r.text();
    if (!r.ok) throw new Error(text || `rpc ${fn} ${r.status}`);
    return text ? JSON.parse(text) : null;
  };
  const claim = await rpc("invite_claim", { p_code: code, p_key: ip });
  if (claim !== "ok") return fail(400, String(claim), INVITE_ERRORS[String(claim)] || "Código no válido.");
  const created = await fetcher(`${env.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name } }),
  });
  const user = await created.json().catch(() => ({}));
  if (!created.ok || !user?.id) {
    await rpc("invite_release", { p_code: code }).catch(() => {});
    const exists = created.status === 422 || /already|exists|registered/i.test(JSON.stringify(user));
    return fail(exists ? 409 : 400, exists ? "email_exists" : "signup_failed", exists ? "Ese correo ya tiene cuenta. Si ya eres vendedor usa «Ya tengo cuenta · Entrar»; si es otro teléfono, pídele al dueño que lo autorice. Tu código sigue disponible." : `No se pudo crear la cuenta: ${user?.msg || user?.message || created.status}.`);
  }
  try {
    await rpc("invite_finish", { p_code: code, p_user: user.id, p_name: name, p_device: device });
  } catch (e) {
    await fetcher(`${env.url}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: admin }).catch(() => {});
    await rpc("invite_release", { p_code: code }).catch(() => {});
    return fail(500, "signup_failed", "No se pudo completar el alta. Intenta de nuevo.");
  }
  return json(200, { ok: true });
}

/** Clave de servidor: primero la nueva (SUPABASE_SECRET_KEYS.default), si no la antigua service_role. */
function serverKey(get: (k: string) => string | undefined): string {
  try {
    const keys = JSON.parse(get("SUPABASE_SECRET_KEYS") || "{}");
    if (keys.default) return keys.default;
    const first = Object.values(keys)[0];
    if (typeof first === "string" && first) return first;
  } catch {}
  return get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
const DenoRt = (globalThis as any).Deno;
if (DenoRt && !(globalThis as any).__NOVA_TEST__)
  DenoRt.serve((req: Request) => {
    const get = (k: string) => DenoRt.env.get(k) as string | undefined;
    return handle(req, { url: get("SUPABASE_URL") ?? "", serviceKey: serverKey(get), mpToken: get("MP_ACCESS_TOKEN") ?? "" });
  });
