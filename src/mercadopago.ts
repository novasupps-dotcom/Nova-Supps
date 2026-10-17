// Conexión directa con la terminal Mercado Pago Point (API de Orders, tipo "point").
// Opción A: la clave privada (Access Token) vive solo en este teléfono, dentro de
// la base local, y nunca se exporta en los respaldos.
// Referencia: https://www.mercadopago.com.mx/developers/es/docs/mp-point/overview

export const MP_API = "https://api.mercadopago.com";
export type MpConfig = { token: string; terminalId: string; terminalLabel?: string; enabled: boolean; account?: string };
export type Outcome = "pending" | "approved" | "canceled" | "failed" | "expired" | "check" | "refunded";
type Fetch = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any>; text?: () => Promise<string> }>;

const MESSAGES: Record<string, string> = {
  unauthorized: "La clave de Mercado Pago no es válida o venció. Revísala en Ajustes → Terminal Mercado Pago.",
  user_not_authorized: "La clave no tiene permiso para esta operación.",
  forbidden_checking_terminal_owner: "La terminal elegida no pertenece a la cuenta de esta clave.",
  already_queued_order_for_terminal: "La terminal ya tiene un cobro en espera. Termínalo o cancélalo en la terminal y vuelve a intentar.",
  store_pos_not_found: "La terminal no está vinculada a una sucursal y caja. Vincúlala desde la app de Mercado Pago.",
  terminal_not_allowed_action: "Mercado Pago no permite esa acción para esta terminal.",
  cannot_cancel_order: "La terminal ya tomó el cobro: cancélalo directamente en la terminal.",
  order_already_canceled: "Ese cobro ya estaba cancelado.",
  order_already_refunded: "Ese cobro ya fue devuelto.",
  refund_period_exceeded: "Pasaron más de 90 días: Mercado Pago ya no permite devolverlo.",
  insufficient_money_for_refund: "No hay saldo suficiente en Mercado Pago para la devolución.",
  order_payment_not_yet_enabled_for_refund: "Mercado Pago aún no habilita la devolución de este cobro; intenta en unos minutos.",
  refund_in_progress: "Ya hay una devolución en proceso para este cobro.",
  unsupported_partially_refunds: "Mercado Pago no permite devolver solo una parte de este cobro. Devuélvelo desde la app de Mercado Pago o registra la devolución sin Mercado Pago.",
  partial_refund_forbidden_with_tips: "Mercado Pago no permite devoluciones parciales en cobros con propina.",
  refund_amount_exceeds: "El monto a devolver supera lo que queda del cobro en Mercado Pago.",
  max_refunds_exceeded: "Este cobro ya alcanzó el máximo de devoluciones permitido.",
  unsupported_site: "Esta función de Mercado Pago no está disponible para el país de la cuenta.",
  terminal_not_pdv: "La terminal está en modo normal: no recibe cobros desde la app. Cobra directamente en la terminal y luego toca «Ya cobré».",
  payment_used: "Ese pago ya está ligado a otra venta.",
  PA_UNAUTHORIZED_RESULT_FROM_POLICIES:
    "Mercado Pago rechazó la clave por sus políticas de permisos (403). Casi siempre pasa por usar el Access Token de PRUEBA o porque las credenciales de PRODUCCIÓN aún no están activadas. En Mercado Pago Developers abre tu aplicación → Credenciales de producción → Activar credenciales (completa los datos del negocio) y copia ese Access Token.",
};

export class MpError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "", status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let seq = 0;
export const idempotencyKey = (prefix = "nova") => `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
/** Centavos → "488.85" (Mercado Pago exige string con 2 decimales). */
export const mpAmount = (cents: number) => (cents / 100).toFixed(2);

export class MercadoPago {
  private token: string;
  private fetcher: Fetch;
  constructor(token: string, fetcher?: Fetch) {
    this.token = token;
    this.fetcher = fetcher ?? ((url, init) => (globalThis as any).fetch(url, init));
  }

  private async call(method: string, path: string, body?: any, idem?: string) {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
    if (idem) headers["X-Idempotency-Key"] = idem;
    let res;
    try {
      res = await this.fetcher(MP_API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new MpError("No hay conexión con Mercado Pago. Revisa tu internet e intenta de nuevo.", "network");
    }
    let data: any = null;
    try {
      data = await res.json();
    } catch {}
    if (!res.ok) {
      const code = String(data?.errors?.[0]?.code || data?.code || data?.error || (res.status === 401 ? "unauthorized" : ""));
      const detail = data?.errors?.[0]?.message || data?.message || "";
      throw new MpError(MESSAGES[code] || `Mercado Pago respondió ${res.status}${code ? ` (${code})` : ""}${detail ? `: ${detail}` : ""}.`, code, res.status);
    }
    return data;
  }
  me() {
    return this.call("GET", "/users/me");
  }
  async terminals(): Promise<{ id: string; pos_id?: any; store_id?: any; external_pos_id?: string; operating_mode?: string }[]> {
    const r = await this.call("GET", "/terminals/v1/list?limit=50&offset=0");
    return r?.data?.terminals ?? [];
  }
  setMode(terminalId: string, mode: "PDV" | "STANDALONE") {
    return this.call("PATCH", "/terminals/v1/setup", { terminals: [{ id: terminalId, operating_mode: mode }] });
  }
  /** Envía el cobro a la terminal. `reference` debe ser único (máx. 64, sin datos personales). */
  createOrder(input: { terminalId: string; amount: number; reference: string; description?: string }) {
    return this.call(
      "POST",
      "/v1/orders",
      {
        type: "point",
        external_reference: input.reference.slice(0, 64),
        expiration_time: "PT5M",
        transactions: { payments: [{ amount: mpAmount(input.amount) }] },
        config: { point: { terminal_id: input.terminalId, print_on_terminal: "no_ticket" } },
        description: (input.description || "Venta Nova Negocio").slice(0, 150),
      },
      input.reference,
    );
  }
  getOrder(orderId: string) {
    return this.call("GET", `/v1/orders/${encodeURIComponent(orderId)}`);
  }
  cancelOrder(orderId: string) {
    return this.call("POST", `/v1/orders/${encodeURIComponent(orderId)}/cancel`, undefined, idempotencyKey("cancel"));
  }
  /** Devolución total (sin `partial`) o parcial de un cobro de la terminal. */
  refundOrder(orderId: string, partial?: { paymentId: string; amount: number }) {
    // 2.0.3: cobro hecho directo en la terminal (PAY-<pago>): se devuelve el pago.
    if (orderId.startsWith("PAY-")) {
      const id = encodeURIComponent(orderId.slice(4));
      return this.call("POST", `/v1/payments/${id}/refunds`, partial ? { amount: Number(mpAmount(partial.amount)) } : {}, idempotencyKey("refund"));
    }
    const body = partial ? { transactions: [{ id: partial.paymentId, amount: mpAmount(partial.amount) }] } : undefined;
    return this.call("POST", `/v1/orders/${encodeURIComponent(orderId)}/refund`, body, idempotencyKey("refund"));
  }
  /** Detalle del pago (incluye la comisión que cobró Mercado Pago). */
  payment(paymentId: string) {
    return this.call("GET", `/v1/payments/${encodeURIComponent(paymentId)}`);
  }
  /** Pagos de las últimas 24 h, del más reciente al más antiguo (hasta `pages` × 50). */
  async recentPayments(sinceMs: number, pages = 4): Promise<any[]> {
    const out: any[] = [];
    for (let page = 0; page < pages; page++) {
      const r = await this.call("GET", `/v1/payments/search?sort=date_created&criteria=desc&range=date_created&begin_date=NOW-1DAYS&end_date=NOW&limit=50&offset=${page * 50}`);
      const list: any[] = Array.isArray(r?.results) ? r.results : [];
      out.push(...list);
      const last = list[list.length - 1];
      if (list.length < 50 || !last || Date.parse(last.date_created) < sinceMs) break;
    }
    return out;
  }
  /**
   * Terminal en modo normal (sin Punto de Venta): busca el pago que se cobró a
   * mano en la terminal por ese monto, aprobado y que no esté ligado a otra venta.
   */
  async findTerminalPayments(amount: number, sinceMs: number, used: (id: string) => boolean) {
    return matchTerminalPayments(await this.recentPayments(sinceMs), amount, sinceMs, used);
  }
}

/** Pago cobrado directamente en la terminal, listo para ligarlo a una venta. */
export type TerminalPayment = { id: string; amount: number; date: string; last4: string; brand: string; type: string; installments: number; authorization: string };
/** ¿Lo cobró una terminal Point? (Mercado Pago lo marca como pago de punto de venta). */
export function isTerminalPayment(p: any): boolean {
  return p?.operation_type === "pos_payment" || /point/i.test(String(p?.point_of_interaction?.type || ""));
}
export function toTerminalPayment(p: any): TerminalPayment {
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
/**
 * Pagos aprobados de la terminal por exactamente `amount` centavos, creados desde
 * `sinceMs`, que no estén usados. `other` cuenta los aprobados por ese monto que
 * NO vienen de la terminal (para avisar sin dejarlos ligar).
 */
export function matchTerminalPayments(results: any[], amount: number, sinceMs: number, used: (id: string) => boolean): { matches: TerminalPayment[]; other: number } {
  const seen = new Set<string>();
  const matches: TerminalPayment[] = [];
  let other = 0;
  for (const p of results) {
    const id = String(p?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (p.status !== "approved" || Math.round(Number(p.transaction_amount || 0) * 100) !== amount) continue;
    if (!(Date.parse(p.date_created || p.date_approved) >= sinceMs)) continue;
    if (!isTerminalPayment(p)) {
      other++;
      continue;
    }
    // Los cobros que la app mandó a la terminal (NOVA-…) ya están ligados a su venta.
    if (/^NOVA-/.test(String(p.external_reference || ""))) continue;
    if (!used(id)) matches.push(toTerminalPayment(p));
  }
  return { matches: matches.sort((a, b) => (a.date < b.date ? 1 : -1)), other };
}
/** Order equivalente para un pago cobrado a mano (así se registra igual que un cobro enviado a la terminal). */
export function manualOrder(p: TerminalPayment) {
  return {
    id: "PAY-" + p.id,
    status: "processed",
    transactions: { payments: [{ id: p.id, reference_id: p.id, amount: mpAmount(p.amount), paid_amount: mpAmount(p.amount), status: "processed", card: { last_digits: p.last4 }, payment_method: { id: p.brand, type: p.type, installments: p.installments } }] },
  };
}
/** "visa ••4242 · 11:05" para elegir el pago correcto. */
export function terminalPaymentLabel(p: TerminalPayment): string {
  const d = new Date(p.date);
  const time = Number.isFinite(d.getTime()) ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "";
  return [p.brand && p.last4 ? `${p.brand} ••${p.last4}` : p.brand || (p.last4 ? `••${p.last4}` : "Tarjeta"), time, p.authorization ? `aut. ${p.authorization}` : ""].filter(Boolean).join(" · ");
}

/** Traduce el estado de la order/pago a lo que la app necesita decidir. */
export function orderOutcome(order: any): Outcome {
  const status = String(order?.status || "");
  const pay = order?.transactions?.payments?.[0] ?? {};
  if (status === "processed" && (pay.status === "processed" || !pay.status)) return "approved";
  if (status === "refunded" || pay.status === "refunded") return "refunded";
  if (status === "canceled" || pay.status === "canceled") return "canceled";
  if (status === "expired" || pay.status === "expired") return "expired";
  if (status === "failed" || pay.status === "failed") return "failed";
  if (status === "action_required" || pay.status === "action_required") return "check";
  return "pending";
}
const FAIL_REASONS: Record<string, string> = {
  rejected_by_issuer: "el banco rechazó la tarjeta",
  insufficient_amount: "fondos insuficientes",
  high_risk: "Mercado Pago lo rechazó por seguridad",
  card_disabled: "la tarjeta está deshabilitada",
  bad_filled_card_data: "datos de tarjeta incorrectos",
  required_call_for_authorize: "el cliente debe llamar a su banco para autorizar",
  max_attempts_exceeded: "demasiados intentos",
  amount_limit_exceeded: "el monto supera el límite",
  invalid_installments: "meses sin intereses no válidos",
  in_review: "el pago quedó en revisión",
  processing_error: "error de procesamiento",
  canceled_on_terminal: "se canceló en la terminal",
  canceled_by_api: "se canceló desde la app",
};
export function outcomeText(order: any): string {
  const o = orderOutcome(order);
  const detail = order?.transactions?.payments?.[0]?.status_detail || order?.status_detail || "";
  const why = FAIL_REASONS[detail] ? ` (${FAIL_REASONS[detail]})` : "";
  switch (o) {
    case "approved":
      return "Pago aprobado.";
    case "canceled":
      return "El cobro se canceló" + why + ". No se registró la venta.";
    case "failed":
      return "El pago no se aprobó" + why + ". No se registró la venta.";
    case "expired":
      return "El cobro venció sin pagarse. No se registró la venta.";
    case "check":
      return "Mercado Pago pide confirmar en la terminal si el pago se aprobó.";
    case "refunded":
      return "Ese cobro ya fue devuelto.";
    default:
      return order?.status === "at_terminal" ? "La terminal recibió el cobro. Pide al cliente que pase o acerque su tarjeta." : "Cobro enviado. Esperando a que la terminal lo reciba (si no aparece, toca Actualizar en la terminal)…";
  }
}

/** Datos del pago dentro de una order de Point. */
export function orderPayment(order: any): { id: string; referenceId: string; amount: number } | null {
  const pay = order?.transactions?.payments?.[0];
  if (!pay) return null;
  const amount = Math.round(Number(pay.paid_amount || pay.amount || 0) * 100);
  return { id: String(pay.id || ""), referenceId: String(pay.reference_id || ""), amount: Number.isFinite(amount) ? amount : 0 };
}
/**
 * Comisión en centavos que Mercado Pago descontó de un pago (fee_details o, si
 * no viene, monto − neto recibido). `null` si la respuesta no la trae.
 */
export function paymentFee(payment: any): number | null {
  const details = Array.isArray(payment?.fee_details) ? payment.fee_details : null;
  if (details && details.length) {
    const total = details
      .filter((f: any) => !f.fee_payer || f.fee_payer === "collector")
      .reduce((n: number, f: any) => n + Number(f.amount || 0), 0);
    if (Number.isFinite(total)) return Math.round(total * 100);
  }
  const gross = Number(payment?.transaction_amount);
  const net = Number(payment?.transaction_details?.net_received_amount);
  if (Number.isFinite(gross) && Number.isFinite(net) && net > 0 && net <= gross) return Math.round((gross - net) * 100);
  return null;
}
