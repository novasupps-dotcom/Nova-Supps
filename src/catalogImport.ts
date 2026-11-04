// 2.6 · Actualizar el catálogo desde Excel (.xlsx) o CSV.
//
// Flujo: el dueño descarga su catálogo actual en Excel, lo edita en la computadora
// o en el teléfono (precios, nombres, categorías, códigos, productos nuevos) y lo
// vuelve a cargar. La app muestra qué cambia antes de aplicarlo y lo aplica en una
// sola transacción. Nunca toca ventas, cobros ni costos históricos.
//
// Reglas:
// - Cada renglón se liga a un producto por SKU (con o sin guiones) y, si no hay SKU,
//   por código de barras. Sin coincidencia → producto nuevo (requiere Nombre y Precio).
// - Una celda vacía NO cambia nada (para borrar un texto escribe un guion "-").
// - "Agregar piezas" suma existencias como un lote nuevo, sin movimiento de caja.
// - La columna "Existencias" es solo informativa: para corregir existencias usa Conteo.
import { strFromU8, unzipSync } from "fflate";
import { cents, money as fmtMoney, today, type Business, type Row } from "./business";
import { findProductByCode, normalizeProductCode, validGtin } from "./barcodes";
import { buildXlsx, type Sheet } from "./xlsx";

export type Cell = string | number | null;

// ---------------------------------------------------------------- lectura de archivos

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function xmlText(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
/** Texto de un <si> o <is>: une los <t> (texto enriquecido incluido) y omite la fonética (<rPh>). */
function richText(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of clean.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += xmlText(m[1] ?? "");
  return out;
}
function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** Primera hoja de un .xlsx → renglones de celdas (texto o número). */
export function readXlsx(bytes: Uint8Array): Cell[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("El archivo no es un Excel válido (.xlsx). Si es .xls antiguo, ábrelo y guárdalo como .xlsx o CSV.");
  }
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : "");
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new Error("El archivo no es un Excel válido (.xlsx).");
  // Hoja: la primera de la lista (la que ve el usuario al abrir), vía sus relaciones.
  const firstSheet = /<sheet\b[^>]*>/.exec(workbook)?.[0] ?? "";
  const rid = attr(firstSheet, "r:id");
  const rels = text("xl/_rels/workbook.xml.rels");
  let target = "";
  if (rid)
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g))
      if (attr(m[0], "Id") === rid) target = attr(m[0], "Target") || "";
  const path = target ? (target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "")) : "";
  const sheetXml = text(path) || text("xl/worksheets/sheet1.xml");
  if (!sheetXml) throw new Error("El Excel no tiene hojas con datos.");
  const shared: string[] = [];
  for (const m of text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) shared.push(richText(m[1] ?? ""));
  const rows: Cell[][] = [];
  for (const rm of sheetXml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowAttr = rm[1] ?? "";
    const r = Number(attr(rowAttr, "r")) || rows.length + 1;
    const row: Cell[] = [];
    let next = 0;
    for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = cm[1];
      const ref = attr(head, "r");
      const i = ref ? colIndex(ref) : next;
      next = i + 1;
      const t = attr(head, "t") || "n";
      const body = cm[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: Cell = null;
      if (t === "s") value = v !== undefined ? (shared[Number(v)] ?? "") : null;
      else if (t === "inlineStr") value = richText(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
      else if (t === "str" || t === "e") value = v !== undefined ? xmlText(v) : null;
      else if (t === "b") value = v === "1" ? "Sí" : "No";
      else if (v !== undefined && v !== "") {
        const n = Number(v);
        value = Number.isFinite(n) ? n : xmlText(v);
      }
      row[i] = value;
    }
    rows[r - 1] = Array.from(row, (x) => (x === undefined ? null : x));
  }
  return Array.from(rows, (x) => x ?? []);
}

/** CSV (coma, punto y coma o tabulador; comillas dobles) → renglones de texto. */
export function readCsv(raw: string): Cell[][] {
  const text = raw.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const sep = count("\t") > count(";") && count("\t") > count(",") ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Detecta el formato por la firma del archivo: ZIP (PK) = .xlsx; si no, texto CSV. */
export function readCatalogFile(bytes: Uint8Array): Cell[][] {
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return readXlsx(bytes);
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf)
    throw new Error("Es un Excel antiguo (.xls). Ábrelo y guárdalo como .xlsx o CSV.");
  return readCsv(decodeText(bytes));
}
/** UTF-8; si no lo es (CSV guardado por Excel en Windows), Windows-1252/Latin-1 para no perder acentos. */
export function decodeText(bytes: Uint8Array): string {
  if (validUtf8(bytes)) return strFromU8(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}
function validUtf8(b: Uint8Array): boolean {
  for (let i = 0; i < b.length; ) {
    const c = b[i];
    const n = c < 0x80 ? 0 : c >= 0xc2 && c <= 0xdf ? 1 : c >= 0xe0 && c <= 0xef ? 2 : c >= 0xf0 && c <= 0xf4 ? 3 : -1;
    if (n < 0) return false;
    for (let k = 1; k <= n; k++) if (i + k >= b.length || (b[i + k] & 0xc0) !== 0x80) return false;
    i += n + 1;
  }
  return true;
}

// ---------------------------------------------------------------- columnas

export type Field =
  | "sku"
  | "name"
  | "category"
  | "price"
  | "minimum"
  | "barcode"
  | "brand"
  | "flavor"
  | "presentation"
  | "description"
  | "active"
  | "addQty"
  | "cost"
  | "expires"
  | "stock";

/** Encabezados de la plantilla (en este orden) y nombres alternativos aceptados. */
export const COLUMNS: { field: Field; header: string; aliases: string[] }[] = [
  { field: "sku", header: "SKU", aliases: ["clave", "codigo interno", "id producto", "folio"] },
  { field: "name", header: "Nombre", aliases: ["producto", "nombre del producto", "articulo", "nombre producto"] },
  { field: "category", header: "Categoría", aliases: ["categoria", "linea", "familia", "tipo"] },
  { field: "price", header: "Precio", aliases: ["precio de venta", "precio venta", "precio publico", "precio al publico", "pvp", "price"] },
  { field: "minimum", header: "Stock mínimo", aliases: ["minimo", "stock minimo", "existencia minima", "inventario minimo"] },
  { field: "barcode", header: "Código de barras", aliases: ["codigo de barras", "codigo barras", "barcode", "ean", "upc", "gtin", "codigo"] },
  { field: "brand", header: "Marca", aliases: ["marca", "brand"] },
  { field: "flavor", header: "Sabor", aliases: ["sabor", "flavor"] },
  { field: "presentation", header: "Presentación", aliases: ["presentacion", "tamano", "contenido"] },
  { field: "description", header: "Descripción", aliases: ["descripcion", "detalle", "descripcion del catalogo"] },
  { field: "active", header: "Activo", aliases: ["activo", "estado", "visible", "a la venta"] },
  { field: "stock", header: "Existencias (solo lectura)", aliases: ["existencias", "existencia", "stock", "stock actual", "inventario", "disponibles"] },
  { field: "addQty", header: "Agregar piezas", aliases: ["agregar", "piezas a agregar", "entrada", "entrada de piezas", "piezas nuevas", "agregar piezas"] },
  { field: "cost", header: "Costo unitario", aliases: ["costo", "costo unitario", "costo por pieza", "cost"] },
  { field: "expires", header: "Caducidad", aliases: ["caducidad", "vence", "vencimiento", "fecha de caducidad"] },
];

// Sin String.normalize (no siempre existe en Hermes): acentos comunes a mano.
const PLAIN: Record<string, string> = { á: "a", à: "a", ä: "a", â: "a", é: "e", è: "e", ë: "e", ê: "e", í: "i", ì: "i", ï: "i", î: "i", ó: "o", ò: "o", ö: "o", ô: "o", ú: "u", ù: "u", ü: "u", û: "u", ñ: "n", ç: "c" };
export const fold = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[áàäâéèëêíìïîóòöôúùüûñç]/g, (ch) => PLAIN[ch] ?? ch)
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function headerMap(row: Cell[]): Map<Field, number> {
  const map = new Map<Field, number>();
  row.forEach((cell, i) => {
    const h = fold(cell);
    if (!h) return;
    const col =
      COLUMNS.find((c) => fold(c.header) === h) ||
      COLUMNS.find((c) => c.aliases.some((a) => fold(a) === h));
    if (col && !map.has(col.field)) map.set(col.field, i);
  });
  return map;
}

// ---------------------------------------------------------------- valores

const str = (v: Cell) => (v === null || v === undefined ? "" : typeof v === "number" ? numText(v) : String(v).trim());
/** Número sin notación científica ni basura de punto flotante (1299.9999999 → 1300). */
function numText(n: number): string {
  if (Number.isInteger(n)) return Math.abs(n) >= 1e21 ? String(n) : n.toFixed(0);
  return String(Math.round(n * 1e6) / 1e6);
}
function money(v: Cell): number {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) throw new Error("importe inválido");
    return Math.round(v * 100);
  }
  return cents(str(v));
}
function whole(v: Cell, what: string): number {
  const t = str(v).replace(/,/g, "");
  const n = Number(t);
  if (!/^\d+(\.0+)?$/.test(t) || !Number.isSafeInteger(n)) throw new Error(`${what}: escribe un número entero (por ejemplo 5)`);
  return n;
}
/** Un código numérico de Excel pierde el cero inicial (012345678905 → 12345678905): se repone si así es un código válido. */
function barcodeOf(v: Cell): string {
  const code = normalizeProductCode(str(v));
  if (/^\d+$/.test(code) && !validGtin(code))
    for (const len of [8, 12, 13, 14]) if (len > code.length && validGtin(code.padStart(len, "0"))) return code.padStart(len, "0");
  return code;
}
const YES = ["si", "s", "1", "true", "verdadero", "activo", "x", "yes"];
const NO = ["no", "n", "0", "false", "falso", "inactivo", "archivado", "oculto"];
function activeOf(v: Cell): boolean {
  const t = fold(v);
  if (YES.includes(t)) return true;
  if (NO.includes(t)) return false;
  throw new Error('Activo: escribe "Sí" o "No"');
}
/** Caducidad: AAAA-MM-DD, DD/MM/AAAA o fecha de Excel → AAAA-MM-DD. */
function dayOf(v: Cell): string {
  let y = 0,
    m = 0,
    d = 0;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const dt = new Date(Math.round((v - 25569) * 86400000));
    [y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  } else {
    const t = str(v);
    let mm = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
    if (mm) [y, m, d] = [Number(mm[1]), Number(mm[2]), Number(mm[3])];
    else if ((mm = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t))) {
      [d, m, y] = [Number(mm[1]), Number(mm[2]), Number(mm[3])];
      if (y < 100) y += 2000;
    } else throw new Error("Caducidad: usa AAAA-MM-DD o DD/MM/AAAA");
  }
  const out = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = new Date(out + "T12:00:00Z");
  if (isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== out) throw new Error("Caducidad: fecha inválida");
  return out;
}

// ---------------------------------------------------------------- plan de cambios

export type Change = { field: Field; label: string; from: string; to: string };
export type PlanRow = {
  /** Renglón del archivo (como lo ve el usuario en Excel). */
  line: number;
  kind: "new" | "update" | "same" | "error";
  productId?: string;
  sku: string;
  name: string;
  changes: Change[];
  error?: string;
  /** Lo que se guardará (solo campos con valor). */
  values: Partial<Record<Field, any>>;
};
export type ImportPlan = {
  rows: PlanRow[];
  counts: { new: number; update: number; same: number; error: number };
  /** Columnas reconocidas, para mostrarlas al dueño. */
  columns: string[];
  /** Avisos generales (columnas desconocidas, renglones vacíos…). */
  notes: string[];
};

const LABEL: Record<Field, string> = Object.fromEntries(COLUMNS.map((c) => [c.field, c.header.replace(/ \(.*\)$/, "")])) as any;
const showMoney = (n: number) => fmtMoney(n);
const META_TEXT: Field[] = ["brand", "flavor", "presentation", "description"];

/** Lee los renglones del archivo y calcula qué pasará con cada producto, sin guardar nada. */
export function planCatalogImport(b: Business, table: Cell[][]): ImportPlan {
  const headerAt = table.findIndex((r) => {
    const h = headerMap(r || []);
    return h.has("name") || h.has("sku");
  });
  if (headerAt < 0)
    throw new Error('No encontré los encabezados. La primera fila debe decir al menos "SKU" o "Nombre" (descarga la plantilla para ver el formato).');
  const head = headerMap(table[headerAt]);
  const notes: string[] = [];
  const unknown = (table[headerAt] || []).map(str).filter((h) => h && !headerMap([h]).size);
  if (unknown.length) notes.push(`Columnas que no se usan: ${unknown.join(", ")}.`);
  if (!head.has("price")) notes.push("Sin columna Precio: los precios no cambian y no se pueden dar de alta productos nuevos.");
  const products = b.stock();
  const lastCost = new Map<string, number>();
  for (const l of b.all("SELECT productId,cost FROM lots ORDER BY rowid")) lastCost.set(l.productId, l.cost);
  const seen = new Map<string, number>();
  const rows: PlanRow[] = [];
  const get = (r: Cell[], f: Field): Cell => {
    const i = head.get(f);
    return i === undefined ? null : (r[i] ?? null);
  };
  for (let i = headerAt + 1; i < table.length; i++) {
    const r = table[i] || [];
    if (!r.some((c) => str(c) !== "")) continue;
    const line = i + 1;
    const row: PlanRow = { line, kind: "same", sku: str(get(r, "sku")).toUpperCase(), name: str(get(r, "name")), changes: [], values: {} };
    rows.push(row);
    try {
      const v = row.values;
      // Valores escritos en el archivo (vacío = sin cambio).
      if (row.sku) {
        if (row.sku.length > 60) throw new Error("SKU: máximo 60 caracteres");
        v.sku = row.sku;
      }
      if (row.name) v.name = row.name;
      const cat = str(get(r, "category"));
      if (cat) v.category = cat;
      if (str(get(r, "price"))) {
        try {
          v.price = money(get(r, "price"));
        } catch {
          throw new Error(`Precio: "${str(get(r, "price"))}" no es un importe (ejemplo: 499 o 1,250.50)`);
        }
      }
      if (str(get(r, "minimum"))) v.minimum = whole(get(r, "minimum"), "Stock mínimo");
      if (str(get(r, "barcode"))) {
        const code = str(get(r, "barcode")) === "-" ? "" : barcodeOf(get(r, "barcode"));
        if (code.length > 40) throw new Error("Código de barras: máximo 40 caracteres");
        v.barcode = code;
      }
      for (const f of META_TEXT) if (str(get(r, f))) v[f] = str(get(r, f)) === "-" ? "" : str(get(r, f));
      if (str(get(r, "active"))) v.active = activeOf(get(r, "active"));
      if (str(get(r, "addQty"))) v.addQty = whole(get(r, "addQty"), "Agregar piezas");
      if (str(get(r, "cost"))) {
        try {
          v.cost = money(get(r, "cost"));
        } catch {
          throw new Error(`Costo unitario: "${str(get(r, "cost"))}" no es un importe`);
        }
      }
      if (str(get(r, "expires"))) v.expires = dayOf(get(r, "expires"));
      if (v.expires && v.expires < today() && v.addQty) throw new Error("Caducidad: la fecha ya pasó; esas piezas no se podrían vender");

      // ¿Qué producto es? Por SKU; si no trae SKU, por código de barras.
      const existing =
        (v.sku ? products.find((p) => String(p.sku).toUpperCase() === v.sku) || findProductByCode(products, v.sku) : null) ||
        (!v.sku && v.barcode ? findProductByCode(products, v.barcode) : null);
      const key = existing ? "id:" + existing.id : v.sku ? "sku:" + v.sku : "";
      if (key && seen.has(key)) throw new Error(`Repetido: el mismo producto ya viene en el renglón ${seen.get(key)}`);
      if (key) seen.set(key, line);
      if (v.barcode) {
        const owner = findProductByCode(products.filter((p) => p.id !== existing?.id), v.barcode);
        if (owner)
          throw new Error(`Código de barras: ya es de ${owner.name} (${owner.sku})`);
        const dup = [...seen.entries()].find(([k]) => k === "code:" + v.barcode);
        if (dup) throw new Error(`Código de barras repetido en el renglón ${dup[1]}`);
        seen.set("code:" + v.barcode, line);
      }
      if (v.addQty) {
        if (v.cost === undefined) {
          const c = existing ? lastCost.get(existing.id) : undefined;
          if (c === undefined) throw new Error("Agregar piezas: falta el Costo unitario");
          v.cost = c;
        }
      }
      if (!existing) {
        if (!v.name) throw new Error("Producto nuevo: falta el Nombre");
        if (v.price === undefined) throw new Error("Producto nuevo: falta el Precio");
        if (v.sku) {
          const other = findProductByCode(products, v.sku);
          if (other) throw new Error(`SKU: se parece al de ${other.name} (${other.sku}); usa el SKU exacto`);
        }
        row.kind = "new";
        row.changes.push({ field: "name", label: "Alta", from: "", to: `${v.name} · ${showMoney(v.price)}` });
        if (v.addQty) row.changes.push({ field: "addQty", label: "Piezas", from: "", to: `+${v.addQty}` });
        continue;
      }
      row.productId = existing.id;
      row.sku = existing.sku;
      row.name = v.name || existing.name;
      const cmp = (field: Field, before: unknown, after: unknown, show = (x: any) => String(x ?? "")) => {
        if (after === undefined) return;
        if (String(before ?? "") === String(after ?? "")) {
          delete v[field];
          return;
        }
        row.changes.push({ field, label: LABEL[field], from: show(before), to: show(after) });
      };
      // El SKU es la llave para encontrar el producto: la carga nunca lo cambia (escrito sin guiones se respeta el guardado).
      delete v.sku;
      cmp("name", existing.name, v.name);
      cmp("category", existing.category, v.category);
      cmp("price", existing.price, v.price, showMoney);
      cmp("minimum", existing.minimum, v.minimum);
      cmp("barcode", existing.barcode || "", v.barcode);
      for (const f of META_TEXT) cmp(f, existing[f] || "", v[f]);
      if (v.active !== undefined) cmp("active", !existing.archived, v.active, (x) => (x ? "Sí" : "No"));
      if (v.addQty) row.changes.push({ field: "addQty", label: "Piezas", from: String(existing.stock), to: `+${v.addQty} a ${showMoney(v.cost)}` });
      row.kind = row.changes.length ? "update" : "same";
    } catch (e) {
      row.kind = "error";
      row.error = e instanceof Error ? e.message : String(e);
    }
  }
  if (!rows.length) throw new Error("El archivo no trae productos debajo de los encabezados.");
  const counts = { new: 0, update: 0, same: 0, error: 0 };
  for (const r of rows) counts[r.kind]++;
  return { rows, counts, columns: [...head.keys()].map((f) => LABEL[f]), notes };
}

export type ImportResult = { created: number; updated: number; units: number; skipped: number };

/** Aplica el plan (solo renglones nuevos o con cambios) en una sola transacción. Los renglones con error se omiten. */
export function applyCatalogImport(b: Business, plan: ImportPlan): ImportResult {
  const result: ImportResult = { created: 0, updated: 0, units: 0, skipped: plan.counts.error };
  const label = "Carga de catálogo " + today();
  b.transaction(() => {
    for (const row of plan.rows) {
      if (row.kind !== "new" && row.kind !== "update") continue;
      const v = row.values;
      let productId = row.productId;
      if (row.kind === "new") {
        productId = b.addProduct(
          v.sku || ("NS-AUTO-" + Date.now().toString(36).slice(-5) + row.line.toString(36)).toUpperCase(),
          v.name,
          v.category || "General",
          v.price,
          v.minimum ?? 1,
        );
        result.created++;
      } else {
        const p = b.one("SELECT * FROM products WHERE id=?", productId);
        if ((["sku", "name", "category", "price", "minimum"] as Field[]).some((f) => v[f] !== undefined))
          b.updateProduct(p.id, v.sku ?? p.sku, v.name ?? p.name, v.category ?? p.category, v.price ?? p.price, v.minimum ?? p.minimum);
        result.updated++;
      }
      const prev = b.setting("product:" + productId, {});
      const sku = b.one("SELECT sku FROM products WHERE id=?", productId).sku;
      const meta: Row = {
        ...prev,
        imageKey: prev.imageKey || sku,
        inventoryKnown: v.addQty ? true : (prev.inventoryKnown ?? row.kind !== "new"),
      };
      if (v.name !== undefined) meta.sourceName = v.name;
      for (const f of META_TEXT) if (v[f] !== undefined) meta[f] = v[f];
      if (v.barcode !== undefined) meta.barcode = v.barcode;
      if (v.active !== undefined) meta.archived = !v.active;
      b.setSetting("product:" + productId, meta);
      if (v.addQty) {
        b.receive(productId!, label, v.expires || "", v.addQty, v.cost, null);
        result.units += v.addQty;
      }
    }
    b.audit("catalog.import", today(), `${result.created} nuevos · ${result.updated} actualizados · ${result.units} piezas`);
  });
  return result;
}

// ---------------------------------------------------------------- plantilla

/** Excel con el catálogo actual, listo para editar y volver a cargar. */
export function catalogWorkbook(b: Business, when = new Date()): { bytes: Uint8Array; fileName: string; count: number } {
  const products = b.stock().sort((x, y) => String(x.category).localeCompare(String(y.category)) || String(x.name).localeCompare(String(y.name)));
  const catalog: Sheet = {
    name: "Catálogo",
    columns: [
      { header: "SKU", width: 16 },
      { header: "Nombre", width: 34 },
      { header: "Categoría", width: 16 },
      { header: "Precio", type: "money" },
      { header: "Stock mínimo", type: "int", width: 12 },
      { header: "Código de barras", width: 18 },
      { header: "Marca", width: 14 },
      { header: "Sabor", width: 14 },
      { header: "Presentación", width: 14 },
      { header: "Descripción", width: 40 },
      { header: "Activo", width: 8 },
      { header: "Existencias (solo lectura)", type: "int", width: 14 },
      { header: "Agregar piezas", type: "int", width: 14 },
      { header: "Costo unitario", type: "money", width: 14 },
      { header: "Caducidad", width: 13 },
    ],
    rows: products.map((p: Row) => [
      p.sku,
      p.name,
      p.category,
      p.price / 100,
      p.minimum,
      p.barcode || "",
      p.brand || "",
      p.flavor || "",
      p.presentation || "",
      p.description || "",
      p.archived ? "No" : "Sí",
      p.stock,
      null,
      null,
      null,
    ]),
  };
  const help: Sheet = {
    name: "Instrucciones",
    columns: [{ header: "Cómo actualizar tu catálogo", width: 110 }],
    rows: [
      ["1. Cambia lo que necesites en la hoja «Catálogo»: precio, nombre, categoría, código de barras, marca, etc."],
      ["2. Para un producto nuevo agrega un renglón con al menos Nombre y Precio (el SKU es opcional; si lo dejas vacío la app lo crea)."],
      ["3. Una celda vacía no cambia nada. Para borrar un texto (por ejemplo la marca) escribe un guion: -"],
      ["4. Activo = No quita el producto de la venta y del catálogo de tus vendedores (no se borra; puedes volver a ponerlo en Sí)."],
      ["5. Agregar piezas suma existencias como un lote nuevo con su Costo unitario y Caducidad (opcional). No mueve dinero de tus cuentas."],
      ["6. Existencias es solo para consulta. Para corregir lo que hay en anaquel usa Stock → Conteo en la app."],
      ["7. Guarda el archivo (.xlsx o CSV) y en la app ve a Ajustes → Actualizar catálogo → Elegir archivo. Verás los cambios antes de aplicarlos."],
      ["Las ventas, cobros y costos anteriores nunca cambian."],
    ],
  };
  const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`;
  return { bytes: buildXlsx([catalog, help], when), fileName: `Catalogo_Nova_${stamp}.xlsx`, count: products.length };
}
