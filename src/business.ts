// Money is always integer MXN cents. SQLite transactions protect each operation.
export interface DB {
  execSync(sql: string): void;
  runSync(sql: string, ...args: any[]): any;
  getAllSync<T = any>(sql: string, ...args: any[]): T[];
  getFirstSync<T = any>(sql: string, ...args: any[]): T | null;
  withTransactionSync(task: () => void): void;
}
export type Row = Record<string, any>;
const schema = `
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, sku TEXT UNIQUE NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>=0), minimum INTEGER NOT NULL CHECK(minimum>=0));
CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL,notes TEXT NOT NULL,stage TEXT NOT NULL,nextDate TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY,name TEXT NOT NULL,channel TEXT NOT NULL,code TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS lots(id TEXT PRIMARY KEY,productId TEXT NOT NULL REFERENCES products(id),label TEXT NOT NULL,expires TEXT NOT NULL,cost INTEGER NOT NULL CHECK(cost>=0),qty INTEGER NOT NULL CHECK(qty>=0));
CREATE TABLE IF NOT EXISTS bundles(id TEXT PRIMARY KEY,name TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0));
CREATE TABLE IF NOT EXISTS bundle_items(bundleId TEXT NOT NULL REFERENCES bundles(id),productId TEXT NOT NULL REFERENCES products(id),qty INTEGER NOT NULL CHECK(qty>0),PRIMARY KEY(bundleId,productId));
CREATE TABLE IF NOT EXISTS sales(id TEXT PRIMARY KEY,created TEXT NOT NULL,customerId TEXT REFERENCES customers(id),campaignId TEXT REFERENCES campaigns(id),channel TEXT NOT NULL,total INTEGER NOT NULL CHECK(total>=0),cost INTEGER NOT NULL CHECK(cost>=0),status TEXT NOT NULL CHECK(status IN ('confirmed','cancelled')));
CREATE TABLE IF NOT EXISTS sale_lines(id TEXT PRIMARY KEY,saleId TEXT NOT NULL REFERENCES sales(id),productId TEXT NOT NULL REFERENCES products(id),qty INTEGER NOT NULL CHECK(qty>0),name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS allocations(id TEXT PRIMARY KEY,lineId TEXT NOT NULL REFERENCES sale_lines(id),lotId TEXT NOT NULL REFERENCES lots(id),qty INTEGER NOT NULL CHECK(qty>0),cost INTEGER NOT NULL CHECK(cost>=0));
CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,created TEXT NOT NULL,accountId TEXT NOT NULL REFERENCES accounts(id),amount INTEGER NOT NULL,kind TEXT NOT NULL,ref TEXT,note TEXT NOT NULL,campaignId TEXT REFERENCES campaigns(id));
CREATE TABLE IF NOT EXISTS stock_moves(id TEXT PRIMARY KEY,created TEXT NOT NULL,lotId TEXT NOT NULL REFERENCES lots(id),qty INTEGER NOT NULL,kind TEXT NOT NULL,ref TEXT,note TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,created TEXT NOT NULL,action TEXT NOT NULL,ref TEXT NOT NULL,note TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ledger_account ON ledger(accountId);
CREATE INDEX IF NOT EXISTS lots_product ON lots(productId);
CREATE INDEX IF NOT EXISTS sales_date ON sales(created);
CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE,kind TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL,notes TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN (0,1)));
CREATE TABLE IF NOT EXISTS locations(id TEXT PRIMARY KEY,name TEXT NOT NULL,companyId TEXT REFERENCES companies(id),kind TEXT NOT NULL,address TEXT NOT NULL,notes TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN (0,1)));
CREATE TABLE IF NOT EXISTS relations(entityType TEXT NOT NULL,entityId TEXT NOT NULL,companyId TEXT REFERENCES companies(id),locationId TEXT REFERENCES locations(id),PRIMARY KEY(entityType,entityId));
CREATE TABLE IF NOT EXISTS lot_locations(lotId TEXT PRIMARY KEY REFERENCES lots(id),locationId TEXT NOT NULL REFERENCES locations(id));
CREATE INDEX IF NOT EXISTS sale_lines_sale ON sale_lines(saleId);
CREATE INDEX IF NOT EXISTS allocations_line ON allocations(lineId);
CREATE INDEX IF NOT EXISTS allocations_lot ON allocations(lotId);
CREATE INDEX IF NOT EXISTS ledger_ref ON ledger(ref);
CREATE INDEX IF NOT EXISTS stock_moves_lot ON stock_moves(lotId);
CREATE INDEX IF NOT EXISTS stock_moves_ref ON stock_moves(ref);
PRAGMA user_version=2;`;
export function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
// Acepta "1250", "1,250.50", "$1 250.5" y "1250,5" (coma decimal solo si
// hay una coma seguida de 1–2 dígitos y no hay punto).
export function normalizeAmount(raw: string): string {
  let t = String(raw ?? "").trim().replace(/^\$\s*/, "").replace(/\s+/g, "");
  if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  return t;
}
export function cents(raw: string): number {
  const t = normalizeAmount(raw);
  assert(
    /^\d+(\.\d{1,2})?$/.test(t),
    "Escribe un importe positivo, por ejemplo 1250 o 1,250.50 (máximo dos decimales).",
  );
  const [a, b = ""] = t.split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  integer(n);
  return n;
}
function integer(n: number, min = 0) {
  assert(
    Number.isSafeInteger(n) && n >= min && n <= 1e12,
    "Cantidad o importe fuera de rango.",
  );
}
function required(s: string) {
  assert(
    typeof s === "string" && s.trim().length > 0 && s.length <= 1000,
    "Completa los campos obligatorios.",
  );
}
/** Fecha local AAAA-MM-DD de un ISO guardado en UTC (o de hoy). */
export function localDay(iso?: string | null) {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Comisión por defecto (Mercado Pago Point: 3.5% + IVA = 4.06%). Es un parámetro: Parámetros → Comisión. */
export const CARD_FEE_BPS = 406;
export const MAX_FEE_BPS = 2000;
export const cardFee = (amount: number, bps = CARD_FEE_BPS) => Math.round((amount * bps) / 10000);
/** "4.06%" a partir de puntos base (406). */
export const feeLabel = (bps = CARD_FEE_BPS) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
/**
 * 2.0 · El cliente absorbe la comisión (4.06%, configurable): paga el total tal
 * que, después de que Mercado Pago descuenta su comisión, te queda tu precio
 * completo. Ej.: $499.00 → el cliente paga $520.12 → −$21.12 → recibes $499.00.
 * Mismo cálculo en el teléfono y en el servidor (public.client_price).
 */
export function grossUp(base: number, bps = CARD_FEE_BPS): number {
  if (base <= 0 || bps <= 0) return Math.max(0, base);
  let t = Math.round((base * 10000) / (10000 - bps));
  while (t - cardFee(t, bps) < base) t++;
  while (t - 1 - cardFee(t - 1, bps) >= base) t--;
  return t;
}
/** Precio sin comisión que corresponde a un total cobrado (el mayor precio cuyo total no pasa de `total`). */
export function baseOf(total: number, bps = CARD_FEE_BPS): number {
  if (total <= 0 || bps <= 0) return Math.max(0, total);
  let b = total - cardFee(total, bps);
  while (b > 0 && grossUp(b, bps) > total) b--;
  while (grossUp(b + 1, bps) <= total) b++;
  return b;
}
/** Reparte un importe entre renglones según su valor (centavos exactos; el redondeo va al último). */
export function spread(total: number, values: number[]): number[] {
  const sum = values.reduce((n, v) => n + v, 0);
  let run = 0,
    prev = 0;
  return values.map((v, i) => {
    run += v;
    const cum = i === values.length - 1 ? total : sum ? Math.round((total * run) / sum) : 0;
    const out = cum - prev;
    prev = cum;
    return out;
  });
}
export type Charge = { list: number; base: number; lines: number[]; subtotal: number; discount: number; total: number; commission: number };
/**
 * Lo que se cobra por un carrito. `price` es tu precio (sin comisión) y `base`
 * el precio de venta si tiene descuento. El cliente ve cada producto ya con la
 * comisión (cantidad × precio al cliente), el subtotal, el descuento y el total.
 */
export function chargeFor(items: { qty: number; price: number }[], bps = CARD_FEE_BPS, base?: number | null): Charge {
  const list = items.reduce((n, i) => n + i.qty * i.price, 0);
  const b = base === null || base === undefined ? list : base;
  const perLine = items.map((i) => i.qty * grossUp(i.price, bps));
  const sub0 = perLine.reduce((n, v) => n + v, 0);
  let total: number, subtotal: number;
  if (b === list) {
    total = Math.max(grossUp(list, bps), sub0);
    subtotal = total;
  } else {
    total = grossUp(b, bps);
    subtotal = b > list ? total : Math.max(sub0, total);
  }
  const lines = subtotal === sub0 ? perLine : spread(subtotal, perLine.length ? perLine : []);
  return { list, base: b, lines, subtotal, discount: subtotal - total, total, commission: total - b };
}
// ---------- 2.1 · Promociones por parámetro ----------
export type Promo = {
  id: string;
  name: string;
  active: boolean;
  /** nxm: lleva N paga M (2x1, 3x2) · volume: desde X piezas, % · percent: % directo. */
  kind: "nxm" | "volume" | "percent";
  /** A qué aplica: todo, una categoría de venta (Creatinas, PWO…) o un producto. */
  target: "all" | "segment" | "product";
  ref?: string;
  n?: number;
  m?: number;
  minQty?: number;
  percent?: number;
  /** Vigencia (AAAA-MM-DD, inclusive). Vacío = sin límite. */
  from?: string;
  to?: string;
};
export type PromoHit = { productId: string; amount: number; promoId: string; name: string };
export const PROMO_KINDS: Record<Promo["kind"], string> = { nxm: "Lleva N, paga M (2x1, 3x2)", volume: "Por volumen", percent: "Descuento %" };
/** Descuento (tu precio, en centavos) que da una promoción a un renglón. Mismo cálculo que public.promo_line_discount. */
export function promoLineDiscount(p: Promo, line: { productId: string; segment: string; qty: number; price: number }, day: string): number {
  if (!p.active) return 0;
  if (p.from && day < p.from) return 0;
  if (p.to && day > p.to) return 0;
  if (p.target === "product" && p.ref !== line.productId) return 0;
  if (p.target === "segment" && p.ref !== line.segment) return 0;
  const value = line.qty * line.price;
  if (p.kind === "nxm") {
    const n = Number(p.n), m = Number(p.m);
    if (!(n >= 2 && m >= 1 && m < n)) return 0;
    return Math.floor(line.qty / n) * (n - m) * line.price;
  }
  const pct = Number(p.percent);
  if (!(pct > 0 && pct <= 90)) return 0;
  if (p.kind === "volume" && line.qty < Number(p.minQty || 0)) return 0;
  return Math.min(value, Math.round((value * pct) / 100));
}
/** La mejor promoción para cada renglón (no se acumulan). */
export function promoDiscounts(lines: { productId: string; segment: string; qty: number; price: number }[], promos: Promo[], day: string): { hits: PromoHit[]; total: number } {
  const hits: PromoHit[] = [];
  for (const l of lines) {
    let best: PromoHit | null = null;
    for (const p of promos) {
      const amount = promoLineDiscount(p, l, day);
      if (amount > 0 && (!best || amount > best.amount)) best = { productId: l.productId, amount, promoId: p.id, name: p.name };
    }
    if (best) hits.push(best);
  }
  return { hits, total: hits.reduce((n, h) => n + h.amount, 0) };
}
/** Texto corto de la promoción para la foto del producto ("2x1", "-10%", "3+ pzas -15%"). */
export function promoTag(p: Promo): string {
  if (p.kind === "nxm") return `${p.n}x${p.m}`;
  if (p.kind === "volume") return `${p.minQty}+ pzas −${p.percent}%`;
  return `−${p.percent}%`;
}
/** ¿Está vigente hoy? */
export const promoLive = (p: Promo, day: string) => !!p.active && (!p.from || day >= p.from) && (!p.to || day <= p.to);
/** Promociones aplicadas, agrupadas por nombre (para guardarlas en la venta y en reportes). */
export function promoSummary(hits: PromoHit[]): { name: string; amount: number }[] {
  const m = new Map<string, number>();
  for (const h of hits) m.set(h.name, (m.get(h.name) || 0) + h.amount);
  return [...m].map(([name, amount]) => ({ name, amount }));
}
/** Etiqueta de la promoción vigente que aplica a un producto (la de producto gana a la de categoría y a la general). */
export function promoTagFor(promos: Promo[], productId: string, segment: string, day: string): string {
  const live = promos.filter((p) => promoLive(p, day));
  const pick = live.find((p) => p.target === "product" && p.ref === productId) || live.find((p) => p.target === "segment" && p.ref === segment) || live.find((p) => p.target === "all");
  return pick ? promoTag(pick) : "";
}

/**
 * Lo que ve el cliente de una venta guardada (comprobantes, vendedor): cada
 * producto ya con la comisión, subtotal, descuento y total. Nunca muestra la comisión.
 */
export function customerView(v: Row): { lines: { qty: number; name: string; total: number | null }[]; subtotal: number; discount: number; total: number } {
  const ls: Row[] = Array.isArray(v.lines) ? v.lines : [];
  const total = Number(v.total) || 0;
  const commission = Number(v.commission) > 0 ? Number(v.commission) : Number(v.cardFeePassed) > 0 ? Number(v.cardFeePassed) : 0;
  const out = (amounts: (number | null)[], subtotal: number) => ({
    lines: ls.map((l, i) => ({ qty: Number(l.qty), name: String(l.name), total: amounts[i] ?? null })),
    subtotal,
    discount: Math.max(0, subtotal - total),
    total,
  });
  if (!ls.length || !ls.every((l) => Number.isFinite(Number(l.unitPrice)))) return out(ls.map((l) => (commission ? null : (l.total ?? null))), total);
  const items = ls.map((l) => ({ qty: Number(l.qty), price: Number(l.unitPrice) }));
  if (!commission) {
    const values = items.map((i) => i.qty * i.price);
    const list = values.reduce((n, x) => n + x, 0);
    const subtotal = Math.max(list, total);
    return out(subtotal === list ? values : spread(subtotal, values), subtotal);
  }
  const bps = Number.isSafeInteger(Number(v.commissionBps)) && Number(v.commissionBps) > 0 ? Number(v.commissionBps) : CARD_FEE_BPS;
  const base = Number.isSafeInteger(Number(v.basePrice)) ? Number(v.basePrice) : total - commission;
  const c = chargeFor(items, bps, base);
  if (c.total === total) return out(c.lines, c.subtotal);
  // Cobrada con otra regla (1.9) o modificada: se respeta lo cobrado.
  const subtotal = total + (base < c.list ? c.discount : 0);
  return out(spread(subtotal, c.lines), subtotal);
}
/** 1.7–1.8 subían una vez el catálogo 4.06% (la 1.9 lo revierte: ver restoreBasePrices). */
export const CATALOG_UPLIFT_BPS = 406;
export const upliftPrice = (price: number, bps = CATALOG_UPLIFT_BPS) => Math.round((price * (10000 + bps)) / 10000);
/**
 * 1.7 · Segmento para vender por categoría (Creatinas, Proteínas, PWO, Snacks,
 * Vitaminas…). Agrupa las categorías del catálogo; lo que no reconoce conserva
 * su propia categoría.
 */
export const SALE_SEGMENTS: { name: string; test: RegExp }[] = [
  { name: "Creatinas", test: /creatin/ },
  { name: "Proteínas", test: /prote[ií]na|whey|isolat|case[ií]na/ },
  { name: "PWO", test: /pre.?entreno|pre.?workout|\bpwo\b|pre.?train/ },
  { name: "Snacks", test: /barra|snack|galleta|caf[eé]|bebida|cookie|brownie/ },
  { name: "Vitaminas", test: /vitamin|omega|multivit|mineral/ },
  { name: "Aminoácidos", test: /amino|bcaa|eaa|glutamin|carnitin/ },
  { name: "Ganadores", test: /ganador|gainer|mass/ },
  { name: "Soporte hormonal", test: /hormonal|testo/ },
];
const fold = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function saleSegment(p: { category?: string | null; name?: string | null }): string {
  const cat = String(p.category || "").trim();
  const c = fold(cat);
  for (const g of SALE_SEGMENTS) if (c && g.test.test(c)) return g.name;
  // Sin categoría reconocible se intenta con el nombre del producto.
  const n = fold(String(p.name || ""));
  for (const g of SALE_SEGMENTS) if (g.test.test(n)) return g.name;
  return cat || "Otros";
}
/** Segmentos presentes en orden: primero los conocidos, luego el resto (A-Z). */
export function segmentsOf(products: { category?: string | null; name?: string | null }[]): string[] {
  const set = new Set(products.map(saleSegment));
  const known = SALE_SEGMENTS.map((g) => g.name).filter((n) => set.has(n));
  const rest = [...set].filter((n) => !known.includes(n) && n !== "Otros").sort((a, b) => a.localeCompare(b, "es"));
  return [...known, ...rest, ...(set.has("Otros") ? ["Otros"] : [])];
}
const FEE_NOTE = "Comisión tarjeta";
export const STAGES = ["Prospecto", "Interesado", "Cliente", "Frecuente", "Seguimiento", "Inactivo"];
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function date(s: string, optional = true) {
  if (!s && optional) return;
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s,
    "Fecha inválida: usa AAAA-MM-DD.",
  );
}
let counter = 0;
function id() {
  return `${Date.now().toString(36)}-${(++counter).toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
// Un solo formateador: crear Intl.NumberFormat en cada llamada es lento (se usa en cada renglón).
const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
export const money = (n: number) => MXN.format(n / 100);
// mpConfig guarda la clave privada de Mercado Pago: nunca sale del teléfono.
// cloudSession/cloudConfig: la conexión con la base en línea es de este teléfono.
// El PIN, el teléfono y la sesión en línea son de ESTE teléfono: no viajan en el
// respaldo y restaurar uno no los cambia.
const BACKUP_EXCLUDED = ["uiSession", "beforeRelease08", "mpConfig", "mpPending", "cloudSession", "cloudConfig", "cloudPub", "cloudLastSync", "appRole", "sellerCache", "sellerQueue", "deviceId", "pin", "pinFails", "ownerRecoveryAt", "ownerVerified", "cloudBackupLast", "cloudBackupError", "pushToken", "pushOff", "pushAsked", "pushAttempt", "updateCheckedAt"];
/** 2.2: ajustes con credenciales; van al almacén seguro del teléfono cuando existe. */
export const SECRET_KEYS = ["cloudSession", "mpConfig"];
export type SecretStore = { get(key: string): string | null; set(key: string, value: string | null): void };
const KEEP_ON_RESTORE = ["mpConfig", "mpPending", "cloudSession", "cloudConfig", "appRole", "sellerCache", "sellerQueue", "deviceId", "pin", "pinFails", "ownerRecoveryAt", "ownerVerified", "cloudBackupLast", "cloudBackupAuto", "cloudBackupError", "pushToken", "pushOff", "pushAsked", "pushAttempt", "updateCheckedAt"];
export const TABLES = [
  "companies",
  "locations",
  "products",
  "accounts",
  "customers",
  "campaigns",
  "lots",
  "bundles",
  "bundle_items",
  "sales",
  "sale_lines",
  "allocations",
  "ledger",
  "stock_moves",
  "relations",
  "lot_locations",
  "audit",
  "settings",
];
export class Business {
  db: DB;
  private depth = 0;
  transaction(task: () => void) {
    if (this.depth) {
      task();
      return;
    }
    this.db.withTransactionSync(() => {
      this.depth++;
      try {
        task();
      } finally {
        this.depth--;
      }
    });
  }
  setting(key: string, fallback: any = null): any {
    const secrets = SECRET_KEYS.includes(key) ? this.secrets : null;
    if (secrets) {
      const v = secrets.get(key);
      if (v != null) return JSON.parse(v);
    }
    const r = this.db.getFirstSync<Row>(
      "SELECT value FROM settings WHERE key=?",
      key,
    );
    // 2.2: lo que estaba en la base local pasa al almacén seguro la primera vez que se lee.
    if (r && secrets && r.value !== "null") {
      try {
        secrets.set(key, r.value);
        if (secrets.get(key) === r.value) this.run("DELETE FROM settings WHERE key=?", key);
      } catch {}
    }
    return r ? JSON.parse(r.value) : fallback;
  }
  setSetting(key: string, value: any) {
    const secrets = SECRET_KEYS.includes(key) ? this.secrets : null;
    if (secrets) {
      const raw = value == null ? null : JSON.stringify(value);
      secrets.set(key, raw);
      assert(secrets.get(key) === raw, "No se pudo confirmar el guardado seguro. Intenta de nuevo.");
      this.run("DELETE FROM settings WHERE key=?", key);
      return;
    }
    this.run(
      "INSERT OR REPLACE INTO settings VALUES(?,?)",
      key,
      JSON.stringify(value),
    );
  }
  /** 2.2: almacén seguro del teléfono para la sesión y la clave de Mercado Pago (null = base local). */
  static secretStore: SecretStore | null = null;
  secrets: SecretStore | null = null;
  /** Lee y migra las credenciales existentes conservando exactamente sus valores. */
  migrateSecrets() {
    if (this.secrets) for (const key of SECRET_KEYS) this.setting(key);
  }
  /** Lee de una vez todos los ajustes con un prefijo (evita N+1 consultas). */
  settingsMap(prefix: string): Map<string, any> {
    const m = new Map<string, any>();
    for (const r of this.all(
      "SELECT key,value FROM settings WHERE key>=? AND key<?",
      prefix,
      prefix + "\uffff",
    ))
      m.set(String(r.key).slice(prefix.length), JSON.parse(r.value));
    return m;
  }
  relationsMap(type: string): Map<string, Row> {
    const m = new Map<string, Row>();
    for (const r of this.all(
      "SELECT entityId,companyId,locationId FROM relations WHERE entityType=?",
      type,
    ))
      m.set(r.entityId, { companyId: r.companyId, locationId: r.locationId });
    return m;
  }
  constructor(db: DB) {
    this.db = db;
    this.secrets = Business.secretStore;
    db.execSync("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
    const v = db.getFirstSync("PRAGMA user_version")?.user_version ?? 0;
    assert(v <= 2, "La base necesita una versión más reciente de la app.");
    db.execSync(schema);
  }
  all(sql: string, ...args: any[]): Row[] {
    return this.db.getAllSync(sql, ...args);
  }
  one(sql: string, ...args: any[]): Row {
    const r = this.db.getFirstSync<Row>(sql, ...args);
    assert(r, "No se encontró el registro.");
    return r;
  }
  run(sql: string, ...args: any[]) {
    return this.db.runSync(sql, ...args);
  }
  audit(action: string, ref: string, note = "") {
    this.run(
      "INSERT INTO audit VALUES(?,?,?,?,?)",
      id(),
      new Date().toISOString(),
      action,
      ref,
      note,
    );
  }
  ledger(
    accountId: string,
    amount: number,
    kind: string,
    ref: string | null,
    note: string,
    campaignId: string | null = null,
  ) {
    const account = this.one("SELECT * FROM accounts WHERE id=?", accountId);
    this.run(
      "INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?)",
      id(),
      new Date().toISOString(),
      accountId,
      amount,
      kind,
      ref,
      note,
      campaignId,
    );
    if (kind === "sale" && account.kind === "Tarjeta" && amount > 0) {
      // La tasa vigente se guarda en el texto del movimiento: cambiarla después
      // no altera comisiones ya registradas.
      const rate = this.feeBps();
      const fee = cardFee(amount, rate);
      if (fee)
        this.ledger(
          accountId,
          -fee,
          "expense",
          ref,
          `${FEE_NOTE} ${feeLabel(rate)}`,
        );
    }
  }
  /** Comisión vigente para cobros con tarjeta, en puntos base (406 = 4.06%). */
  feeBps(): number {
    const v = Number(this.setting("cardFeeBps", CARD_FEE_BPS));
    return Number.isSafeInteger(v) && v >= 0 && v <= MAX_FEE_BPS ? v : CARD_FEE_BPS;
  }
  setFeeBps(bps: number) {
    assert(Number.isSafeInteger(bps) && bps >= 0 && bps <= MAX_FEE_BPS, "La comisión debe estar entre 0% y 20%, con máximo dos decimales.");
    this.transaction(() => {
      const before = this.feeBps();
      this.setSetting("cardFeeBps", bps);
      this.audit("settings.cardFee", "cardFeeBps", `${feeLabel(before)} → ${feeLabel(bps)}`);
    });
  }
  // ---------- 2.1 · Promociones ----------
  promos(): Promo[] {
    const v = this.setting("promotions", []);
    return Array.isArray(v) ? v : [];
  }
  savePromo(input: Partial<Promo>): string {
    const name = String(input.name || "").trim();
    required(name);
    const kind = input.kind as Promo["kind"];
    assert(["nxm", "volume", "percent"].includes(kind), "Elige el tipo de promoción.");
    const target = (input.target || "all") as Promo["target"];
    assert(["all", "segment", "product"].includes(target), "Elige a qué aplica.");
    if (target !== "all") assert(String(input.ref || "").trim(), target === "product" ? "Elige el producto." : "Elige la categoría.");
    if (target === "product") this.one("SELECT id FROM products WHERE id=?", input.ref);
    const p: Promo = { id: input.id || id(), name: name.slice(0, 60), active: input.active !== false, kind, target, ...(target !== "all" ? { ref: String(input.ref).trim() } : {}) };
    if (kind === "nxm") {
      const n = Number(input.n), m = Number(input.m);
      assert(Number.isInteger(n) && Number.isInteger(m) && n >= 2 && n <= 20 && m >= 1 && m < n, "En N×M el cliente lleva N y paga M (M menor que N). Ejemplo: lleva 2, paga 1.");
      Object.assign(p, { n, m });
    } else {
      const pct = Number(input.percent);
      assert(Number.isInteger(pct) && pct >= 1 && pct <= 90, "El descuento debe ser un porcentaje entero entre 1 y 90.");
      p.percent = pct;
      if (kind === "volume") {
        const q = Number(input.minQty);
        assert(Number.isInteger(q) && q >= 2 && q <= 999, "Por volumen: escribe desde cuántas piezas aplica (2 o más).");
        p.minQty = q;
      }
    }
    for (const k of ["from", "to"] as const) {
      const d = String(input[k] || "").trim();
      if (d) {
        const t = new Date(`${d}T12:00:00Z`);
        assert(/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(t.getTime()) && t.toISOString().slice(0, 10) === d, "Fecha inválida.");
        p[k] = d;
      }
    }
    assert(!p.from || !p.to || p.from <= p.to, "La fecha final no puede ser antes de la inicial.");
    this.transaction(() => {
      const list = this.promos().filter((x) => x.id !== p.id);
      this.setSetting("promotions", [...list, p]);
      this.audit(input.id ? "promo.update" : "promo.create", p.id, `${p.name} · ${promoTag(p)}`);
    });
    return p.id;
  }
  deletePromo(promoId: string) {
    this.transaction(() => {
      this.setSetting("promotions", this.promos().filter((x) => x.id !== promoId));
      this.audit("promo.delete", promoId, "");
    });
  }
  /** Descuentos de promoción para un carrito (con tu precio de catálogo y la categoría de venta de cada producto). */
  promoFor(items: { productId: string; qty: number }[], day = today()): { hits: PromoHit[]; total: number } {
    const promos = this.promos().filter((p) => promoLive(p, day));
    if (!promos.length || !items.length) return { hits: [], total: 0 };
    const lines = items.map((i) => {
      const p = this.one("SELECT id,name,price,category FROM products WHERE id=?", i.productId);
      return { productId: i.productId, qty: i.qty, price: p.price, segment: saleSegment(p) };
    });
    return promoDiscounts(lines, promos, day);
  }
  /** Último movimiento de comisión de una venta (para conciliarlo con Mercado Pago). */
  lastFeeEntry(saleId: string): Row | null {
    return this.db.getFirstSync<Row>(
      "SELECT * FROM ledger WHERE ref=? AND kind='expense' AND note LIKE 'Comisión tarjeta%' ORDER BY created DESC,rowid DESC",
      saleId,
    );
  }
  /**
   * Sustituye la comisión estimada por la que Mercado Pago reporta para ese cobro.
   * Solo toca el movimiento de comisión indicado; ventas y cobros no cambian.
   */
  setRealFee(ledgerId: string, fee: number) {
    integer(fee);
    this.transaction(() => {
      const row = this.one("SELECT * FROM ledger WHERE id=? AND kind='expense' AND note LIKE 'Comisión tarjeta%'", ledgerId);
      if (-row.amount === fee && String(row.note).includes("real")) return;
      this.run("UPDATE ledger SET amount=?,note=? WHERE id=?", -fee, `${FEE_NOTE} real Mercado Pago`, ledgerId);
      this.audit("fee.reconcile", String(row.ref || ledgerId), `${-row.amount} → ${fee}`);
    });
  }
  // Eight columns in ledger; all calls use bound values.
  balance(accountId: string) {
    return this.one(
      "SELECT COALESCE(SUM(amount),0) balance FROM ledger WHERE accountId=?",
      accountId,
    ).balance as number;
  }
  addProduct(
    sku: string,
    name: string,
    category: string,
    price: number,
    minimum: number,
  ) {
    required(sku);
    required(name);
    required(category);
    integer(price);
    integer(minimum);
    const key = id();
    this.transaction(() => {
      this.run(
        "INSERT INTO products VALUES(?,?,?,?,?,?)",
        key,
        sku.trim().toUpperCase(),
        name.trim(),
        category.trim(),
        price,
        minimum,
      );
      this.audit("product.create", key);
    });
    return key;
  }
  updateProduct(
    key: string,
    sku: string,
    name: string,
    category: string,
    price: number,
    minimum: number,
  ) {
    required(sku);
    required(name);
    required(category);
    integer(price);
    integer(minimum);
    this.transaction(() => {
      this.one("SELECT id FROM products WHERE id=?", key);
      this.run(
        "UPDATE products SET sku=?,name=?,category=?,price=?,minimum=? WHERE id=?",
        sku.trim().toUpperCase(),
        name.trim(),
        category.trim(),
        price,
        minimum,
        key,
      );
      this.audit(
        "product.update",
        key,
        "No altera costos ni nombres de ventas anteriores",
      );
    });
  }
  addAccount(name: string, kind: string, opening: number) {
    required(name);
    integer(opening);
    assert(
      ["Efectivo", "Banco", "Billetera", "Tarjeta"].includes(kind),
      "Tipo de cuenta inválido.",
    );
    const key = id();
    this.transaction(() => {
      this.run("INSERT INTO accounts VALUES(?,?,?)", key, name.trim(), kind);
      this.ledger(key, opening, "opening", key, "Saldo inicial");
      this.audit("account.create", key);
    });
    return key;
  }
  customer(
    name: string,
    phone: string,
    notes: string,
    stage: string,
    nextDate: string,
    existing?: string,
  ) {
    required(name);
    date(nextDate);
    assert(STAGES.includes(stage), "Etapa inválida.");
    const key = existing ?? id();
    this.transaction(() => {
      if (existing) {
        this.one("SELECT id FROM customers WHERE id=?", existing);
        this.run(
          "UPDATE customers SET name=?,phone=?,notes=?,stage=?,nextDate=? WHERE id=?",
          name.trim(),
          phone,
          notes,
          stage,
          nextDate,
          key,
        );
      } else
        this.run(
          "INSERT INTO customers VALUES(?,?,?,?,?,?)",
          key,
          name.trim(),
          phone,
          notes,
          stage,
          nextDate,
        );
      this.audit("customer.save", key);
    });
    return key;
  }
  addCampaign(name: string, channel: string, code: string) {
    required(name);
    required(channel);
    required(code);
    const key = id();
    this.transaction(() => {
      this.run(
        "INSERT INTO campaigns VALUES(?,?,?,?)",
        key,
        name,
        channel,
        code.trim().toUpperCase(),
      );
      this.audit("campaign.create", key);
    });
    return key;
  }
  receive(
    productId: string,
    label: string,
    expires: string,
    qty: number,
    cost: number,
    accountId: string | null,
  ) {
    required(label);
    date(expires);
    integer(qty, 1);
    integer(cost);
    integer(qty * cost);
    this.one("SELECT id FROM products WHERE id=?", productId);
    const key = id();
    this.transaction(() => {
      if (accountId)
        assert(
          this.balance(accountId) >= qty * cost,
          "Saldo insuficiente para pagar la compra.",
        );
      this.run(
        "INSERT INTO lots VALUES(?,?,?,?,?,?)",
        key,
        productId,
        label,
        expires,
        cost,
        qty,
      );
      this.run(
        "INSERT INTO stock_moves VALUES(?,?,?,?,?,?,?)",
        id(),
        new Date().toISOString(),
        key,
        qty,
        accountId ? "purchase" : "opening",
        key,
        accountId
          ? "Compra pagada"
          : "Inventario inicial, sin movimiento de caja",
      );
      if (accountId)
        this.ledger(
          accountId,
          -qty * cost,
          "purchase",
          key,
          "Compra de inventario",
        );
      this.audit("stock.receive", key);
    });
    return key;
  }
  movement(
    kind: string,
    accountId: string,
    amount: number,
    note: string,
    campaignId: string | null = null,
    toId?: string,
  ) {
    integer(amount, 1);
    required(note);
    assert(
      ["expense", "income", "capital", "withdrawal", "transfer"].includes(kind),
      "Movimiento inválido.",
    );
    const key = id();
    this.transaction(() => {
      if (["expense", "withdrawal", "transfer"].includes(kind))
        assert(this.balance(accountId) >= amount, "Saldo insuficiente.");
      if (kind === "transfer") {
        assert(toId && toId !== accountId, "Elige otra cuenta destino.");
        this.ledger(accountId, -amount, "transfer", key, note);
        this.ledger(toId, amount, "transfer", key, note);
      } else
        this.ledger(
          accountId,
          ["expense", "withdrawal"].includes(kind) ? -amount : amount,
          kind,
          key,
          note,
          campaignId,
        );
      this.audit(kind, key, note);
    });
    return key;
  }
  addBundle(
    name: string,
    price: number,
    items: { productId: string; qty: number }[],
  ) {
    required(name);
    integer(price);
    assert(items.length >= 2, "Agrega al menos dos productos distintos.");
    assert(
      new Set(items.map((x) => x.productId)).size === items.length,
      "No repitas componentes.",
    );
    const key = id();
    this.transaction(() => {
      this.run("INSERT INTO bundles VALUES(?,?,?)", key, name, price);
      items.forEach((i) => {
        integer(i.qty, 1);
        this.run(
          "INSERT INTO bundle_items VALUES(?,?,?)",
          key,
          i.productId,
          i.qty,
        );
      });
      this.audit("bundle.create", key);
    });
    return key;
  }
  sell(
    items: { productId: string; qty: number }[],
    total: number,
    paid: number,
    accountId: string | null,
    customerId: string | null,
    campaignId: string | null,
    channel: string,
    allowBelowCost = false,
    locationId: string | null = null,
    commission: { amount: number; bps: number } | null = null,
    // Por producto: precio con el que se vendió (ventas de vendedores) y descuento de promoción.
    lineInfo: Record<string, { price?: number; discount?: number }> | null = null,
  ) {
    integer(total);
    integer(paid);
    assert(paid <= total, "El cobro no puede superar la venta.");
    // 1.9: comisión que paga el cliente (va dentro de `total`; los renglones se reparten sin ella).
    const comm = commission && commission.amount ? commission : null;
    if (comm) {
      integer(comm.amount);
      integer(comm.bps);
      assert(comm.amount < total, "La comisión no puede ser mayor que la venta.");
    }
    const goods = total - (comm?.amount ?? 0);
    assert(
      paid === total || customerId,
      "Asigna un cliente para vender a crédito.",
    );
    assert(paid === 0 || accountId, "Selecciona la cuenta del cobro.");
    required(channel);
    assert(items.length > 0, "Agrega productos.");
    const merged = new Map<string, number>();
    for (const i of items) {
      integer(i.qty, 1);
      merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.qty);
    }
    const key = id();
    this.transaction(() => {
      const plan: {
        productId: string;
        qty: number;
        name: string;
        alloc: { lotId: string; qty: number; cost: number }[];
      }[] = [];
      let cost = 0;
      for (const [productId, qty] of merged) {
        integer(qty, 1);
        const product = this.one(
          "SELECT * FROM products WHERE id=?",
          productId,
        );
        let remaining = qty;
        const alloc = [];
        const lots = this.all(
          "SELECT * FROM lots WHERE productId=? AND qty>0 AND (expires='' OR expires>=?) ORDER BY CASE WHEN expires='' THEN 1 ELSE 0 END,expires,id",
          productId,
          today(),
        );
        for (const lot of lots) {
          if (
            locationId &&
            !this.db.getFirstSync(
              "SELECT lotId FROM lot_locations WHERE lotId=? AND locationId=?",
              lot.id,
              locationId,
            )
          )
            continue;
          if (!remaining) break;
          const take = Math.min(remaining, lot.qty-this.reservedForLot(lot.id));
          if(take<=0) continue;
          alloc.push({ lotId: lot.id, qty: take, cost: lot.cost });
          remaining -= take;
          cost += take * lot.cost;
        }
        assert(
          remaining === 0,
          locationId
            ? `En la ubicación elegida solo hay ${qty - remaining} de ${product.name} (pediste ${qty}). Quita la ubicación en "Más detalles" o asigna el lote a esa ubicación.`
            : `Existencias vendibles insuficientes: ${product.name} (hay ${qty - remaining}, pediste ${qty}).`,
        );
        plan.push({ productId, qty, name: product.name, alloc });
      }
      integer(cost);
      // 2.1: una promoción que tú configuraste ya es tu autorización. Si la venta queda debajo
      // del costo SOLO por la promoción, se permite (y se anota); un precio especial no.
      const promoOff = Object.values(lineInfo || {}).reduce((n, x) => n + Math.max(0, Math.round(Number(x?.discount) || 0)), 0);
      const promoBelow = goods < cost && promoOff > 0 && goods + promoOff >= cost;
      assert(
        goods >= cost || allowBelowCost || promoBelow,
        "La venta está debajo del costo. Activa la autorización explícita si corresponde.",
      );
      this.run(
        "INSERT INTO sales VALUES(?,?,?,?,?,?,?,?)",
        key,
        new Date().toISOString(),
        customerId,
        campaignId,
        channel,
        total,
        cost,
        "confirmed",
      );
      const unitOf=(p:{productId:string})=>{const v=lineInfo?.[p.productId]?.price;return Number.isSafeInteger(v)&&(v as number)>=0?(v as number):this.one('SELECT price FROM products WHERE id=?',p.productId).price;};
      const listValues=plan.map(p=>unitOf(p)*p.qty);
      // Promociones: cada renglón conserva su descuento; el resto (precio especial) se reparte proporcional.
      const weights=plan.map((p,i)=>Math.max(0,listValues[i]-Math.min(listValues[i],Math.max(0,Math.round(Number(lineInfo?.[p.productId]?.discount)||0)))));
      const lineTotals=spread(goods,weights.some(w=>w>0)?weights:listValues);
      for (const [index,p] of plan.entries()) {
        const line = id();
        this.run(
          "INSERT INTO sale_lines VALUES(?,?,?,?,?)",
          line,
          key,
          p.productId,
          p.qty,
          p.name,
        );
        const lineTotal=lineTotals[index];
        this.setSetting('line:'+line,{unitPrice:listValues[index]/p.qty,discount:listValues[index]-lineTotal,delivered:p.qty});
        for (const a of p.alloc) {
          this.run(
            "INSERT INTO allocations VALUES(?,?,?,?,?)",
            id(),
            line,
            a.lotId,
            a.qty,
            a.cost,
          );
          this.run("UPDATE lots SET qty=qty-? WHERE id=?", a.qty, a.lotId);
          this.run(
            "INSERT INTO stock_moves VALUES(?,?,?,?,?,?,?)",
            id(),
            new Date().toISOString(),
            a.lotId,
            -a.qty,
            "sale",
            key,
            p.name,
          );
        }
      }
      if (comm) this.setSetting("sale:" + key, { ...this.setting("sale:" + key, {}), basePrice: goods, commission: comm.amount, commissionBps: comm.bps });
      if (paid && accountId)
        this.ledger(accountId, paid, "sale", key, "Cobro de venta");
      if (customerId)
        this.run("UPDATE customers SET stage='Cliente' WHERE id=?", customerId);
      this.audit(
        "sale.confirm",
        key,
        allowBelowCost ? "Autorización de precio bajo costo" : promoBelow ? "Debajo del costo por promoción" : "",
      );
    });
    return key;
  }
  /** Comprueba que la venta se podría registrar (stock, cliente, costo) sin guardar nada. */
  validateSale(...args: Parameters<Business["sell"]>) {
    this.dryRun(() => this.sell(...args));
  }
  collect(saleId: string, accountId: string, amount: number) {
    integer(amount, 1);
    this.transaction(() => {
      const sale = this.one("SELECT * FROM sales WHERE id=?", saleId);
      assert(sale.status === "confirmed", "Venta cancelada.");
      const paid = this.one(
        "SELECT COALESCE(SUM(amount),0) paid FROM ledger WHERE ref=? AND kind='sale'",
        saleId,
      ).paid;
      assert(amount <= sale.total - paid, "Cobro mayor al saldo pendiente.");
      this.ledger(accountId, amount, "sale", saleId, "Abono");
      this.audit("sale.collect", saleId);
    });
  }
  cancel(saleId: string) {
    this.transaction(() => {
      const s = this.one("SELECT * FROM sales WHERE id=?", saleId);
      assert(s.status === "confirmed", "Esta venta ya está cancelada.");
      const payments = this.all(
        "SELECT accountId,SUM(amount) amount FROM ledger WHERE ref=? AND kind='sale' GROUP BY accountId",
        saleId,
      );
      // Efectivo y bancos: debe haber con qué devolver. Tarjeta (Mercado Pago) devuelve
      // desde su propio saldo aunque ya se haya retirado el dinero o descontado la comisión.
      for (const p of payments)
        assert(
          this.one("SELECT kind FROM accounts WHERE id=?", p.accountId).kind === "Tarjeta" || this.balance(p.accountId) >= p.amount,
          "No hay saldo suficiente en la cuenta original para devolver el cobro.",
        );
      for (const a of this.all(
        "SELECT a.* FROM allocations a JOIN sale_lines l ON l.id=a.lineId WHERE l.saleId=?",
        saleId,
      )) {
        const delivered=a.qty-this.reservedForLotAllocation(a.id);
        this.run('DELETE FROM settings WHERE key=?','reservation:'+a.id);
        this.run("UPDATE lots SET qty=qty+? WHERE id=?", delivered, a.lotId);
        this.run(
          "INSERT INTO stock_moves VALUES(?,?,?,?,?,?,?)",
          id(),
          new Date().toISOString(),
          a.lotId,
          delivered,
          "cancel",
          saleId,
          "Cancelación: mercancía devuelta",
        );
      }
      for (const p of payments)
        this.ledger(
          p.accountId,
          -p.amount,
          "refund",
          saleId,
          "Devolución total",
        );
      this.run("UPDATE sales SET status='cancelled' WHERE id=?", saleId);
      this.audit(
        "sale.cancel",
        saleId,
        "Mercancía completa devuelta en estado vendible",
      );
    });
  }
  /** Cambia solo el nombre visible de una cuenta (el tipo y su historial no cambian). */
  renameAccount(accountId: string, name: string) {
    required(name);
    this.transaction(() => {
      const a = this.one("SELECT * FROM accounts WHERE id=?", accountId);
      this.run("UPDATE accounts SET name=? WHERE id=?", name.trim(), accountId);
      this.audit("account.rename", accountId, `${a.name} → ${name.trim()}`);
    });
  }
  /**
   * Ajusta las existencias físicas de un producto al conteo real.
   * Baja: descuenta primero de los lotes que caducan antes (respeta apartados).
   * Sube: crea un lote "Ajuste" con el último costo conocido. No mueve dinero.
   * Devuelve { before, after, delta, value } (value = costo de las unidades ajustadas).
   */
  adjustStock(productId: string, counted: number, reason: string, note = "") {
    integer(counted);
    required(reason);
    const result = { before: 0, after: counted, delta: 0, value: 0 };
    this.transaction(() => {
      this.one("SELECT id FROM products WHERE id=?", productId);
      const lots = this.all(
        "SELECT * FROM lots WHERE productId=? ORDER BY CASE WHEN expires='' THEN 1 ELSE 0 END,expires,id",
        productId,
      );
      const before = lots.reduce((n, l) => n + l.qty, 0);
      const delta = counted - before;
      assert(delta !== 0, "El conteo es igual a las existencias actuales; no hay nada que ajustar.");
      const key = id();
      const label = reason + (note.trim() ? `: ${note.trim()}` : "");
      const now = new Date().toISOString();
      if (delta < 0) {
        let remove = -delta;
        for (const lot of lots) {
          if (!remove) break;
          const free = lot.qty - this.reservedForLot(lot.id);
          const take = Math.min(remove, free);
          if (take <= 0) continue;
          this.run("UPDATE lots SET qty=qty-? WHERE id=?", take, lot.id);
          this.run("INSERT INTO stock_moves VALUES(?,?,?,?,?,?,?)", id(), now, lot.id, -take, "adjust", key, label);
          result.value += take * lot.cost;
          remove -= take;
        }
        assert(remove === 0, "No puedes dejar menos unidades que las apartadas para entregas pendientes.");
      } else {
        const lastCost =
          this.db.getFirstSync<Row>("SELECT cost FROM lots WHERE productId=? ORDER BY rowid DESC", productId)?.cost ??
          this.setting("product:" + productId, {}).referenceCost ??
          0;
        integer(lastCost);
        this.run("INSERT INTO lots VALUES(?,?,?,?,?,?)", key, productId, "Ajuste · " + reason, "", lastCost, delta);
        this.run("INSERT INTO stock_moves VALUES(?,?,?,?,?,?,?)", id(), now, key, delta, "adjust", key, label);
        result.value = delta * lastCost;
      }
      this.setSetting("product:" + productId, { ...this.setting("product:" + productId, {}), inventoryKnown: true });
      this.audit("stock.adjust", productId, `${before} → ${counted} · ${label}`);
      Object.assign(result, { before, delta });
    });
    return result;
  }
  /**
   * Elimina por completo una venta YA CANCELADA, como si nunca se hubiera
   * registrado: renglones, lotes asignados, cobros, devolución y su comisión.
   * Solo procede si el inventario y el dinero de esa venta ya están en cero.
   */
  deleteCancelledSale(saleId: string) {
    this.transaction(() => {
      const sale = this.one("SELECT * FROM sales WHERE id=?", saleId);
      assert(sale.status === "cancelled", "Solo se pueden eliminar ventas canceladas.");
      assert(
        this.all("SELECT lotId FROM stock_moves WHERE ref=? GROUP BY lotId HAVING SUM(qty)!=0", saleId).length === 0,
        "Esta venta tiene movimientos de inventario sin devolver; no se puede eliminar.",
      );
      assert(
        this.one("SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE ref=? AND kind IN ('sale','refund')", saleId).n === 0,
        "Esta venta tiene cobros sin devolver; no se puede eliminar.",
      );
      const lines = this.all("SELECT id FROM sale_lines WHERE saleId=?", saleId);
      for (const l of lines) {
        for (const a of this.all("SELECT id FROM allocations WHERE lineId=?", l.id))
          this.run("DELETE FROM settings WHERE key=?", "reservation:" + a.id);
        this.run("DELETE FROM allocations WHERE lineId=?", l.id);
        this.run("DELETE FROM settings WHERE key=?", "line:" + l.id);
      }
      this.run("DELETE FROM sale_lines WHERE saleId=?", saleId);
      this.run("DELETE FROM stock_moves WHERE ref=?", saleId);
      this.run("DELETE FROM ledger WHERE ref=?", saleId);
      this.run("DELETE FROM relations WHERE entityType='sale' AND entityId=?", saleId);
      this.run("DELETE FROM settings WHERE key=?", "sale:" + saleId);
      this.run("DELETE FROM sales WHERE id=?", saleId);
      this.audit("sale.delete", saleId, `Venta cancelada eliminada · total ${sale.total}`);
    });
  }
  reservedForLotAllocation(allocationId: string): number {
    return this.setting('reservation:'+allocationId,0);
  }
  reservedForLot(lotId: string): number {
    return Number(
      this.one(
        "SELECT COALESCE(SUM(CAST(s.value AS INTEGER)),0) n FROM allocations a JOIN settings s ON s.key='reservation:'||a.id WHERE a.lotId=?",
        lotId,
      ).n,
    );
  }
  /**
   * Unidades que una venta SÍ puede tomar (misma regla que `sell`): lotes vigentes,
   * menos lo apartado en cada lote y, si se indica, solo lotes de esa ubicación.
   */
  sellableByProduct(locationId: string | null = null): Map<string, number> {
    const m = new Map<string, number>();
    const rows = this.all(
      `SELECT l.id,l.productId,l.qty,COALESCE((SELECT SUM(CAST(s.value AS INTEGER)) FROM allocations a JOIN settings s ON s.key='reservation:'||a.id WHERE a.lotId=l.id),0) r
       FROM lots l WHERE l.qty>0 AND (l.expires='' OR l.expires>=?)${locationId ? " AND EXISTS (SELECT 1 FROM lot_locations x WHERE x.lotId=l.id AND x.locationId=?)" : ""}`,
      ...(locationId ? [today(), locationId] : [today()]),
    );
    for (const l of rows) m.set(l.productId, (m.get(l.productId) ?? 0) + Math.max(0, l.qty - Number(l.r || 0)));
    return m;
  }
  sellable(productId: string, locationId: string | null = null): number {
    return this.sellableByProduct(locationId).get(productId) ?? 0;
  }
  stock() {
    const meta = this.settingsMap("product:");
    const sellable = this.sellableByProduct();
    return this.all(
      "SELECT p.*,COALESCE(SUM(l.qty),0) stock,COALESCE(SUM(l.qty*l.cost),0) value FROM products p LEFT JOIN lots l ON l.productId=p.id GROUP BY p.id ORDER BY p.name",
    ).map((p) => {
      const m = meta.get(p.id) ?? {};
      return {
        ...p,
        // Lo mismo que puede tomar una venta: así lo que dice "disponibles" nunca falla al cobrar.
        available: sellable.get(p.id) ?? 0,
        ...m,
        archived: m.archived === true,
        inventoryKnown: m.inventoryKnown !== false || p.stock > 0,
      };
    });
  }
  setProductArchived(productId: string, archived: boolean) {
    this.transaction(() => {
      this.one("SELECT id FROM products WHERE id=?", productId);
      this.setSetting("product:" + productId, {
        ...this.setting("product:" + productId, {}),
        archived,
      });
      this.audit(archived ? "product.archive" : "product.restore", productId);
    });
  }
  setCustomerArchived(customerId: string, archived: boolean) {
    this.transaction(() => {
      this.one("SELECT id FROM customers WHERE id=?", customerId);
      this.setSetting("customer:" + customerId, {
        ...this.setting("customer:" + customerId, {}),
        archived,
      });
      this.audit(archived ? "customer.archive" : "customer.restore", customerId);
    });
  }
  accounts() {
    return this.all(
      "SELECT a.*,COALESCE(SUM(l.amount),0) balance FROM accounts a LEFT JOIN ledger l ON l.accountId=a.id GROUP BY a.id ORDER BY a.name",
    );
  }
  sales() {
    const meta = this.settingsMap("sale:");
    const relations = this.relationsMap("sale");
    return this.all(
      "SELECT s.*,c.name customer,COALESCE(p.paid,0) paid FROM sales s LEFT JOIN customers c ON c.id=s.customerId LEFT JOIN (SELECT ref,SUM(amount) paid FROM ledger WHERE kind='sale' GROUP BY ref) p ON p.ref=s.id ORDER BY s.created DESC",
    ).map((s) => ({
      ...s,
      ...(meta.get(s.id) ?? {}),
      ...(relations.get(s.id) ?? { companyId: null, locationId: null }),
    }));
  }
  /** Cobrado neto de cada venta por cuenta (cobro, abonos y devoluciones). */
  salePaymentsByAccount(): Map<string, Record<string, number>> {
    const m = new Map<string, Record<string, number>>();
    for (const r of this.all("SELECT ref,accountId,SUM(amount) n FROM ledger WHERE kind IN ('sale','refund') AND ref IS NOT NULL GROUP BY ref,accountId")) {
      if (!r.n) continue;
      const x = m.get(r.ref) ?? {};
      x[r.accountId] = r.n;
      m.set(r.ref, x);
    }
    return m;
  }
  /** Una sola venta con sus metadatos (sin cargar todas). */
  sale(saleId: string): Row | null {
    const s = this.db.getFirstSync<Row>(
      "SELECT s.*,c.name customer,COALESCE((SELECT SUM(amount) FROM ledger WHERE ref=s.id AND kind='sale'),0) paid FROM sales s LEFT JOIN customers c ON c.id=s.customerId WHERE s.id=?",
      saleId,
    );
    return s
      ? { ...s, ...this.setting("sale:" + s.id, {}), ...this.relation("sale", s.id) }
      : null;
  }
  /** Renglones de todas las ventas agrupados por venta (una consulta). */
  saleLinesBySale(): Map<string, Row[]> {
    const m = new Map<string, Row[]>();
    for (const l of this.all("SELECT saleId,name,qty FROM sale_lines ORDER BY id")) {
      const list = m.get(l.saleId) ?? [];
      list.push(l);
      m.set(l.saleId, list);
    }
    return m;
  }
  /** Resumen de un periodo: ventas confirmadas y gastos desde `from` (ISO). */
  periodSummary(from: string | null, to: string | null = null): Row {
    const since = from ?? "";
    const until = to ?? "9999";
    const s = this.one(
      "SELECT COALESCE(SUM(total),0) revenue,COALESCE(SUM(cost),0) cost,COUNT(*) orders FROM sales WHERE status='confirmed' AND created>=? AND created<?",
      since,
      until,
    );
    const e = this.one(
      "SELECT COALESCE(SUM(CASE WHEN kind='expense' AND note LIKE 'Comisión tarjeta%' THEN -amount ELSE 0 END),0) fees,COALESCE(SUM(CASE WHEN kind='expense' AND note NOT LIKE 'Comisión tarjeta%' THEN -amount ELSE 0 END),0) expenses,COALESCE(SUM(CASE WHEN kind IN ('sale','refund') THEN amount ELSE 0 END),0) collected FROM ledger WHERE created>=? AND created<?",
      since,
      until,
    );
    // Ventas segmentadas por forma de pago. La comisión (4.06%) solo existe en
    // cobros con tarjeta; efectivo y transferencia pasan íntegros.
    const label: Record<string, string> = { Banco: "Transferencia", Efectivo: "Efectivo", Tarjeta: "Tarjeta", Billetera: "Billetera" };
    const order = ["Transferencia", "Tarjeta", "Efectivo", "Billetera"];
    const byMethod = this.all(
      "SELECT a.kind,COALESCE(SUM(CASE WHEN l.kind IN ('sale','refund') THEN l.amount ELSE 0 END),0) gross,COALESCE(SUM(CASE WHEN l.kind='expense' AND l.note LIKE 'Comisión tarjeta%' THEN -l.amount ELSE 0 END),0) fee FROM ledger l JOIN accounts a ON a.id=l.accountId WHERE l.created>=? AND l.created<? GROUP BY a.kind",
      since,
      until,
    )
      .map((r) => ({ method: label[r.kind] ?? r.kind, gross: r.gross, fee: r.fee, net: r.gross - r.fee }))
      .filter((r) => r.gross || r.fee)
      .sort((x, y) => order.indexOf(x.method) - order.indexOf(y.method));
    // 1.9: comisión que pagaron los clientes (ya va dentro de las ventas).
    const saleMeta = this.settingsMap("sale:");
    const commissions = this.all("SELECT id FROM sales WHERE status='confirmed' AND created>=? AND created<?", since, until).reduce(
      (n, r) => n + (Number(saleMeta.get(r.id)?.commission) || 0),
      0,
    );
    const netSales = s.revenue - e.fees;
    // Mermas: costo de las unidades dadas de baja en ajustes (las altas lo compensan).
    const shrinkage = this.one(
      "SELECT COALESCE(-SUM(m.qty*l.cost),0) n FROM stock_moves m JOIN lots l ON l.id=m.lotId WHERE m.kind='adjust' AND m.created>=? AND m.created<?",
      since,
      until,
    ).n as number;
    return {
      ...s,
      ...e,
      commissions,
      shrinkage,
      // Utilidad estimada: ganancia bruta − comisiones − gastos operativos − mermas.
      profit: s.revenue - s.cost - e.fees - e.expenses - shrinkage,
      byMethod,
      // Por cobrar: saldo de cada venta del periodo (no ventas − cobros del periodo, que mezcla fechas).
      receivable: this.receivable(since, until),
      gross: s.revenue - s.cost,
      netSales,
      // Ventas totales menos gastos operativos (sin contar la comisión de tarjeta).
      afterExpenses: s.revenue - e.expenses,
      // Lo que realmente queda: ventas netas de comisión menos gastos operativos.
      available: netSales - e.expenses,
      marginPercent: s.revenue ? ((s.revenue - s.cost) / s.revenue) * 100 : 0,
      ticket: s.orders ? Math.round(s.revenue / s.orders) : 0,
    };
  }
  /** Saldo pendiente de las ventas activas creadas en el periodo. */
  receivable(since: string, until: string): number {
    return this.one(
      "SELECT COALESCE(SUM(MAX(0,s.total-COALESCE(p.paid,0))),0) n FROM sales s LEFT JOIN (SELECT ref,SUM(amount) paid FROM ledger WHERE kind='sale' AND ref IS NOT NULL GROUP BY ref) p ON p.ref=s.id WHERE s.status='confirmed' AND s.created>=? AND s.created<?",
      since,
      until,
    ).n as number;
  }
  saleDetail(saleId: string): Row {
    const sale = this.sale(saleId);
    assert(sale, "No se encontró la venta.");
    const lines = this.all(
      "SELECT l.*,p.sku FROM sale_lines l JOIN products p ON p.id=l.productId WHERE l.saleId=? ORDER BY l.id",
      saleId,
    ).map((line) => {
      let meta = this.setting("line:" + line.id, null);
      // VNS0009 was imported from the corrected Excel before line-level metadata
      // existed in the previous pilot; retain its exact historical prices here.
      if (!meta && sale.folio === "VNS0009") {
        meta = line.productId === "NS-VIT-001" ? { unitPrice: 36900, discount: 0 } :
          line.productId === "NS-CAF-001" ? { unitPrice: 66900, discount: 0 } : null;
      }
      const cost = this.one("SELECT COALESCE(SUM(qty*cost),0) cost FROM allocations WHERE lineId=?", line.id).cost;
      return { ...line, ...(meta || {}), total: meta ? (meta.unitPrice * line.qty - (meta.discount || 0)) : null, cost };
    });
    const movements = this.all("SELECT l.*,a.name account FROM ledger l JOIN accounts a ON a.id=l.accountId WHERE l.ref=? ORDER BY l.created,l.id", saleId);
    const fees = Math.max(0,-movements.filter((x) => x.kind === "expense" && String(x.note || "").startsWith("Comisión tarjeta")).reduce((n, x) => n + x.amount, 0));
    const refunded = -movements.filter((x) => x.kind === "refund").reduce((n, x) => n + x.amount, 0);
    const paid = movements.filter((x) => x.kind === "sale").reduce((n, x) => n + x.amount, 0);
    const cost = lines.reduce((n, x) => n + x.cost, 0);
    for(const line of lines) Object.assign(line,this.setting('line:'+line.id,{}));
    const gross=sale.status==='cancelled'?0:sale.total-cost;
    return { ...sale, lines, movements, fees, refunded, paid, cost, gross, marginPercent:sale.total?gross/sale.total*100:0, netSales:(sale.status==='cancelled'?0:sale.total)-fees, netCollected: paid - refunded - fees, profit: gross - fees };
  }
  operatingControl(): Row[] {
    return this.all("SELECT l.*,a.name account FROM ledger l JOIN accounts a ON a.id=l.accountId WHERE l.kind='expense' ORDER BY l.created DESC").map(l=>({...l,isFee:String(l.note).startsWith('Comisión tarjeta')}));
  }
  campaigns() {
    const meta = this.settingsMap("campaign:");
    const relations = this.relationsMap("campaign");
    return this.all(
      "SELECT c.*,COALESCE(s.revenue,0) revenue,COALESCE(s.gross,0) gross,COALESCE(l.spend,0) spend FROM campaigns c LEFT JOIN (SELECT campaignId,SUM(total) revenue,SUM(total-cost) gross FROM sales WHERE status='confirmed' AND campaignId IS NOT NULL GROUP BY campaignId) s ON s.campaignId=c.id LEFT JOIN (SELECT campaignId,-SUM(amount) spend FROM ledger WHERE kind='expense' AND campaignId IS NOT NULL GROUP BY campaignId) l ON l.campaignId=c.id ORDER BY name",
    ).map((c) => ({
      ...c,
      ...(meta.get(c.id) ?? {}),
      ...(relations.get(c.id) ?? { companyId: null, locationId: null }),
    }));
  }
  metrics(): Row {
    const s = this.one(
      "SELECT COALESCE(SUM(total),0) revenue,COALESCE(SUM(cost),0) cost,COUNT(*) orders FROM sales WHERE status='confirmed'",
    );
    const l = this.one(
      "SELECT COALESCE(SUM(amount),0) cash,COALESCE(SUM(CASE WHEN kind IN ('sale','refund') THEN amount ELSE 0 END),0) collected,COALESCE(SUM(CASE WHEN kind='expense' THEN -amount ELSE 0 END),0) expenses,COALESCE(SUM(CASE WHEN kind='income' THEN amount ELSE 0 END),0) other FROM ledger",
    );
    const fees=this.one("SELECT COALESCE(-SUM(amount),0) fees FROM ledger WHERE kind='expense' AND note LIKE 'Comisión tarjeta%'").fees as number;
    const shrinkage=this.one("SELECT COALESCE(-SUM(m.qty*l.cost),0) n FROM stock_moves m JOIN lots l ON l.id=m.lotId WHERE m.kind='adjust'").n as number;
    return {
      shrinkage,
      ...s,
      ...l,
      fees,
      grossRevenue:s.revenue,
      netSales:s.revenue-fees,
      netCollected:l.collected-fees,
      operatingOutflows:l.expenses-fees,
      marginPercent:s.revenue?(s.revenue-s.cost)/s.revenue*100:0,
      receivable: this.receivable("", "9999"),
      gross: s.revenue - s.cost,
      result: s.revenue - s.cost - l.expenses + l.other - shrinkage,
    };
  }
  companies(includeArchived = false) {
    return this.all(
      `SELECT * FROM companies ${includeArchived ? "" : "WHERE active=1"} ORDER BY name`,
    );
  }
  locations(includeArchived = false) {
    return this.all(
      `SELECT l.*,c.name company FROM locations l LEFT JOIN companies c ON c.id=l.companyId ${includeArchived ? "" : "WHERE l.active=1"} ORDER BY l.name`,
    );
  }
  relation(type: string, key: string) {
    return (
      this.db.getFirstSync<Row>(
        "SELECT companyId,locationId FROM relations WHERE entityType=? AND entityId=?",
        type,
        key,
      ) || { companyId: null, locationId: null }
    );
  }
  link(
    type: string,
    key: string,
    companyId: string | null,
    locationId: string | null,
  ) {
    assert(
      ["product", "customer", "campaign", "sale"].includes(type),
      "Relación inválida.",
    );
    const table = {
      product: "products",
      customer: "customers",
      campaign: "campaigns",
      sale: "sales",
    }[type]!;
    this.one(`SELECT id FROM ${table} WHERE id=?`, key);
    if (companyId)
      this.one("SELECT id FROM companies WHERE id=? AND active=1", companyId);
    if (locationId) {
      const l = this.one(
        "SELECT * FROM locations WHERE id=? AND active=1",
        locationId,
      );
      assert(
        !companyId || !l.companyId || l.companyId === companyId,
        "La ubicación pertenece a otra compañía.",
      );
    }
    this.run(
      "INSERT OR REPLACE INTO relations VALUES(?,?,?,?)",
      type,
      key,
      companyId,
      locationId,
    );
  }
  saveCompany(input: Row) {
    required(input.name);
    const key = input.id || id();
    assert(
      ["Mi negocio", "Proveedor", "Cliente empresa", "Socio", "Otro"].includes(
        input.kind,
      ),
      "Tipo de compañía inválido.",
    );
    this.transaction(() => {
      if (input.id) this.one("SELECT id FROM companies WHERE id=?", key);
      this.run(
        "INSERT INTO companies VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,phone=excluded.phone,email=excluded.email,notes=excluded.notes,active=excluded.active",
        key,
        input.name.trim(),
        input.kind,
        input.phone || "",
        input.email || "",
        input.notes || "",
        input.active === false ? 0 : 1,
      );
      this.audit("company.save", key);
    });
    return key;
  }
  saveLocation(input: Row) {
    required(input.name);
    const key = input.id || id();
    assert(
      ["Tienda", "Almacén", "Entrega", "Otra"].includes(input.kind),
      "Tipo de ubicación inválido.",
    );
    this.transaction(() => {
      if (input.id) this.one("SELECT id FROM locations WHERE id=?", key);
      if (input.companyId)
        this.one(
          "SELECT id FROM companies WHERE id=? AND active=1",
          input.companyId,
        );
      this.run(
        "INSERT INTO locations VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,companyId=excluded.companyId,kind=excluded.kind,address=excluded.address,notes=excluded.notes,active=excluded.active",
        key,
        input.name.trim(),
        input.companyId || null,
        input.kind,
        input.address || "",
        input.notes || "",
        input.active === false ? 0 : 1,
      );
      this.audit("location.save", key);
    });
    return key;
  }
  saveCustomer(input: Row) {
    let key = "";
    this.transaction(() => {
      key = this.customer(
        input.name,
        input.phone || "",
        input.notes || "",
        input.stage || "Prospecto",
        input.nextDate || "",
        input.id,
      );
      this.link(
        "customer",
        key,
        input.companyId || null,
        input.locationId || null,
      );
    });
    return key;
  }
  customers() {
    const relations = this.relationsMap("customer");
    const meta = this.settingsMap("customer:");
    return this.all("SELECT * FROM customers ORDER BY name").map((c): Row => ({
      ...c,
      ...(relations.get(c.id) ?? { companyId: null, locationId: null }),
      archived: meta.get(c.id)?.archived === true,
    }));
  }
  saveCampaign(input: Row) {
    required(input.name);
    required(input.channel);
    date(input.start || "");
    date(input.end || "");
    assert(
      !input.start || !input.end || input.start <= input.end,
      "La fecha final precede al inicio.",
    );
    integer(input.budget || 0);
    assert(
      ["Borrador", "Activa", "Pausada", "Finalizada"].includes(
        input.status || "Borrador",
      ),
      "Estado inválido.",
    );
    const key = input.id || id();
    const code = (input.code || "CAM-" + key.slice(-6)).trim().toUpperCase();
    this.transaction(() => {
      if (input.id) {
        this.one("SELECT id FROM campaigns WHERE id=?", key);
        this.run(
          "UPDATE campaigns SET name=?,channel=?,code=? WHERE id=?",
          input.name.trim(),
          input.channel,
          code,
          key,
        );
      } else
        this.run(
          "INSERT INTO campaigns VALUES(?,?,?,?)",
          key,
          input.name.trim(),
          input.channel,
          code,
        );
      this.setSetting("campaign:" + key, {
        status: input.status || "Borrador",
        budget: input.budget || 0,
        start: input.start || "",
        end: input.end || "",
        notes: input.notes || "",
      });
      this.link(
        "campaign",
        key,
        input.companyId || null,
        input.locationId || null,
      );
      this.audit("campaign.save", key);
    });
    return key;
  }
  quickProduct(input: Row) {
    required(input.name);
    integer(input.price);
    integer(input.qty || 0);
    if (input.qty) integer(input.cost);
    const originalSku = input.id
      ? this.one("SELECT sku FROM products WHERE id=?", input.id).sku
      : null;
    const key = input.id || id();
    const sku =
      input.sku?.trim().toUpperCase() ||
      "NS-AUTO-" + key.slice(-8).toUpperCase();
    let productId = key;
    // Código de barras (lector USB/Bluetooth o cámara): único por producto.
    const barcode = input.barcode !== undefined ? String(input.barcode || "").trim().toUpperCase().slice(0, 40) : undefined;
    if (barcode) {
      const other = this.stock().find((p) => p.id !== input.id && String(p.barcode || "").toUpperCase() === barcode);
      assert(!other, `Ese código de barras ya es de ${other?.name}.`);
    }
    this.transaction(() => {
      if (input.id)
        this.updateProduct(
          key,
          sku,
          input.name,
          input.category || "General",
          input.price,
          input.minimum ?? 1,
        );
      else
        productId = this.addProduct(
          sku,
          input.name,
          input.category || "General",
          input.price,
          input.minimum ?? 1,
        );
      const previous = this.setting("product:" + productId, {});
      this.setSetting("product:" + productId, {
        ...previous,
        imageKey: previous.imageKey || originalSku || sku,
        imageUri: input.imageUri ?? previous.imageUri ?? null,
        sourceName: input.name,
        brand: input.brand || "",
        flavor: input.flavor || "",
        presentation: input.presentation || "",
        description: input.description ?? previous.description ?? "",
        notes: input.notes ?? previous.notes ?? "",
        inventoryKnown: input.qty ? true : (previous.inventoryKnown ?? false),
        barcode: barcode ?? previous.barcode ?? "",
      });
      this.link("product", productId, input.companyId || null, null);
      if (!input.id && input.qty) {
        const lot = this.receive(
          productId,
          "Alta inicial",
          input.expires || "",
          input.qty,
          input.cost,
          null,
        );
        if (input.locationId) this.assignLot(lot, input.locationId);
      }
    });
    return productId;
  }
  assignLot(lotId: string, locationId: string) {
    this.transaction(() => {
      this.one("SELECT id FROM lots WHERE id=?", lotId);
      this.one("SELECT id FROM locations WHERE id=? AND active=1", locationId);
      this.run(
        "INSERT OR REPLACE INTO lot_locations VALUES(?,?)",
        lotId,
        locationId,
      );
      this.audit("stock.location", lotId, locationId);
    });
  }
  lots() {
    return this.all(
      "SELECT l.*,p.name product,p.sku,lc.locationId,lo.name location FROM lots l JOIN products p ON p.id=l.productId LEFT JOIN lot_locations lc ON lc.lotId=l.id LEFT JOIN locations lo ON lo.id=lc.locationId ORDER BY p.name,l.expires",
    );
  }
  receiveAt(
    productId: string,
    label: string,
    expires: string,
    qty: number,
    cost: number,
    accountId: string | null,
    locationId: string | null,
  ) {
    let key = "";
    this.transaction(() => {
      key = this.receive(productId, label, expires, qty, cost, accountId);
      if (locationId) this.assignLot(key, locationId);
    });
    return key;
  }
  updateSaleDetails(saleId: string, input: Row) {
    this.transaction(() => {
      const sale = this.sale(saleId);
      assert(sale && sale.status === "confirmed", "Venta no editable.");
      assert(
        input.customerId || sale.paid >= sale.total,
        "Una venta con saldo requiere cliente.",
      );
      required(input.channel);
      this.run(
        "UPDATE sales SET customerId=?,campaignId=?,channel=? WHERE id=?",
        input.customerId || null,
        input.campaignId || null,
        input.channel,
        saleId,
      );
      this.link(
        "sale",
        saleId,
        input.companyId || null,
        input.locationId || null,
      );
      const before = this.setting("sale:" + saleId, {});
      this.setSetting("sale:" + saleId, {
        ...before,
        notes: input.notes || "",
      });
      this.audit(
        "sale.details",
        saleId,
        "Se conserva importe, cobros, costo y fecha.",
      );
    });
  }
  /**
   * Movimiento de la caja (cuentas tipo Efectivo) en un periodo, separado por
   * origen: así las aportaciones o traspasos no se confunden con ventas.
   */
  cashSummary(from: string, to: string): Row {
    const rows = this.all(
      "SELECT CASE WHEN l.kind='expense' AND l.note LIKE 'Comisión tarjeta%' THEN 'fee' ELSE l.kind END k,SUM(l.amount) amount FROM ledger l JOIN accounts a ON a.id=l.accountId WHERE a.kind='Efectivo' AND l.created>=? AND l.created<? GROUP BY k",
      from,
      to,
    );
    const by: Record<string, number> = Object.fromEntries(rows.map((r) => [r.k, r.amount]));
    const sales = (by.sale || 0) + (by.refund || 0);
    const expenses = -(by.expense || 0) - (by.fee || 0);
    const purchases = -(by.purchase || 0);
    const others = (
      [
        ["capital", "Aportaciones"],
        ["income", "Otros ingresos"],
        ["withdrawal", "Retiros"],
        ["transfer", "Traspasos entre cuentas"],
        ["opening", "Saldos iniciales"],
      ] as const
    )
      .map(([kind, label]) => ({ kind, label, amount: by[kind] || 0 }))
      .filter((x) => x.amount);
    const balanceAt = (iso: string) =>
      this.one("SELECT COALESCE(SUM(l.amount),0) n FROM ledger l JOIN accounts a ON a.id=l.accountId WHERE a.kind='Efectivo' AND l.created<?", iso).n as number;
    return {
      sales,
      expenses,
      purchases,
      operating: sales - expenses - purchases,
      others,
      otherTotal: others.reduce((n, x) => n + x.amount, 0),
      opening: balanceAt(from),
      closing: balanceAt(to),
    };
  }
  /** Paquetes con sus componentes (dos consultas en total). */
  bundles(): Row[] {
    const items = new Map<string, Row[]>();
    for (const i of this.all("SELECT i.*,p.name FROM bundle_items i JOIN products p ON p.id=i.productId ORDER BY p.name")) {
      const list = items.get(i.bundleId) ?? [];
      list.push(i);
      items.set(i.bundleId, list);
    }
    return this.all("SELECT * FROM bundles ORDER BY name").map((b) => ({ ...b, items: items.get(b.id) ?? [] }));
  }
  /**
   * 1.9 · La comisión ya no va dentro del precio: se suma al cobrar. Regresa una
   * sola vez el catálogo (productos y paquetes) al precio original, el de antes
   * del +4.06% de la 1.7:
   * - Precio sin cambios desde entonces → exactamente el precio anterior guardado.
   * - Precio en pesos cerrados (lo escribiste tú después) → se respeta.
   * - Cualquier otro (ya traía la comisión) → precio ÷ 1.0406.
   * Guarda qué cambió. Sin la marca de la 1.7 (instalación nueva o respaldo
   * anterior) solo deja la marca.
   */
  restoreBasePrices(): number {
    if (this.setting("pricing", null)) return 0;
    const cu = this.setting("catalogUplift", null) as Row | null;
    const changed: Row = { products: {}, bundles: {} };
    let n = 0;
    this.transaction(() => {
      if (cu) {
        const history: Row[] = Array.isArray(cu.history) ? cu.history : [];
        const firstBps = Number(history[0]?.from ?? cu.bps) || CATALOG_UPLIFT_BPS;
        const nowBps = Number(cu.bps) || CATALOG_UPLIFT_BPS;
        const base = (price: number, orig: unknown) => {
          if (Number.isSafeInteger(orig)) {
            let expected = upliftPrice(orig as number, firstBps);
            for (const h of history) expected = Math.round((expected * (10000 + Number(h.to))) / (10000 + Number(h.from)));
            if (price === expected) return orig as number;
          }
          if (price % 100 === 0) return price;
          return Math.round((price * 10000) / (10000 + nowBps));
        };
        for (const [table, key] of [["products", "products"], ["bundles", "bundles"]] as const)
          for (const r of this.all(`SELECT id,price FROM ${table}`)) {
            const to = base(r.price, cu[key]?.[r.id]);
            if (to === r.price) continue;
            this.run(`UPDATE ${table} SET price=? WHERE id=?`, to, r.id);
            changed[key][r.id] = [r.price, to];
            n++;
          }
      }
      this.setSetting("pricing", { mode: "precio+comisión", at: new Date().toISOString(), changed });
      if (n) this.audit("catalog.restore", "catalog", `Precios sin comisión: ${Object.keys(changed.products).length} productos, ${Object.keys(changed.bundles).length} paquetes. La comisión se suma al cobrar.`);
    });
    return n;
  }
  /** Borra la copia interna completa que la 0.8 guardaba dentro de la base. */
  cleanupLegacy(): boolean {
    if (!this.db.getFirstSync("SELECT key FROM settings WHERE key='beforeRelease08'")) return false;
    this.transaction(() => {
      this.run("DELETE FROM settings WHERE key='beforeRelease08'");
      this.audit("maintenance", "beforeRelease08", "Copia interna previa a 0.8 eliminada (los respaldos externos no cambian).");
    });
    return true;
  }
  /** Fotos propias de productos guardadas en sus metadatos. */
  productPhotos(): { id: string; imageUri: string }[] {
    const out: { id: string; imageUri: string }[] = [];
    for (const [id, m] of this.settingsMap("product:")) if (m && typeof m.imageUri === "string" && m.imageUri) out.push({ id, imageUri: m.imageUri });
    return out;
  }
  setProductPhoto(productId: string, imageUri: string | null) {
    this.setSetting("product:" + productId, { ...this.setting("product:" + productId, {}), imageUri });
  }
  /**
   * Modifica una venta activa: cambia cantidades, quita o agrega productos y
   * ajusta el total. Las unidades devueltas regresan al mismo lote; las nuevas
   * salen por caducidad (FEFO). Si lo cobrado supera el nuevo total, registra
   * la devolución de la diferencia en la cuenta elegida. Conserva folio y fecha.
   */
  reviseSale(
    saleId: string,
    items: { productId: string; qty: number }[],
    total: number,
    opts: { refundAccountId?: string | null; refund?: number | null; allowBelowCost?: boolean; note?: string; base?: number | null } = {},
  ) {
    integer(total);
    assert(items.length > 0, "Deja al menos un producto. Para devolver todo usa Cancelar venta.");
    const wanted = new Map<string, number>();
    for (const i of items) {
      integer(i.qty, 1);
      wanted.set(i.productId, (wanted.get(i.productId) ?? 0) + i.qty);
    }
    const result = { before: 0, after: total, refund: 0, returned: 0, added: 0, balance: 0 };
    this.transaction(() => {
      const sale = this.one("SELECT * FROM sales WHERE id=?", saleId);
      assert(sale.status === "confirmed", "Solo se pueden modificar ventas activas.");
      result.before = sale.total;
      const now = new Date().toISOString();
      const allocations = this.all(
        "SELECT a.*,l.productId FROM allocations a JOIN sale_lines l ON l.id=a.lineId WHERE l.saleId=? ORDER BY a.rowid",
        saleId,
      );
      assert(
        allocations.every((a) => !this.reservedForLotAllocation(a.id)),
        "Esta venta tiene entregas pendientes de la carga inicial; no se puede modificar desde aquí.",
      );
      const lines = () => this.all("SELECT * FROM sale_lines WHERE saleId=? ORDER BY rowid", saleId);
      const oldQty = new Map<string, number>();
      for (const l of lines()) oldQty.set(l.productId, (oldQty.get(l.productId) ?? 0) + l.qty);
      const locationId = this.relation("sale", saleId).locationId as string | null;
      for (const productId of new Set([...oldQty.keys(), ...wanted.keys()])) {
        const before = oldQty.get(productId) ?? 0;
        const after = wanted.get(productId) ?? 0;
        if (after < before) {
          // Devolución: regresa al lote de donde salió (la asignación más reciente primero).
          let remove = before - after;
          result.returned += remove;
          for (const a of allocations.filter((x) => x.productId === productId).reverse()) {
            if (!remove) break;
            const take = Math.min(remove, a.qty);
            this.run("UPDATE lots SET qty=qty+? WHERE id=?", take, a.lotId);
            this.run("INSERT INTO stock_moves VALUES(?,?,?,?,?,?,?)", id(), now, a.lotId, take, "return", saleId, "Devolución parcial");
            if (take === a.qty) this.run("DELETE FROM allocations WHERE id=?", a.id);
            else this.run("UPDATE allocations SET qty=qty-? WHERE id=?", take, a.id);
            const line = this.one("SELECT * FROM sale_lines WHERE id=?", a.lineId);
            if (line.qty === take) {
              this.run("DELETE FROM settings WHERE key=?", "line:" + line.id);
              this.run("DELETE FROM sale_lines WHERE id=?", line.id);
            } else this.run("UPDATE sale_lines SET qty=qty-? WHERE id=?", take, line.id);
            remove -= take;
          }
          assert(remove === 0, "No se pudo devolver el producto a su lote.");
        } else if (after > before) {
          let add = after - before;
          result.added += add;
          const product = this.one("SELECT * FROM products WHERE id=?", productId);
          let line = this.db.getFirstSync<Row>("SELECT * FROM sale_lines WHERE saleId=? AND productId=? ORDER BY rowid", saleId, productId);
          if (!line) {
            const key = id();
            this.run("INSERT INTO sale_lines VALUES(?,?,?,?,?)", key, saleId, productId, add, product.name);
            line = { id: key };
          } else this.run("UPDATE sale_lines SET qty=qty+? WHERE id=?", add, line.id);
          const lots = this.all(
            "SELECT * FROM lots WHERE productId=? AND qty>0 AND (expires='' OR expires>=?) ORDER BY CASE WHEN expires='' THEN 1 ELSE 0 END,expires,id",
            productId,
            today(),
          );
          for (const lot of lots) {
            if (!add) break;
            if (locationId && !this.db.getFirstSync("SELECT lotId FROM lot_locations WHERE lotId=? AND locationId=?", lot.id, locationId)) continue;
            const take = Math.min(add, lot.qty - this.reservedForLot(lot.id));
            if (take <= 0) continue;
            this.run("INSERT INTO allocations VALUES(?,?,?,?,?)", id(), line.id, lot.id, take, lot.cost);
            this.run("UPDATE lots SET qty=qty-? WHERE id=?", take, lot.id);
            this.run("INSERT INTO stock_moves VALUES(?,?,?,?,?,?,?)", id(), now, lot.id, -take, "sale", saleId, product.name);
            add -= take;
          }
          assert(add === 0, `Existencias vendibles insuficientes: ${product.name}.`);
        }
      }
      const cost = this.one(
        "SELECT COALESCE(SUM(a.qty*a.cost),0) n FROM allocations a JOIN sale_lines l ON l.id=a.lineId WHERE l.saleId=?",
        saleId,
      ).n as number;
      assert(total >= cost || opts.allowBelowCost, "El nuevo total queda debajo del costo. Activa la autorización si corresponde.");
      this.run("UPDATE sales SET total=?,cost=? WHERE id=?", total, cost, saleId);
      // Si la venta lleva comisión al cliente, el nuevo total también la incluye.
      const saleMeta = this.setting("sale:" + saleId, {});
      const commBps = Number(saleMeta.commissionBps);
      const withFee = saleMeta.commission > 0 && Number.isSafeInteger(commBps);
      const splitBase = withFee ? (Number.isSafeInteger(opts.base) && (opts.base as number) <= total ? (opts.base as number) : baseOf(total, commBps)) : total;
      const split = { base: splitBase, commission: total - splitBase };
      if (withFee) this.setSetting("sale:" + saleId, { ...saleMeta, basePrice: split.base, commission: split.commission });
      // Reparte el nuevo total (sin comisión) entre los renglones según su precio de lista.
      const current = lines();
      const listValues = current.map((l) => {
        const meta = this.setting("line:" + l.id, null);
        const unit = meta && Number.isSafeInteger(meta.unitPrice) ? meta.unitPrice : this.one("SELECT price FROM products WHERE id=?", l.productId).price;
        return { line: l, unit, value: unit * l.qty, meta: meta || {} };
      });
      const listTotal = listValues.reduce((n, x) => n + x.value, 0);
      let running = 0,
        assigned = 0;
      listValues.forEach((x, index) => {
        running += x.value;
        const cumulative = index === listValues.length - 1 ? split.base : listTotal ? Math.round((split.base * running) / listTotal) : 0;
        const lineTotal = cumulative - assigned;
        assigned = cumulative;
        this.setSetting("line:" + x.line.id, { ...x.meta, unitPrice: x.unit, discount: x.value - lineTotal, delivered: x.line.qty });
      });
      // Dinero: devolución de lo cobrado de más.
      const paid = this.one("SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE ref=? AND kind='sale'", saleId).n as number;
      const refund = opts.refund ?? Math.max(0, paid - total);
      integer(refund);
      assert(refund <= paid, "No puedes devolver más de lo que se cobró.");
      assert(paid - refund <= total, `Lo cobrado supera el nuevo total: devuelve al menos ${money(paid - total)}.`);
      if (refund) {
        const accountId = opts.refundAccountId;
        assert(accountId, "Elige la cuenta de donde sale la devolución.");
        assert(this.balance(accountId) >= refund, "Saldo insuficiente en esa cuenta para devolver.");
        this.ledger(accountId, -refund, "sale", saleId, "Devolución parcial");
      }
      result.refund = refund;
      result.balance = total - (paid - refund);
      assert(result.balance === 0 || sale.customerId, "La venta quedaría con saldo pendiente: asígnale un cliente primero (Editar seguimiento).");
      const meta = this.setting("sale:" + saleId, {});
      this.setSetting("sale:" + saleId, {
        ...meta,
        revisions: (meta.revisions || 0) + 1,
        ...(opts.note?.trim() ? { notes: [meta.notes, opts.note.trim()].filter(Boolean).join("\n") } : {}),
      });
      this.audit("sale.revise", saleId, `${money(sale.total)} → ${money(total)} · devueltas ${result.returned} · agregadas ${result.added} · devolución ${money(refund)}`);
    });
    return result;
  }
  /** Alta de un cliente creado por un vendedor (mismo id que en la base en línea). */
  importCustomer(id: string, name: string, phone: string): boolean {
    required(id);
    if (this.db.getFirstSync("SELECT id FROM customers WHERE id=?", id)) return false;
    this.transaction(() => {
      this.run("INSERT INTO customers VALUES(?,?,?,?,?,?)", id, String(name || "Cliente").trim().slice(0, 120) || "Cliente", String(phone || "").slice(0, 30), "", "Cliente", "");
      this.audit("customer.import", id, "Alta hecha por un vendedor");
    });
    return true;
  }
  /**
   * Registra una venta hecha por un vendedor en su teléfono (precio de lista,
   * pago completo). Conserva la fecha y hora en que se vendió. Idempotente.
   */
  /** ¿Ese pago de Mercado Pago (número de operación) ya está ligado a alguna venta? */
  paymentLinked(paymentId: string): boolean {
    if (!/^\d{1,20}$/.test(paymentId)) return false;
    return !!this.db.getFirstSync<Row>(
      "SELECT key FROM settings WHERE key LIKE 'sale:%' AND (value LIKE ? OR value LIKE ?) LIMIT 1",
      `%"referenceId":"${paymentId}"%`,
      `%"orderId":"PAY-${paymentId}"%`,
    );
  }
  applyRemoteSale(row: Row, accountId: string): string {
    const already = this.setting("remote:" + row.id, null);
    if (already) return already;
    const items = (Array.isArray(row.items) ? row.items : []).map((i: Row) => ({ productId: String(i.productId), qty: Number(i.qty) }));
    assert(items.length, "La venta no trae productos.");
    // Un cobro con tarjeta solo puede pagar UNA venta (también contra las tuyas).
    const orderId = row.mp?.orderId ? String(row.mp.orderId) : "";
    if (orderId) {
      assert(/^[A-Za-z0-9_-]{1,80}$/.test(orderId), "Cobro con tarjeta inválido.");
      const used = this.db.getFirstSync<Row>(
        "SELECT key FROM settings WHERE key LIKE 'sale:%' AND (value LIKE ? OR value LIKE ?) LIMIT 1",
        `%"mpOrderId":"${orderId}"%`,
        `%"orderId":"${orderId}"%`,
      );
      assert(!used, "Ese cobro con tarjeta ya está registrado en otra venta.");
      // 2.0.3: cobro hecho directo en la terminal (PAY-…): el pago no puede estar ya en otra venta.
      const ref = String(row.mp?.referenceId || "");
      assert(!ref || !this.paymentLinked(ref), "Ese pago de Mercado Pago ya está registrado en otra venta.");
    }
    integer(Number(row.total));
    let saleId = "";
    this.transaction(() => {
      let customerId: string | null = row.customer_id || null;
      if (customerId) this.importCustomer(customerId, row.customer_name || "Cliente", row.customer_phone || "");
      // El servidor cobra tu precio de lista (− promociones) + la comisión que absorbe el cliente;
      // se separa igual que en las ventas del dueño. Se registra lo que el vendedor realmente cobró.
      const rows: Row[] = Array.isArray(row.items) ? row.items : [];
      const charged = Number.isSafeInteger(Number(row.client_total)) && Number(row.client_total) > 0 && !row.mp?.orderId ? Number(row.client_total) : Number(row.total);
      integer(charged);
      const list = rows.reduce((n: number, i: Row) => n + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
      const sub = Number.isSafeInteger(Number(row.subtotal)) && Number(row.subtotal) > 0 ? Number(row.subtotal) : list;
      const promo = Number.isSafeInteger(Number(row.promo)) && Number(row.promo) > 0 ? Number(row.promo) : 0;
      const base = Math.max(0, sub - promo);
      const commission = base > 0 && charged > base ? charged - base : 0;
      const bps = Number.isSafeInteger(Number(row.fee_bps)) && Number(row.fee_bps) > 0 ? Number(row.fee_bps) : this.feeBps();
      const lineInfo: Record<string, { price?: number; discount?: number }> = {};
      for (const i of rows) if (i.productId) lineInfo[String(i.productId)] = { price: Number.isSafeInteger(Number(i.price)) ? Number(i.price) : undefined, discount: Number(i.discount) || 0 };
      saleId = this.sell(items, charged, charged, accountId, customerId, null, "Vendedor", true, null, commission > 0 && commission < charged ? { amount: commission, bps } : null, rows.length ? lineInfo : null);
      const promoNames = [...new Set(rows.filter((i) => Number(i.discount) > 0 && i.promo).map((i) => String(i.promo)))];
      const when = new Date(row.created_at);
      if (!isNaN(when.getTime()) && when.getTime() <= Date.now() + 5 * 60000) {
        const iso = when.toISOString();
        this.run("UPDATE sales SET created=? WHERE id=?", iso, saleId);
        this.run("UPDATE ledger SET created=? WHERE ref=?", iso, saleId);
        this.run("UPDATE stock_moves SET created=? WHERE ref=?", iso, saleId);
      }
      const mp = row.mp || null;
      this.setSetting("sale:" + saleId, {
        ...this.setting("sale:" + saleId, {}),
        folio: row.folio || "V-" + String(row.id).replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase(),
        seller: row.seller_name || "Vendedor",
        sellerId: row.seller_id || "",
        remoteId: row.id,
        notes: row.note || "",
        ...(promoNames.length ? { promos: promoNames.map((name) => ({ name, amount: rows.filter((i) => i.promo === name).reduce((n, i) => n + (Number(i.discount) || 0), 0) })) } : {}),
        ...(row.transfer_id ? { transferId: row.transfer_id, transferLabel: ((this.setting("transferAccounts", []) as Row[]).find((t) => t.id === row.transfer_id)?.label as string) || row.transfer_id } : {}),
        ...(mp?.orderId
          ? {
              mpOrderId: mp.orderId,
              mpPaymentId: mp.paymentId || "",
              mpPayments: [{ orderId: mp.orderId, kind: "venta", amount: charged, paymentId: mp.paymentId || "", referenceId: mp.referenceId || "", feeId: this.lastFeeEntry(saleId)?.id || "", at: row.created_at, card: mp.card || {} }],
            }
          : {}),
      });
      this.setSetting("remote:" + row.id, saleId);
      this.audit("sale.remote", saleId, `Venta de ${row.seller_name || "vendedor"} (${row.method})`);
    });
    return saleId;
  }
  /** Ejecuta `task` y deshace todo: sirve para validar antes de cobrar o devolver en Mercado Pago. */
  dryRun(task: () => void) {
    assert(this.depth === 0, "Validación no disponible dentro de otra operación.");
    const ROLLBACK = new Error("__dry_run__");
    try {
      this.transaction(() => {
        task();
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  }
  backup() {
    const data: Record<string, Row[]> = {};
    this.transaction(() => {
      for (const t of TABLES) data[t] = this.all(`SELECT * FROM ${t}`);
      // La sesión de pantalla y la copia interna previa a 0.8 no se exportan:
      // duplicaban el tamaño de cada respaldo.
      data.settings = data.settings.filter((r) => !BACKUP_EXCLUDED.includes(r.key));
    });
    return JSON.stringify(
      {
        app: "nova-negocio",
        version: 2,
        created: new Date().toISOString(),
        data,
      },
      null,
      2,
    );
  }
  restore(raw: string) {
    assert(raw.length < 20_000_000, "Respaldo demasiado grande.");
    const backup = JSON.parse(raw);
    assert(
      backup.app === "nova-negocio" && [1, 2].includes(backup.version),
      "Respaldo incompatible.",
    );
    const d = backup.data;
    if (backup.version === 1 && d)
      for (const t of ["companies", "locations", "relations", "lot_locations"])
        d[t] = [];
    assert(d && typeof d === "object", "Respaldo inválido.");
    this.transaction(() => {
      const kept = this.all(`SELECT key,value FROM settings WHERE key IN (${KEEP_ON_RESTORE.map(() => "?").join(",")})`, ...KEEP_ON_RESTORE);
      for (const t of [...TABLES].reverse()) this.run(`DELETE FROM ${t}`);
      for (const t of TABLES) {
        assert(
          Array.isArray(d[t]) && d[t].length <= 100000,
          "Respaldo incompleto.",
        );
        const cols = this.all(`PRAGMA table_info(${t})`).map((c) => c.name);
        for (const row of d[t]) {
          assert(
            row &&
              typeof row === "object" &&
              Object.keys(row).length === cols.length &&
              cols.every((c) => c in row),
            "Estructura inválida.",
          );
          const values = cols.map((c) => row[c]);
          assert(
            values.every(
              (v) =>
                v === null ||
                typeof v === "string" ||
                (typeof v === "number" && Number.isSafeInteger(v)),
            ),
            "Dato inválido.",
          );
          this.run(
            `INSERT INTO ${t} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
            ...values,
          );
        }
      }
      // Lo que es de este teléfono (PIN, sesión, rol…) nunca lo decide el archivo.
      this.run(`DELETE FROM settings WHERE key IN (${BACKUP_EXCLUDED.map(() => "?").join(",")})`, ...BACKUP_EXCLUDED);
      for (const k of kept) this.run("INSERT OR REPLACE INTO settings VALUES(?,?)", k.key, k.value);
      assert(
        this.all("PRAGMA foreign_key_check").length === 0,
        "Referencias inválidas.",
      );
      assert(
        this.all(
          "SELECT l.id FROM lots l WHERE l.qty != COALESCE((SELECT SUM(qty) FROM stock_moves WHERE lotId=l.id),0)",
        ).length === 0,
        "El inventario del respaldo no cuadra.",
      );
      assert(
        this.all(
          "SELECT id FROM sales WHERE status NOT IN ('confirmed','cancelled')",
        ).length === 0,
        "Estado de venta inválido.",
      );
      assert(
        this.all(
          "SELECT id FROM ledger WHERE kind NOT IN ('opening','purchase','sale','refund','expense','income','capital','withdrawal','transfer')",
        ).length === 0,
        "Movimiento desconocido.",
      );
      assert(
        this.all(
          "SELECT accountId FROM ledger GROUP BY accountId HAVING SUM(amount)<0",
        ).length === 0,
        "Saldo negativo no permitido.",
      );
      assert(
        this.all(
          "SELECT ref FROM ledger WHERE kind='transfer' GROUP BY ref HAVING COUNT(*)!=2 OR SUM(amount)!=0",
        ).length === 0,
        "Traspaso incompleto.",
      );
      assert(
        this.all(
          "SELECT s.id FROM sales s WHERE s.cost != COALESCE((SELECT SUM(a.qty*a.cost) FROM allocations a JOIN sale_lines l ON l.id=a.lineId WHERE l.saleId=s.id),0)",
        ).length === 0,
        "Costo histórico inconsistente.",
      );
      assert(
        this.all(
          "SELECT l.id FROM sale_lines l WHERE l.qty != COALESCE((SELECT SUM(qty) FROM allocations WHERE lineId=l.id),0)",
        ).length === 0,
        "Asignación de lotes incompleta.",
      );
      assert(
        this.all(
          "SELECT s.id FROM sales s WHERE COALESCE((SELECT SUM(amount) FROM ledger WHERE ref=s.id AND kind='sale'),0)>s.total",
        ).length === 0,
        "Cobro superior a la venta.",
      );
      assert(
        this.all(
          "SELECT s.id FROM sales s WHERE s.status='cancelled' AND COALESCE((SELECT SUM(amount) FROM ledger WHERE ref=s.id AND kind IN ('sale','refund')),0)!=0",
        ).length === 0,
        "Devolución inconsistente.",
      );
      this.audit("backup.restore", id(), "Restauración completa");
    });
  }
}
