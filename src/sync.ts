// Sincronización del teléfono del dueño (caja central) con la base en línea:
// publica catálogo, existencias, clientes y ajustes para los vendedores, y
// registra aquí las ventas que ellos mandan.
import { saleSegment, type Business, type Row } from "./business";
import { STORE_NAME } from "./theme";
import { Cloud, CloudError } from "./cloud";

export type SellerAccounts = {
  Efectivo?: string;
  Transferencia?: string;
  Tarjeta?: string;
};
export type RemoteSale = {
  id: string;
  seller_id: string;
  seller_name: string;
  created_at: string;
  items: { productId: string; name?: string; qty: number; price?: number }[];
  total: number;
  method: "Efectivo" | "Transferencia" | "Tarjeta";
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  note: string;
  mp: Row | null;
  transfer_id?: string | null;
  status: string;
  sale_id: string | null;
  error: string | null;
};
export type SyncResult = {
  applied: number;
  conflicts: number;
  published: number;
  customers: number;
  at: string;
  errors: string[];
};

const hash = (x: unknown) => {
  const s = JSON.stringify(x);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
function chunks<T>(list: T[], n: number): T[][] {
  return Array.from({ length: Math.ceil(list.length / n) }, (_, i) =>
    list.slice(i * n, i * n + n),
  );
}
export const folioForRemote = (id: string) =>
  "V-" +
  id
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(-6)
    .toUpperCase();

/** Se marca cuando la base en línea aún no tiene el schema 2.1 (el dueño ve el aviso). */
export const NEEDS_SCHEMA_21 = "cloudNeedsSchema21";
export const SCHEMA_21_NOTE =
  "Tu base en línea es de una versión anterior: tus vendedores aún no ven las promociones ni la categoría y el lector de códigos. En Supabase → SQL Editor vuelve a ejecutar todo supabase/schema.sql (2.1).";
export const NEEDS_SCAN_SCHEMA = "cloudNeedsScanSchema222";
export const SCAN_SCHEMA_NOTE =
  "Para compartir códigos adicionales, presentación y fotos en línea con tus vendedores, ejecuta supabase/migrations/2.2.2_lector.sql en Supabase y sincroniza. El lector del dueño ya funciona.";
/** Publica lo que los vendedores necesitan ver. Solo sube lo que cambió. */
export async function publish(
  b: Business,
  cloud: Cloud,
  terminal: { terminalId: string; enabled: boolean } | null,
): Promise<number> {
  const key = "cloudPub";
  const state = b.setting(key, null) as Row | null;
  const pub: Row =
    state && state.url === cloud.cfg.url
      ? state
      : { url: cloud.cfg.url, products: {}, customers: {}, config: {} };
  let sent = 0;
  const products = b.stock().map((p) => ({
    product_id: p.id,
    sku: p.sku || "",
    name: p.name,
    brand: p.brand || "",
    category: p.category || "",
    price: p.price,
    available: Math.max(0, p.inventoryKnown ? p.available : 0),
    image_key: p.imageKey || p.sku || "",
    archived: !!p.archived,
    // 2.1: categoría de venta (promociones) y código de barras (lector del vendedor).
    segment: saleSegment(p),
    barcode: String(p.barcode || ""),
    scan_data: {
      barcodeAliases: Array.isArray(p.barcodeAliases) ? p.barcodeAliases : [],
      presentation: p.presentation || "",
      flavor: p.flavor || "",
      presentationUnconfirmed:
        /confirmar.*(presentaci[oó]n|contenido)|por confirmar/i.test(
          String(p.notes || "") + " " + String(p.presentation || ""),
        ),
      imageUri: /^https:\/\//i.test(p.cleanImageUri || p.imageUri || "")
        ? p.cleanImageUri || p.imageUri
        : "",
      lookupSource: p.lookupSource || "",
      lookupSourceUrl: p.lookupSourceUrl || "",
    },
  }));
  // Servidor sin el schema 2.1 (catálogo sin categoría de venta ni código de barras): se publica
  // sin esas dos columnas para no detener la sincronización y se avisa al dueño. En cuanto la
  // base se actualiza, se vuelve a publicar todo el catálogo completo.
  let legacy = !!pub.legacy;
  if (legacy) {
    try {
      await cloud.select("catalog", "select=segment,barcode&limit=1");
      legacy = false;
      pub.products = {};
    } catch {}
  }
  let scanData = !legacy && pub.scanData === true;
  if (!legacy && !scanData) {
    try {
      await cloud.select("catalog", "select=scan_data&limit=1");
      scanData = true;
      pub.products = {};
    } catch {}
  }
  const changed = products.filter(
    (p) => pub.products[p.product_id] !== hash(p),
  );
  const send = (part: Row[]) =>
    part.map(({ segment, barcode, scan_data, ...p }) => ({
      ...p,
      ...(legacy ? {} : { segment, barcode }),
      ...(scanData ? { scan_data } : {}),
      updated_at: new Date().toISOString(),
    }));
  for (const part of chunks(changed, 200)) {
    try {
      await cloud.insert("catalog", send(part), true);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (scanData && /scan_data/.test(String(err?.message || "")))
        scanData = false;
      else {
        if (
          legacy ||
          !(
            err?.code === "PGRST204" ||
            /segment|barcode/.test(String(err?.message || ""))
          )
        )
          throw e;
        legacy = true;
        scanData = false;
      }
      await cloud.insert("catalog", send(part), true);
    }
    for (const p of part) pub.products[p.product_id] = hash(p);
    sent += part.length;
  }
  if (legacy) pub.legacy = true;
  else delete pub.legacy;
  b.setSetting(NEEDS_SCHEMA_21, legacy || null);
  pub.scanData = scanData;
  b.setSetting(NEEDS_SCAN_SCHEMA, !scanData || null);
  const customers = b
    .customers()
    .filter((c) => !c.archived)
    .map((c) => ({ id: c.id, name: c.name, phone: c.phone || "" }));
  const changedCustomers = customers.filter(
    (c) => pub.customers[c.id] !== hash(c),
  );
  for (const part of chunks(changedCustomers, 200)) {
    await cloud.insert(
      "customers",
      part.map((c) => ({ ...c, updated_at: new Date().toISOString() })),
      true,
    );
    for (const c of part) pub.customers[c.id] = hash(c);
    sent += part.length;
  }
  const config: Row = {
    fee: { bps: b.feeBps() },
    promos: { list: b.promos() },
    terminal: terminal || { terminalId: "", enabled: false },
    store: { name: STORE_NAME },
    transfer: { accounts: b.setting("transferAccounts", []) },
  };
  for (const [k, value] of Object.entries(config)) {
    if (pub.config[k] === hash(value)) continue;
    await cloud.insert(
      "config",
      [{ key: k, value, updated_at: new Date().toISOString() }],
      true,
    );
    pub.config[k] = hash(value);
    sent++;
  }
  b.setSetting(key, pub);
  return sent;
}

/** Trae al teléfono del dueño los clientes que dieron de alta los vendedores. */
export async function pullCustomers(
  b: Business,
  cloud: Cloud,
): Promise<number> {
  const rows: Row[] = await cloud.select(
    "customers",
    `select=id,name,phone,created_by&created_by=neq.${cloud.userId}`,
  );
  let n = 0;
  for (const r of rows) if (b.importCustomer(r.id, r.name, r.phone || "")) n++;
  return n;
}

/**
 * Registra las ventas pendientes de los vendedores. Cada una se aplica una sola
 * vez (se recuerda el id remoto); si no se puede (sin existencias, cuenta sin
 * configurar, cobro no aprobado) queda en "conflicto" con el motivo.
 */
export async function pullSales(
  b: Business,
  cloud: Cloud,
  accounts: SellerAccounts,
  verifyCard?: (
    orderId: string,
  ) => Promise<{ approved: boolean; amount: number } | null>,
  onApplied?: (saleId: string, row: RemoteSale) => void,
): Promise<{ applied: number; conflicts: number }> {
  const rows: RemoteSale[] = await cloud.select(
    "sales",
    "select=*&status=eq.pendiente&order=created_at.asc",
  );
  let applied = 0,
    conflicts = 0;
  for (const row of rows) {
    const done = b.setting("remote:" + row.id, null);
    if (done) {
      await cloud.update("sales", `id=eq.${encodeURIComponent(row.id)}`, {
        status: "aplicada",
        sale_id: done,
        error: null,
        applied_at: new Date().toISOString(),
      });
      continue;
    }
    try {
      // Transferencia: la cuenta ligada a los datos a los que pagó el cliente (Banamex, Mercado Pago…).
      const linked =
        row.method === "Transferencia" && row.transfer_id
          ? (b.setting("transferAccounts", []) as Row[]).find(
              (t) => t.id === row.transfer_id,
            )?.accountId
          : null;
      const accountId =
        linked && b.accounts().some((a) => a.id === linked)
          ? linked
          : accounts[row.method];
      if (!accountId)
        throw new Error(
          `Elige en Equipo la cuenta para ventas con ${row.method.toLowerCase()} de vendedores.`,
        );
      if (row.method === "Tarjeta") {
        if (!row.mp?.orderId)
          throw new Error("Venta con tarjeta sin cobro de terminal.");
        if (verifyCard) {
          const v = await verifyCard(String(row.mp.orderId));
          if (v && !v.approved)
            throw new Error(
              "El cobro con tarjeta no aparece aprobado en Mercado Pago.",
            );
          if (v && v.amount && v.amount !== row.total)
            throw new Error(
              `El cobro en Mercado Pago (${(v.amount / 100).toFixed(2)}) no coincide con la venta.`,
            );
        }
      }
      const saleId = b.applyRemoteSale(row, accountId);
      applied++;
      onApplied?.(saleId, row);
    } catch (e) {
      conflicts++;
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof CloudError) throw e;
      if (row.error !== message || row.status !== "conflicto")
        await cloud.update("sales", `id=eq.${encodeURIComponent(row.id)}`, {
          status: "conflicto",
          error: message,
        });
    }
  }
  return { applied, conflicts };
}

/** Marca como aplicadas las ventas registradas en este teléfono (después de publicar existencias). */
export async function confirmApplied(b: Business, cloud: Cloud, ids: string[]) {
  for (const id of ids) {
    const saleId = b.setting("remote:" + id, null);
    if (saleId)
      await cloud.update("sales", `id=eq.${encodeURIComponent(id)}`, {
        status: "aplicada",
        sale_id: saleId,
        error: null,
        applied_at: new Date().toISOString(),
      });
  }
}

/** Un ciclo completo: clientes nuevos → ventas → existencias publicadas → confirmar. */
export async function syncOwner(
  b: Business,
  cloud: Cloud,
  opts: {
    accounts: SellerAccounts;
    terminal: { terminalId: string; enabled: boolean } | null;
    verifyCard?: (
      orderId: string,
    ) => Promise<{ approved: boolean; amount: number } | null>;
    onApplied?: (saleId: string, row: RemoteSale) => void;
  },
): Promise<SyncResult> {
  const errors: string[] = [];
  // 1.7: la comisión ya va en el precio. Aunque el servidor aún no tenga el
  // schema 1.7, ningún vendedor debe sumarla al cobrar (evita cobros que no cuadran).
  if (!b.setting("passFeeOff17", false))
    try {
      await cloud.update("members", "role=eq.seller&pass_fee=eq.true", {
        pass_fee: false,
      });
      b.setSetting("passFeeOff17", true);
    } catch {}
  const customers = await pullCustomers(b, cloud);
  const appliedIds: string[] = [];
  const r = await pullSales(
    b,
    cloud,
    opts.accounts,
    opts.verifyCard,
    (saleId, row) => {
      appliedIds.push(row.id);
      opts.onApplied?.(saleId, row);
    },
  );
  // Primero se publican las existencias ya descontadas y luego se confirma la venta:
  // así el vendedor nunca ve el inventario "de más".
  const published = await publish(b, cloud, opts.terminal);
  await confirmApplied(b, cloud, appliedIds);
  const result = {
    applied: r.applied,
    conflicts: r.conflicts,
    published,
    customers,
    at: new Date().toISOString(),
    errors,
  };
  b.setSetting("cloudLastSync", result);
  return result;
}
