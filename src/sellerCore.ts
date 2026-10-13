// Lógica del teléfono del vendedor (sin pantalla): existencias disponibles,
// cola de ventas sin internet y comprobantes.
import { CARD_FEE_BPS, type Business, type Row } from "./business";
import { Cloud, CloudError } from "./cloud";
import { folioForRemote } from "./sync";

export type SellerCache = { catalog: Row[]; customers: Row[]; config: Row; at: string; fetchedAt?: number; me?: Row };
/** Venta ya enviada que el catálogo descargado quizá aún no descuenta. */
export type SentMark = { id: string; at: number; items: { productId: string; qty: number }[] };
export type SellerSale = {
  id: string;
  seller_name: string;
  created_at: string;
  items: { productId: string; name: string; qty: number; price: number }[];
  total: number;
  method: "Efectivo" | "Transferencia" | "Tarjeta";
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  note: string;
  mp: Row | null;
  status?: string;
  error?: string | null;
  sale_id?: string | null;
  /** Cliente dado de alta en esta venta (el servidor lo crea). */
  new_customer?: boolean;
  /** Transferencia: cuenta de la tienda a la que pagó el cliente (Mercado Pago, Banamex…). */
  transfer_id?: string | null;
  /** Cuenta que hizo la venta: la cola solo la envía esa misma cuenta. */
  user_id?: string | null;
  /** Referencia del cobro en la terminal (se reusa al reintentar: no duplica el cobro). */
  mp_ref?: string;
  /** 1.9: comisión (puntos base) con la que se calculó el total: precio de lista + comisión. */
  fee_bps?: number;
  /** 2.1: descuento de promociones (en tus precios) y sus nombres, para el comprobante. */
  promo?: number;
  promo_names?: string[];
};

let seq = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const startOfToday = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
};

/**
 * Descarga catálogo (ya descontando lo apartado por TODOS los vendedores),
 * los clientes que este vendedor dio de alta y los ajustes. Se guardan para
 * usarlos sin internet. El vendedor no descarga la lista completa de clientes.
 */
export async function refreshCache(b: Business, cloud: Cloud): Promise<SellerCache> {
  const started = Date.now();
  const [catalog, customers, config, me, transfer] = await Promise.all([
    cloud.rpc("seller_catalog", {}),
    cloud.rpc("seller_customers", { p_query: "" }),
    cloud.select("config", "select=key,value"),
    cloud.select("members", `select=name,methods,active,transfer_ids&user_id=eq.${cloud.userId}`).catch(() => []),
    // 2.1: solo los datos de transferencia asignados a este vendedor (servidor anterior: null).
    cloud.rpc("seller_transfer_accounts", {}).catch(() => null),
  ]);
  const cfg: Row = Object.fromEntries((config as Row[]).map((r) => [r.key, r.value]));
  if (Array.isArray(transfer)) cfg.transfer = { accounts: transfer };
  const cache: SellerCache = { catalog, customers, config: cfg, at: new Date().toISOString(), fetchedAt: started, me: (me as Row[])[0] };
  b.setSetting("sellerCache", cache);
  // Lo enviado antes de esta descarga ya viene descontado por el servidor.
  b.setSetting("sellerSent", sentMarks(b).filter((m) => m.at >= started));
  return cache;
}
export function cachedData(b: Business): SellerCache | null {
  const c: SellerCache | null = b.setting("sellerCache", null);
  // Copias de la 1.1 traían los teléfonos completos de los clientes: se quitan.
  if (c && c.fetchedAt === undefined && c.customers?.some((x) => x.phone)) {
    const clean = { ...c, fetchedAt: 0, customers: c.customers.map((x) => ({ id: x.id, name: x.name, phone_hint: String(x.phone || "").length >= 4 ? "•••" + String(x.phone).slice(-4) : "" })) };
    b.setSetting("sellerCache", clean);
    return clean;
  }
  return c;
}
export const queue = (b: Business): SellerSale[] => b.setting("sellerQueue", []);
export const sentMarks = (b: Business): SentMark[] => b.setting("sellerSent", []);
/** Ventas que el servidor no aceptó (se muestran al vendedor con el motivo). */
export const rejectedSales = (b: Business): SellerSale[] => b.setting("sellerRejected", []);
/** Búsqueda de clientes en línea: nombre y solo los últimos 4 dígitos del teléfono. */
export async function searchCustomers(cloud: Cloud, query: string): Promise<Row[]> {
  return cloud.rpc("seller_customers", { p_query: query.trim() });
}
/**
 * Revisión del servidor antes de cobrar: total con precios actuales, comisión y faltantes.
 * 2.0: total = lo que paga el cliente (absorbe la comisión) y subtotal = tus
 * precios. `pricing` es "grossup" desde el schema 2.0 (antes no se puede cobrar).
 */
export async function checkSale(cloud: Cloud, items: { productId: string; qty: number }[]): Promise<{ ok: boolean; total: number; card_total: number; subtotal: number; commission: number | null; fee_bps: number | null; pricing: string | null; promo: number | null; short: Row[]; error?: string }> {
  const r = await cloud.rpc("check_sale", { p_items: items.map((i) => ({ productId: i.productId, qty: i.qty })) });
  const total = Number(r?.total || 0);
  // Servidor anterior a 1.3.1 (sin card_total): con tarjeta se cobra el total de lista.
  return {
    ok: !!r?.ok,
    total,
    card_total: r?.card_total == null ? total : Number(r.card_total),
    subtotal: r?.subtotal == null ? total : Number(r.subtotal),
    commission: r?.commission == null ? null : Number(r.commission),
    fee_bps: r?.fee_bps == null ? null : Number(r.fee_bps),
    pricing: typeof r?.pricing === "string" ? r.pricing : null,
    // 2.1: el servidor manda el descuento de promociones (antes: null = servidor sin promociones).
    promo: r?.promo == null ? null : Number(r.promo),
    short: Array.isArray(r?.short) ? r.short : [],
    error: r?.error,
  };
}
/** Teléfono completo del cliente, solo para el comprobante de una venta propia reciente. */
export async function receiptPhone(cloud: Cloud, saleId: string): Promise<string> {
  const r = await cloud.rpc("receipt_phone", { p_sale_id: saleId });
  return typeof r === "string" ? r : "";
}

/** Ventas de hoy de este vendedor (en línea) más las que aún no se envían. */
export async function mySalesToday(b: Business, cloud: Cloud): Promise<SellerSale[]> {
  const remote: SellerSale[] = await cloud.select("sales", `select=*&seller_id=eq.${cloud.userId}&created_at=gte.${encodeURIComponent(startOfToday())}&order=created_at.desc`);
  b.setSetting("sellerToday", { at: new Date().toISOString(), day: startOfToday(), rows: remote });
  return remote;
}
export function cachedToday(b: Business): SellerSale[] {
  const t = b.setting("sellerToday", null);
  return t && t.day === startOfToday() ? t.rows : [];
}

/**
 * Unidades que el vendedor puede vender: lo que publicó el servidor (ya sin lo
 * apartado por todos) menos lo que este teléfono vendió después de descargarlo.
 */
export function availableFor(productId: string, cache: SellerCache | null, pending: SellerSale[], sent: SentMark[] = []): number {
  const p = cache?.catalog.find((x) => x.product_id === productId);
  if (!p) return 0;
  const sentIds = new Set(sent.map((m) => m.id));
  const used =
    pending.filter((q) => !sentIds.has(q.id)).reduce((n, s) => n + s.items.filter((i) => i.productId === productId).reduce((m, i) => m + i.qty, 0), 0) +
    sent.reduce((n, m) => n + m.items.filter((i) => i.productId === productId).reduce((k, i) => k + i.qty, 0), 0);
  return Math.max(0, Number(p.available || 0) - used);
}

/** Guarda la venta en la cola y trata de enviarla. Nunca se pierde: si no hay internet se reintenta. */
export async function recordSale(b: Business, cloud: Cloud | null, sale: SellerSale): Promise<"sent" | "queued" | "rejected"> {
  b.setSetting("sellerQueue", [...queue(b), { ...sale, user_id: sale.user_id ?? cloud?.userId ?? null }]);
  if (!cloud) return "queued";
  const r = await flushQueue(b, cloud);
  return r.sent.includes(sale.id) ? "sent" : r.rejected.includes(sale.id) ? "rejected" : "queued";
}
/** Errores que se arreglan solos (internet, sesión, servidor, permiso en pausa): la venta se queda en la cola. */
function transient(e: unknown) {
  if (!(e instanceof CloudError)) return true;
  // Solo un rechazo explícito de la base (400/409/422) es definitivo; lo demás
  // (sin internet, sesión, función aún no instalada, servidor) se reintenta.
  if (![400, 409, 422].includes(e.status)) return true;
  return /no está autorizado|pausa/i.test(e.message);
}
/**
 * Envía la cola con submit_sale: el servidor pone precios, total y hora, revisa
 * existencias y (con tarjeta) que el cobro sea de este vendedor y esté aprobado.
 */
export async function flushQueue(b: Business, cloud: Cloud): Promise<{ sent: string[]; failed: string[]; rejected: string[]; error?: string }> {
  const sent: string[] = [],
    failed: string[] = [],
    rejected: string[] = [];
  const results: Record<string, Row> = {};
  let error: string | undefined;
  for (const sale of queue(b)) {
    // Ventas guardadas sin internet por otra cuenta en este teléfono: solo las envía esa cuenta.
    if (sale.user_id && cloud.userId && sale.user_id !== cloud.userId) continue;
    try {
      const r = await cloud.rpc("submit_sale", {
        p_id: sale.id,
        p_items: sale.items.map((i) => ({ productId: i.productId, qty: i.qty })),
        p_method: sale.method,
        p_customer_id: sale.new_customer ? null : sale.customer_id,
        p_new_customer: sale.new_customer ? { id: sale.customer_id, name: sale.customer_name, phone: sale.customer_phone } : null,
        p_order_id: sale.mp?.orderId || null,
        p_client_time: sale.created_at,
        p_note: sale.note || "",
        p_client_total: sale.total,
        ...(sale.method === "Transferencia" && sale.transfer_id ? { p_transfer_id: sale.transfer_id } : {}),
      });
      sent.push(sale.id);
      results[sale.id] = r || {};
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (transient(e)) {
        failed.push(sale.id);
        break;
      }
      rejected.push(sale.id);
      results[sale.id] = { status: "rechazada", error };
    }
  }
  if (sent.length || rejected.length) {
    const now = Date.now();
    const done = queue(b).filter((s) => sent.includes(s.id) || rejected.includes(s.id));
    b.setSetting("sellerQueue", queue(b).filter((s) => !sent.includes(s.id) && !rejected.includes(s.id)));
    // Lo entregado sigue apartado aunque el dueño lo esté revisando (conflicto): solo se libera si se rechaza.
    const marks = done.filter((s) => sent.includes(s.id) && results[s.id]?.status !== "rechazada").map((s) => ({ id: s.id, at: now, items: s.items.map((i) => ({ productId: i.productId, qty: i.qty })) }));
    if (marks.length) b.setSetting("sellerSent", [...sentMarks(b), ...marks]);
    const bad = done.filter((s) => rejected.includes(s.id)).map((s) => ({ ...s, status: "rechazada", error: results[s.id]?.error || "" }));
    if (bad.length) b.setSetting("sellerRejected", [...bad, ...rejectedSales(b)].slice(0, 50));
  }
  return { sent, failed, rejected, error };
}

/** Convierte la venta del vendedor en el formato de comprobante de la app. */
export function receiptSale(s: SellerSale): Row {
  // Tus precios por renglón; el comprobante los muestra ya con la comisión que absorbe el cliente.
  const lines = s.items.map((i) => ({ qty: i.qty, name: i.name, unitPrice: i.price, discount: 0, total: i.price * i.qty }));
  const list = lines.reduce((n, l) => n + l.total, 0);
  // 2.1: con promoción, tu precio es la lista menos el descuento; la comisión va encima de eso.
  const promo = Number.isSafeInteger(s.promo) && (s.promo as number) > 0 ? (s.promo as number) : 0;
  const base = Math.max(0, list - promo);
  const fee = Math.max(0, s.total - base);
  return {
    ...(fee > 0 ? { commission: fee, basePrice: base, commissionBps: Number.isSafeInteger(s.fee_bps) ? s.fee_bps : CARD_FEE_BPS } : {}),
    id: s.id,
    folio: folioForRemote(s.id),
    created: s.created_at,
    customer: s.customer_name,
    lines,
    movements: [{ kind: "sale", amount: s.total, account: s.method }],
    total: s.total,
    paid: s.total,
  };
}
export const statusText = (s: SellerSale, queued: boolean) =>
  queued ? "Sin enviar" : s.status === "aplicada" ? "Registrada" : s.status === "conflicto" ? "En revisión del dueño" : s.status === "rechazada" ? "No se registró" : "Enviada";

// ---------- Formas de pago y cierre de caja ----------
export const ALL_METHODS = ["Tarjeta", "Efectivo", "Transferencia"] as const;
export type Method = (typeof ALL_METHODS)[number];
/** Formas de pago que el dueño le permite a este vendedor (la tarjeta solo si la terminal está habilitada). */
export function allowedMethods(cache: SellerCache | null): Method[] {
  const mine: string[] = Array.isArray(cache?.me?.methods) ? cache!.me!.methods : [...ALL_METHODS];
  const terminalOn = !!cache?.config?.terminal?.terminalId && cache?.config?.terminal?.enabled !== false;
  return ALL_METHODS.filter((m) => mine.includes(m) && (m !== "Tarjeta" || terminalOn));
}
/** Por defecto se cobra con la terminal; si no está permitida, la primera forma permitida. */
export const defaultMethod = (cache: SellerCache | null): Method | null => allowedMethods(cache)[0] ?? null;

export type ClosingSummary = { card_fee?: number; sales_count: number; units: number; total: number; review_count: number; by_method: Record<string, number>; items: { productId: string; name: string; qty: number; total: number }[]; period_from?: string | null; period_to?: string | null };
export type Closing = ClosingSummary & { id: string; seller_name: string; created_at: string };
/** Lo vendido desde el último cierre (lo calcula el servidor). */
export const closingPreview = (cloud: Cloud): Promise<ClosingSummary> => cloud.rpc("register_preview", {});
/** Cierra la caja: el corte queda guardado en el servidor y nadie lo puede cambiar. */
export async function closeRegister(b: Business, cloud: Cloud): Promise<Closing> {
  const pending = queue(b).length;
  if (pending) throw new Error(`Tienes ${pending} ${pending === 1 ? "venta sin enviar" : "ventas sin enviar"}. Conéctate a internet y toca Actualizar antes de cerrar la caja.`);
  const c: Closing = await cloud.rpc("close_register", {});
  b.setSetting("sellerClosings", [c, ...cachedClosings(b)].slice(0, 30));
  return c;
}
export async function myClosings(b: Business, cloud: Cloud): Promise<Closing[]> {
  const rows: Closing[] = await cloud.select("seller_closings", `select=*&seller_id=eq.${cloud.userId}&order=created_at.desc&limit=30`);
  b.setSetting("sellerClosings", rows);
  return rows;
}
export const cachedClosings = (b: Business): Closing[] => b.setting("sellerClosings", []);

/** Datos de transferencia que el dueño le asignó a este vendedor. */
export function myTransferAccounts(cache: SellerCache | null): Row[] {
  const all: Row[] = Array.isArray(cache?.config?.transfer?.accounts) ? cache!.config.transfer.accounts : [];
  const ids = cache?.me?.transfer_ids;
  return Array.isArray(ids) ? all.filter((a) => ids.includes(a.id)) : all;
}

// ---------- 2.0.3 · Terminal en modo normal: cobro directo en la terminal ----------
export type FoundPayment = { id: string; amount: number; date: string; last4: string; brand: string; type: string; installments: number; authorization: string };
const terminalError = (r: { status: number; data: any }) =>
  new CloudError(
    r.data?.code === "bad_action"
      ? "Falta actualizar la función cobro-terminal en Supabase (versión 2.0.3) para cobrar con la terminal en modo normal. Avísale al dueño."
      : r.data?.message || r.data?.errors?.[0]?.message || `No se pudo consultar Mercado Pago (${r.status}).`,
    r.status,
    r.data?.code || "",
  );
/** Pagos aprobados de la terminal por ese monto, desde que empezó el cobro, que nadie ha usado. */
export async function findTerminalPayments(cloud: Cloud, amount: number, since: string): Promise<{ payments: FoundPayment[]; other: number }> {
  const r = await cloud.invoke("cobro-terminal", { action: "buscar_pago", amount, since });
  if (!r.ok) throw terminalError(r);
  return { payments: Array.isArray(r.data?.payments) ? r.data.payments : [], other: Number(r.data?.other || 0) };
}
/** Liga el pago a este vendedor (el servidor lo revisa); después la venta se registra con ese cobro. */
export async function claimTerminalPayment(cloud: Cloud, paymentId: string, amount: number): Promise<{ orderId: string; referenceId: string; payment: FoundPayment }> {
  const r = await cloud.invoke("cobro-terminal", { action: "usar_pago", paymentId, amount });
  if (!r.ok) throw terminalError(r);
  return r.data;
}
