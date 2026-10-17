// Textos de comprobante para enviar por WhatsApp (o cualquier app de mensajes).
// El comprobante de tarjeta lo emite el negocio con los datos reales del pago
// que reporta Mercado Pago (tarjeta, autorización y número de operación).
import { money, localDay, customerView, type Row } from "./business";
import { STORE_NAME } from "./theme";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fmtDateTime(iso?: string | null, withTime = true): string {
  if (!iso) return "";
  const day = localDay(iso);
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  const date = `${d} ${MONTHS[m - 1]} ${y}`;
  if (!withTime || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return date;
  const t = new Date(iso);
  return isNaN(t.getTime()) ? date : `${date} · ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

export type CardInfo = {
  operation?: string; // número de operación (pago) de Mercado Pago
  authorization?: string;
  last4?: string;
  brand?: string; // visa, master, debvisa…
  type?: string; // credit_card / debit_card
  installments?: number;
  approvedAt?: string;
  amount?: number; // centavos
};

const BRANDS: Record<string, string> = {
  visa: "Visa",
  debvisa: "Visa",
  master: "Mastercard",
  debmaster: "Mastercard",
  amex: "American Express",
  carnet: "Carnet",
  debcarnet: "Carnet",
  maestro: "Maestro",
};
/** "Visa crédito •••• 1234" */
export function cardLabel(c: CardInfo): string {
  const brand = BRANDS[String(c.brand || "").toLowerCase()] || (c.brand ? String(c.brand).replace(/^\w/, (x) => x.toUpperCase()) : "Tarjeta");
  const kind = /debit|prepaid/.test(String(c.type || "")) || /^deb/.test(String(c.brand || "")) ? " débito" : /credit/.test(String(c.type || "")) ? " crédito" : "";
  return `${brand}${kind}${c.last4 ? ` •••• ${c.last4}` : ""}`;
}

/** Datos de la tarjeta que trae una order de Point (sirven aunque falle la consulta del pago). */
export function cardFromOrder(order: any): CardInfo {
  const pay = order?.transactions?.payments?.[0] ?? {};
  const amount = Math.round(Number(pay.paid_amount || pay.amount || 0) * 100);
  return {
    operation: pay.reference_id ? String(pay.reference_id) : undefined,
    last4: pay.card?.last_digits || undefined,
    brand: pay.payment_method?.id || undefined,
    type: pay.payment_method?.type || undefined,
    installments: Number(pay.payment_method?.installments) || undefined,
    amount: amount || undefined,
  };
}
/** Datos de la tarjeta del detalle del pago (GET /v1/payments/{id}). */
export function cardFromPayment(payment: any): CardInfo {
  const amount = Math.round(Number(payment?.transaction_amount || 0) * 100);
  return {
    operation: payment?.id ? String(payment.id) : undefined,
    authorization: payment?.authorization_code || undefined,
    last4: payment?.card?.last_four_digits || undefined,
    brand: payment?.payment_method_id || undefined,
    type: payment?.payment_type_id || undefined,
    installments: Number(payment?.installments) || undefined,
    approvedAt: payment?.date_approved || payment?.date_created || undefined,
    amount: amount || undefined,
  };
}
/** Combina datos sin perder lo que ya se tenía. */
export function mergeCard(a: CardInfo | undefined, b: CardInfo | undefined): CardInfo {
  const out: CardInfo = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) if (v !== undefined && v !== null && v !== "") (out as any)[k] = v;
  return out;
}

const folioOf = (v: Row) => v.folio || String(v.id).slice(-8).toUpperCase();
/**
 * 2.0 · El cliente ve cada producto ya con la comisión, el subtotal, el
 * descuento (si hay) y el total. La comisión nunca aparece aparte.
 */
const linesOf = (v: Row) => {
  const c = customerView(v);
  return [
    ...c.lines.map((l) => `${l.qty} × ${l.name}${l.total !== null ? `  ${money(l.total)}` : ""}`),
    "",
    `Subtotal: ${money(c.subtotal)}`,
    ...(c.discount > 0 ? [`Descuento: −${money(c.discount)}`] : []),
  ];
};
const tidy = (rows: string[]) => rows.filter((x, i, a) => x !== "" || (i > 0 && a[i - 1] !== "")).join("\n").trim();

/** Comprobante general de la venta. */
export function saleReceiptText(v: Row): string {
  const pays = (v.movements as Row[]).filter((x) => x.kind === "sale").map((x) => (x.amount < 0 ? `devolución ${money(-x.amount)}` : `${money(x.amount)} · ${x.account}`));
  const balance = Math.max(0, v.total - v.paid);
  return tidy([
    `*${STORE_NAME}*`,
    `Comprobante ${folioOf(v)}`,
    fmtDateTime(v.dateOnly || v.created, false),
    v.customer ? `Cliente: ${v.customer}` : "",
    "",
    ...linesOf(v),
    `*Total: ${money(v.total)}*`,
    pays.length ? `Pagado: ${pays.join(", ")}` : "",
    balance ? `Saldo pendiente: ${money(balance)}` : "Pagado completo ✅",
    "",
    "¡Gracias por tu compra!",
  ]);
}

/** Comprobante de un cobro con tarjeta hecho en la terminal (venta o abono). */
export function cardReceiptText(v: Row, entry: Row): string {
  const c: CardInfo = entry.card || {};
  const amount = c.amount || entry.amount || 0;
  const isAbono = entry.kind === "abono";
  const balance = Math.max(0, v.total - v.paid);
  return tidy([
    `*${STORE_NAME}*`,
    "*Comprobante de pago con tarjeta* 💳",
    fmtDateTime(c.approvedAt || entry.at),
    `Folio ${folioOf(v)}${isAbono ? " · abono" : ""}`,
    v.customer ? `Cliente: ${v.customer}` : "",
    "",
    `Monto pagado: *${money(amount)}*`,
    cardLabel(c),
    c.installments && c.installments > 1 ? `${c.installments} meses` : "",
    c.authorization ? `Autorización: ${c.authorization}` : "",
    c.operation ? `Operación Mercado Pago: ${c.operation}` : `Orden Mercado Pago: ${entry.orderId}`,
    "Cobrado en terminal Mercado Pago Point",
    "",
    ...(isAbono ? [`Total de la venta: ${money(v.total)}`, balance ? `Saldo pendiente: ${money(balance)}` : "Venta pagada completa ✅"] : ["Productos:", ...linesOf(v), `Total: ${money(v.total)}`]),
    "",
    "¡Gracias por tu compra!",
  ]);
}

/** Cobros con terminal de una venta (incluye ventas de versiones anteriores que solo guardaban la order). */
export function terminalPayments(v: Row): Row[] {
  const list: Row[] = Array.isArray(v.mpPayments) ? [...v.mpPayments] : [];
  if (v.mpOrderId && !list.some((x) => x.orderId === v.mpOrderId)) list.unshift({ orderId: v.mpOrderId, paymentId: v.mpPaymentId || "", kind: "venta", at: v.created });
  return list.map((x, i) => ({ ...x, kind: x.kind || (i === 0 && x.orderId === v.mpOrderId ? "venta" : "abono") }));
}

/** Número para wa.me: 10 dígitos de México → 52 + número. */
export function whatsappNumber(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 ? "52" + digits : digits;
}
export const validWhatsapp = (phone: string) => /^\d{11,15}$/.test(whatsappNumber(phone));
