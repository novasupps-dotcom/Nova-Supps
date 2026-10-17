// Conexión con la base en línea (Supabase) por HTTPS: sesión, tablas y la
// función de cobro. Sin librerías nativas: solo fetch.
export type CloudConfig = { url: string; anonKey: string };
export type CloudSession = { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string } };
type Fetch = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any>; text?: () => Promise<string> }>;

export class CloudError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 0, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "Correo o contraseña incorrectos.",
  "Invalid login credentials": "Correo o contraseña incorrectos.",
  user_already_exists: "Ese correo ya tiene cuenta: usa Entrar.",
  "User already registered": "Ese correo ya tiene cuenta: usa Entrar.",
  email_not_confirmed: "Falta confirmar el correo. Abre el correo de Supabase o desactiva la confirmación (ver guía).",
  "Email not confirmed": "Falta confirmar el correo. Abre el correo de Supabase o desactiva la confirmación (ver guía).",
  weak_password: "La contraseña es muy corta: usa al menos 6 caracteres.",
  over_email_send_rate_limit: "Se enviaron demasiados correos. Espera unos minutos y vuelve a intentar.",
  otp_expired: "El código venció o no es correcto. Pide un correo nuevo.",
  "Token has expired or is invalid": "El código venció o no es correcto. Pide un correo nuevo.",
  same_password: "La contraseña nueva debe ser distinta de la anterior.",
  "Email address not authorized": "Supabase aún no puede enviar correos a esa dirección: falta configurar el correo (SMTP) del proyecto. Mientras, pídele al dueño una contraseña nueva.",
  email_address_not_authorized: "Supabase aún no puede enviar correos a esa dirección: falta configurar el correo (SMTP) del proyecto. Mientras, pídele al dueño una contraseña nueva.",
};

/** Lee "NOVA|https://xxxx.supabase.co|clave" (código de invitación). */
export function parseInvite(text: string): CloudConfig | null {
  const m = /NOVA\s*\|\s*(https:\/\/[A-Za-z0-9.-]+)\s*\|\s*([A-Za-z0-9._-]{20,})/.exec(String(text || ""));
  return m ? { url: m[1].replace(/\/+$/, ""), anonKey: m[2] } : null;
}
/** Código corto de invitación: "gns-7k4p q2xm" → "GNS7K4PQ2XM" (o null si no tiene la forma). */
export function normalizeShortCode(text: string): string | null {
  let c = String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z0-9]{8}$/.test(c)) c = "GNS" + c;
  return /^GNS[A-Z0-9]{8}$/.test(c) ? c : null;
}
/** "GNS7K4PQ2XM" → "GNS-7K4P-Q2XM" (también CAM-… y REC-…) */
export const formatShortCode = (c: string) => (/^(GNS|CAM|REC)[A-Z0-9]{8}$/.test(c) ? `${c.slice(0, 3)}-${c.slice(3, 7)}-${c.slice(7)}` : c);
export const INVITE_MESSAGES: Record<string, string> = {
  invalid: "Ese código no existe o fue revocado. Revísalo o pide uno nuevo al dueño.",
  used: "Ese código ya se usó. Pide uno nuevo al dueño.",
  expired: "Ese código venció. Pide uno nuevo al dueño.",
  locked: "Demasiados intentos con códigos incorrectos. Espera una hora y vuelve a intentar.",
  none: "Tu cuenta no tiene acceso a la tienda. Pide un código de invitación al dueño.",
  other_device: "Tu cuenta está registrada en otro teléfono. Por seguridad solo funciona en uno: pídele al dueño un código de cambio de teléfono (CAM-…) y escríbelo aquí.",
  ok: "Listo: este teléfono quedó registrado a tu cuenta.",
  update_app: "Actualiza la app a la versión más reciente.",
};
export function normalizeUrl(raw: string): string {
  let u = String(raw || "").trim().replace(/\/+$/, "");
  if (/^[a-z0-9]{10,40}$/i.test(u)) u = `https://${u}.supabase.co`;
  if (!/^https:\/\//.test(u)) u = "https://" + u.replace(/^http:\/\//, "");
  return u;
}

export class Cloud {
  cfg: CloudConfig;
  session: CloudSession | null;
  /** Teléfono registrado de la cuenta (encabezado x-device-id). */
  device = "";
  private onSession: (s: CloudSession | null) => void;
  private fetcher: Fetch;
  constructor(cfg: CloudConfig, session: CloudSession | null, onSession: (s: CloudSession | null) => void = () => {}, fetcher?: Fetch) {
    this.cfg = cfg;
    this.session = session;
    this.onSession = onSession;
    this.fetcher = fetcher ?? ((url, init) => (globalThis as any).fetch(url, init));
  }
  get userId() {
    return this.session?.user?.id || "";
  }
  private async request(path: string, init: any = {}, auth = true): Promise<any> {
    if (auth) await this.ensureFresh();
    // La clave pública va solo en "apikey" (las claves nuevas sb_publishable_… no son JWT);
    // "Authorization" lleva únicamente la sesión del usuario.
    const headers: Record<string, string> = { apikey: this.cfg.anonKey, "Content-Type": "application/json", ...(init.headers || {}) };
    if (auth && this.session) headers.Authorization = `Bearer ${this.session.access_token}`;
    if (this.device) headers["x-device-id"] = this.device;
    let res;
    try {
      res = await this.fetcher(this.cfg.url + path, { ...init, headers });
    } catch {
      throw new CloudError("Sin conexión a internet o la base en línea no responde.", 0, "network");
    }
    let data: any = null;
    try {
      data = await res.json();
    } catch {}
    if (res.status === 401 && auth && this.session && !init.__retried) {
      await this.refresh();
      return this.request(path, { ...init, __retried: true }, auth);
    }
    if (!res.ok) {
      const code = String(data?.error_code || data?.code || data?.error || "");
      const raw = String(data?.msg || data?.message || data?.error_description || data?.hint || "");
      const known = AUTH_MESSAGES[code] || AUTH_MESSAGES[raw];
      const paused = res.status === 540 || /paused/i.test(raw);
      throw new CloudError(
        known ||
          // Mensaje propio de la base (raise exception en las funciones): se muestra tal cual.
          (code === "P0001" && raw
            ? raw
            : paused
            ? "La base en línea está en pausa por inactividad. Entra a supabase.com y toca Restore project."
            : res.status === 403 || /row-level security|permission denied/i.test(raw)
              ? "Tu usuario no tiene permiso para esto (¿ya te aprobó el dueño?)."
              : `La base en línea respondió ${res.status}${raw ? `: ${raw}` : ""}.`),
        res.status,
        code,
      );
    }
    return data;
  }
  private setSession(raw: any) {
    if (!raw?.access_token) throw new CloudError("Supabase no devolvió una sesión. Si pide confirmar el correo, revisa la guía.", 0, "no_session");
    this.session = {
      access_token: raw.access_token,
      refresh_token: raw.refresh_token,
      expires_at: raw.expires_at || Math.floor(Date.now() / 1000) + (raw.expires_in || 3600),
      user: { id: raw.user?.id, email: raw.user?.email },
    };
    this.onSession(this.session);
    return this.session;
  }
  async signUp(email: string, password: string) {
    const r = await this.request("/auth/v1/signup", { method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase(), password }) }, false);
    return this.setSession(r?.access_token ? r : r?.session);
  }
  async signIn(email: string, password: string) {
    const r = await this.request("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase(), password }) }, false);
    return this.setSession(r);
  }
  /** Olvidé mi contraseña: Supabase manda un correo con un código (no dice si la cuenta existe). */
  async recover(email: string) {
    await this.request("/auth/v1/recover", { method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase() }) }, false);
  }
  /** Con el código del correo inicia sesión para poder poner una contraseña nueva. */
  async verifyRecovery(email: string, code: string) {
    const r = await this.request("/auth/v1/verify", { method: "POST", body: JSON.stringify({ type: "recovery", email: email.trim().toLowerCase(), token: code.replace(/\D/g, "") }) }, false);
    return this.setSession(r);
  }
  async updatePassword(password: string) {
    await this.request("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password }) });
  }
  async refresh() {
    if (!this.session?.refresh_token) throw new CloudError("Tu sesión venció. Vuelve a entrar.", 401, "no_session");
    try {
      const r = await this.request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: this.session.refresh_token }) }, false);
      return this.setSession(r);
    } catch (e) {
      if (e instanceof CloudError && e.status >= 400 && e.status < 500) {
        this.session = null;
        this.onSession(null);
        throw new CloudError("Tu sesión venció. Vuelve a entrar.", 401, "session_expired");
      }
      throw e;
    }
  }
  async ensureFresh() {
    if (!this.session) throw new CloudError("Inicia sesión en la base en línea.", 401, "no_session");
    if (this.session.expires_at - 60 < Date.now() / 1000) await this.refresh();
  }
  signOut() {
    this.session = null;
    this.onSession(null);
  }
  rpc(fn: string, args: Record<string, unknown> = {}) {
    return this.request(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
  }
  select(table: string, query = "select=*") {
    return this.request(`/rest/v1/${table}?${query}`, { method: "GET" });
  }
  insert(table: string, rows: any[] | any, upsert = false, minimal = false) {
    return this.request(`/rest/v1/${table}`, {
      method: "POST",
      headers: { Prefer: `return=${minimal ? "minimal" : "representation"}${upsert ? ",resolution=merge-duplicates" : ""}` },
      body: JSON.stringify(rows),
    });
  }
  update(table: string, filter: string, patch: Record<string, unknown>) {
    return this.request(`/rest/v1/${table}?${filter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
  }
  remove(table: string, filter: string) {
    return this.request(`/rest/v1/${table}?${filter}`, { method: "DELETE" });
  }
  /**
   * 2.5 · Sube un archivo a un espacio público de Storage (catálogo en PDF) y devuelve su
   * enlace público. Solo el dueño puede subir (SQL 2.5); cualquiera con el enlace lo puede ver.
   */
  async uploadPublic(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<string> {
    await this.ensureFresh();
    let res;
    try {
      res = await this.fetcher(`${this.cfg.url}/storage/v1/object/${bucket}/${path}`, {
        method: "POST",
        headers: {
          apikey: this.cfg.anonKey,
          Authorization: `Bearer ${this.session!.access_token}`,
          "Content-Type": contentType,
          "x-upsert": "false",
          ...(this.device ? { "x-device-id": this.device } : {}),
        },
        body: bytes,
      });
    } catch {
      throw new CloudError("Sin conexión a internet.", 0, "network");
    }
    if (!res.ok) {
      let data: any = null;
      try {
        data = await res.json();
      } catch {}
      const raw = String(data?.message || data?.error || "");
      throw new CloudError(
        /bucket not found/i.test(raw) || res.status === 404
          ? "Falta activar el envío de catálogos: corre el SQL 2.5 en Supabase."
          : res.status === 403 || res.status === 401 || /row-level|policy|unauthorized/i.test(raw)
            ? "Tu base en línea aún no permite subir catálogos: corre el SQL 2.5 en Supabase."
            : `La base en línea respondió ${res.status}${raw ? `: ${raw}` : ""}.`,
        res.status,
        "storage",
      );
    }
    return `${this.cfg.url}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
  }
  /** Llama a una Edge Function; devuelve { ok, status, data } sin lanzar por errores HTTP. */
  async invoke(name: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
    await this.ensureFresh();
    let res;
    try {
      res = await this.fetcher(`${this.cfg.url}/functions/v1/${name}`, {
        method: "POST",
        headers: { apikey: this.cfg.anonKey, Authorization: `Bearer ${this.session!.access_token}`, "Content-Type": "application/json", ...(this.device ? { "x-device-id": this.device } : {}) },
        body: JSON.stringify(body),
      });
    } catch {
      throw new CloudError("Sin conexión a internet.", 0, "network");
    }
    let data: any = null;
    try {
      data = await res.json();
    } catch {}
    if (res.status === 404) data = { code: "function_missing", message: "Falta crear la función cobro-terminal en Supabase (ver guía)." };
    return { ok: res.ok, status: res.status, data };
  }
}

/** Llama a una función sin sesión (alta con código de invitación). */
export async function publicInvoke(cfg: CloudConfig, name: string, body: unknown, fetcher?: Fetch): Promise<{ ok: boolean; status: number; data: any }> {
  const f: Fetch = fetcher ?? ((url, init) => (globalThis as any).fetch(url, init));
  let res;
  try {
    res = await f(`${cfg.url}/functions/v1/${name}`, { method: "POST", headers: { apikey: cfg.anonKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new CloudError("Sin conexión a internet.", 0, "network");
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  if (res.status === 404 && !data?.code) data = { code: "function_missing", message: "Falta actualizar la función cobro-terminal en Supabase (ver guía)." };
  return { ok: res.ok, status: res.status, data };
}

/**
 * Adaptador para usar la clase MercadoPago a través de la función del servidor:
 * traduce las rutas de la API a acciones de "cobro-terminal".
 */
export function terminalFetcher(cloud: Cloud) {
  return async (url: string, init: any = {}) => {
    const path = url.replace(/^https:\/\/api\.mercadopago\.com/, "");
    const method = String(init.method || "GET").toUpperCase();
    let body: Record<string, unknown>;
    let m: RegExpExecArray | null;
    if (method === "POST" && path === "/v1/orders") {
      const payload = JSON.parse(init.body || "{}");
      body = { action: "create", amount: Math.round(Number(payload?.transactions?.payments?.[0]?.amount || 0) * 100), reference: payload?.external_reference };
    } else if (method === "GET" && (m = /^\/v1\/orders\/([^/]+)$/.exec(path))) body = { action: "get", orderId: decodeURIComponent(m[1]) };
    else if (method === "POST" && (m = /^\/v1\/orders\/([^/]+)\/cancel$/.exec(path))) body = { action: "cancel", orderId: decodeURIComponent(m[1]) };
    else if (method === "GET" && (m = /^\/v1\/payments\/([^/]+)$/.exec(path))) body = { action: "payment", paymentId: decodeURIComponent(m[1]) };
    else throw new Error("Operación no disponible para vendedores.");
    const r = await cloud.invoke("cobro-terminal", body);
    return { ok: r.ok, status: r.status, json: async () => r.data };
  };
}
