// 2.11.3 · Stock → «Actualizar existencias (Excel)»: el Excel del conteo (el «Reporte de
// stock» de la app, editado) reemplaza las piezas y el precio de cada producto.
//
// 2.11.4:
// - Las piezas quedan EXACTAMENTE como en el Excel (columna «Físicas»): se reemplazan, no se suman.
// - El precio («Precio de Venta» / «Precio») se copia tal cual al precio del producto, sin
//   sumarle la comisión (es el mismo precio que la app exporta en el reporte de stock).
// - «Precio de Compra» / costos, categorías y demás columnas NO se tocan.
// - Se liga por SKU (o, si no hay, por nombre exacto); nunca se crean productos nuevos, así que
//   no se duplica nada. Un producto que venga dos veces en el archivo se marca como error.
// - Se ignora el renglón «Total» del final del reporte.
// - Los productos de la app que no vienen en el Excel no se tocan.
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
  current: number;
  target: number | null;
  price: number | null;
  priceNow: number | null;
  error?: string;
};
export type StockImportPlan = {
  rows: StockImportRow[];
  changes: StockImportRow[];
  missing: StockImportRow[];
  errors: StockImportRow[];
};

const PHYSICAL = ["fisicas", "unidades fisicas", "existencias fisicas", "piezas fisicas", "stock fisico", "inventario fisico"];
const STOCK = ["existencias", "existencia", "stock", "stock actual", "inventario", "piezas", "unidades", "cantidad", "conteo", "contado"];
const PRICE = ["precio de venta", "precio venta", "precio", "precio al cliente", "precio al publico", "precio publico", "tu precio"];

function header(table: Cell[][]): { at: number; sku: number; name: number; qty: number; price: number } {
  for (let at = 0; at < Math.min(table.length, 15); at++) {
    const h = (table[at] || []).map((c) => fold(c));
    const find = (list: string[]) => {
      for (const want of list) {
        const i = h.indexOf(want);
        if (i >= 0) return i;
      }
      return -1;
    };
    const sku = find(["sku", "clave", "codigo interno"]);
    const name = find(["producto", "nombre", "nombre del producto", "articulo"]);
    let qty = find(PHYSICAL);
    if (qty < 0) qty = find(STOCK);
    if ((sku >= 0 || name >= 0) && qty >= 0) return { at, sku, name, qty, price: find(PRICE) };
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
/** Pesos → centavos («488.85», 488.85 o «$1,250.50»). */
function cents(v: Cell): number | null {
  if (v === null || v === undefined || text(v) === "") return null;
  const n = typeof v === "number" ? v : Number(text(v).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error(`Precio: «${text(v)}» no es un importe`);
  return Math.round(n * 100);
}

/** Calcula qué cambia, sin guardar nada. */
export function planStockImport(b: Business, table: Cell[][]): StockImportPlan {
  const h = header(table);
  const products = (b.stock() as Row[]).filter((p) => !p.archived);
  const bySku = new Map(products.map((p) => [String(p.sku).toUpperCase(), p]));
  const byName = new Map(products.map((p) => [fold(p.name), p]));
  const rows: StockImportRow[] = [];
  const seen = new Set<string>();
  for (let i = h.at + 1; i < table.length; i++) {
    const r = table[i] || [];
    const sku = h.sku >= 0 ? text(r[h.sku]).toUpperCase() : "";
    const name = h.name >= 0 ? text(r[h.name]) : "";
    if (!sku && !name) continue;
    // Renglón de totales al final del reporte.
    if (["total", "totales"].includes(fold(sku || name)) && !(sku && name)) continue;
    const p = (sku && bySku.get(sku)) || (name ? byName.get(fold(name)) : undefined) || null;
    const row: StockImportRow = {
      line: i + 1,
      sku,
      name,
      productId: p ? String(p.id) : null,
      productName: p ? String(p.name) : name || sku,
      counted: null,
      current: p ? Number(p.stock) || 0 : 0,
      target: null,
      price: null,
      priceNow: p ? Number(p.price) || 0 : null,
    };
    try {
      row.counted = whole(r[h.qty]);
      row.target = row.counted;
      if (h.price >= 0) row.price = cents(r[h.price]);
      if (p && seen.has(p.id)) throw new Error("Este producto viene repetido en el archivo");
      if (p) seen.add(p.id);
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e);
    }
    rows.push(row);
  }
  const errors = rows.filter((r) => r.error);
  const missing = rows.filter((r) => !r.error && !r.productId);
  const changes = rows.filter((r) => !r.error && r.productId && (stockChanges(r) || priceChanges(r)));
  return { rows, changes, missing, errors };
}
export const stockChanges = (r: StockImportRow) => r.target !== null && r.target !== r.current;
export const priceChanges = (r: StockImportRow) => r.price !== null && r.price !== r.priceNow;

/** Aplica los cambios en una sola transacción (corrección sin merma). */
export function applyStockImport(b: Business, plan: StockImportPlan): { stock: number; price: number } {
  let stock = 0,
    price = 0;
  b.transaction(() => {
    for (const r of plan.changes) {
      if (stockChanges(r)) {
        b.correctStock(r.productId!, r.target!, "Conteo desde Excel");
        stock++;
      }
      if (priceChanges(r)) {
        b.run("UPDATE products SET price=? WHERE id=?", r.price, r.productId);
        price++;
      }
    }
    b.audit("stock.import", "excel", `${stock} existencias · ${price} precios`);
  });
  return { stock, price };
}
