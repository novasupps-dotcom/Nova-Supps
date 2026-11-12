// 2.11.3 · Stock → «Actualizar existencias (Excel)»: el Excel del conteo (el «Reporte de
// stock» de la app, editado) deja las Unidades físicas de cada producto.
//
// - Se liga por SKU (o, si no hay, por nombre exacto). Los renglones sin producto se listan aparte.
// - Usa la columna «Físicas» (o «Existencias»/«Stock»); «Mínimo» también se actualiza.
// - Precios, costos, categorías y demás columnas NO se tocan.
// - Si el archivo trae fecha en el nombre (Stock_Nova_AAAA-MM-DD_HHMM), las piezas vendidas
//   después de esa hora se descuentan: así el conteo no «regresa» ventas ya hechas.
// - Es una corrección: no mueve dinero ni cuenta como merma.
import type { Business, Row } from "./business";
import { fold, type Cell } from "./catalogImport";

export type StockImportRow = {
  line: number;
  sku: string;
  name: string;
  productId: string | null;
  productName: string;
  counted: number | null;
  soldAfter: number;
  current: number;
  target: number | null;
  minimum: number | null;
  minimumNow: number | null;
  error?: string;
};
export type StockImportPlan = {
  rows: StockImportRow[];
  changes: StockImportRow[];
  missing: StockImportRow[];
  errors: StockImportRow[];
  since: string | null;
};

const PHYSICAL = ["fisicas", "unidades fisicas", "existencias fisicas", "piezas fisicas", "stock fisico", "inventario fisico"];
const STOCK = ["existencias", "existencia", "stock", "stock actual", "inventario", "piezas", "unidades", "cantidad", "conteo", "contado"];
const MINIMUM = ["minimo", "stock minimo", "existencia minima", "inventario minimo"];

/** «Stock_Nova_2026-11-11_1139.xlsx» → ISO de esa hora local; null si el nombre no la trae. */
export function fileDate(name: string): string | null {
  const m = /(\d{4})-(\d{2})-(\d{2})[_ T-]?(\d{2})(\d{2})/.exec(name || "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function header(table: Cell[][]): { at: number; sku: number; name: number; qty: number; min: number } {
  for (let at = 0; at < Math.min(table.length, 15); at++) {
    const h = (table[at] || []).map((c) => fold(c));
    const find = (list: string[]) => h.findIndex((x) => list.includes(x));
    const sku = find(["sku", "clave", "codigo interno"]);
    const name = find(["producto", "nombre", "nombre del producto", "articulo"]);
    let qty = find(PHYSICAL);
    if (qty < 0) qty = find(STOCK);
    if ((sku >= 0 || name >= 0) && qty >= 0) return { at, sku, name, qty, min: find(MINIMUM) };
  }
  throw new Error('No encontré las columnas. El archivo debe tener «SKU» (o «Producto») y «Físicas» (o «Existencias»).');
}

const text = (v: Cell) => (v === null || v === undefined ? "" : String(v).trim());
function whole(v: Cell): number | null {
  if (v === null || v === undefined || text(v) === "") return null;
  const n = typeof v === "number" ? v : Number(text(v).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || Math.round(n) !== n) throw new Error(`«${text(v)}» no es un número entero de piezas`);
  return n;
}

/** Calcula qué cambia, sin guardar nada. */
export function planStockImport(b: Business, table: Cell[][], opts: { since?: string | null } = {}): StockImportPlan {
  const h = header(table);
  const products = (b.stock() as Row[]).filter((p) => !p.archived);
  const bySku = new Map(products.map((p) => [String(p.sku).toUpperCase(), p]));
  const byName = new Map(products.map((p) => [fold(p.name), p]));
  const since = opts.since ?? null;
  const sold = new Map<string, number>();
  if (since)
    for (const r of b.all(
      "SELECT l.productId,COALESCE(SUM(l.qty),0) n FROM sale_lines l JOIN sales s ON s.id=l.saleId WHERE s.status='confirmed' AND s.created>=? GROUP BY l.productId",
      since,
    ))
      sold.set(r.productId, Number(r.n) || 0);
  const rows: StockImportRow[] = [];
  const seen = new Set<string>();
  for (let i = h.at + 1; i < table.length; i++) {
    const r = table[i] || [];
    const sku = h.sku >= 0 ? text(r[h.sku]).toUpperCase() : "";
    const name = h.name >= 0 ? text(r[h.name]) : "";
    if (!sku && !name) continue;
    const p = (sku && bySku.get(sku)) || (name ? byName.get(fold(name)) : undefined) || null;
    const row: StockImportRow = {
      line: i + 1,
      sku,
      name,
      productId: p ? String(p.id) : null,
      productName: p ? String(p.name) : name || sku,
      counted: null,
      soldAfter: p ? sold.get(p.id) ?? 0 : 0,
      current: p ? Number(p.stock) || 0 : 0,
      target: null,
      minimum: null,
      minimumNow: p ? Number(p.minimum) : null,
    };
    try {
      row.counted = whole(r[h.qty]);
      if (h.min >= 0) row.minimum = whole(r[h.min]);
      if (p && seen.has(p.id)) throw new Error("Este producto ya venía en otro renglón");
      if (p) seen.add(p.id);
      if (row.counted !== null) row.target = Math.max(0, row.counted - row.soldAfter);
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e);
    }
    rows.push(row);
  }
  const errors = rows.filter((r) => r.error);
  const missing = rows.filter((r) => !r.error && !r.productId);
  const changes = rows.filter(
    (r) => !r.error && r.productId && ((r.target !== null && r.target !== r.current) || (r.minimum !== null && r.minimum !== r.minimumNow)),
  );
  return { rows, changes, missing, errors, since };
}

/** Aplica los cambios en una sola transacción (corrección sin merma). */
export function applyStockImport(b: Business, plan: StockImportPlan): { stock: number; minimum: number } {
  let stock = 0,
    minimum = 0;
  b.transaction(() => {
    for (const r of plan.changes) {
      if (r.target !== null && r.target !== r.current) {
        b.correctStock(r.productId!, r.target, "Conteo desde Excel");
        stock++;
      }
      if (r.minimum !== null && r.minimum !== r.minimumNow) {
        b.run("UPDATE products SET minimum=? WHERE id=?", r.minimum, r.productId);
        minimum++;
      }
    }
    b.audit("stock.import", "excel", `${stock} existencias · ${minimum} mínimos${plan.since ? ` · desde ${plan.since}` : ""}`);
  });
  return { stock, minimum };
}
