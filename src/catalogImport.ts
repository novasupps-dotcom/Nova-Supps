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
// - "Existencias" deja ese número de piezas (como un conteo). Si el número es el mismo que
//   traía el Excel al descargarlo, no se toca: así no se "regresan" piezas vendidas después.
// - "Agregar piezas" suma existencias como un lote nuevo. Ninguna de las dos mueve dinero.
import { strFromU8, unzipSync } from "fflate";
import { baseOf, cents, feeLabel, grossUp, money as fmtMoney, today, type Business, type Row } from "./business";
import { findProductByCode, normalizeProductCode, validGtin } from "./barcodes";
import { buildXlsx, type Sheet } from "./xlsx";
import { describedMatch, known } from "./supplierOrder";

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
  { field: "price", header: "Precio", aliases: ["precio sin comision", "precio de venta", "precio venta", "precio publico", "precio al publico", "pvp", "price"] },
  { field: "minimum", header: "Stock mínimo", aliases: ["minimo", "stock minimo", "existencia minima", "inventario minimo"] },
  { field: "barcode", header: "Código de barras", aliases: ["codigo de barras", "codigo barras", "barcode", "ean", "upc", "gtin", "codigo"] },
  { field: "brand", header: "Marca", aliases: ["marca", "brand"] },
  { field: "flavor", header: "Sabor", aliases: ["sabor", "flavor"] },
  { field: "presentation", header: "Presentación", aliases: ["presentacion", "tamano", "contenido"] },
  { field: "description", header: "Descripción", aliases: ["descripcion", "detalle", "descripcion del catalogo"] },
  { field: "active", header: "Activo", aliases: ["activo", "estado", "visible", "a la venta"] },
  { field: "stock", header: "Existencias", aliases: ["existencias", "existencia", "existencia actual", "stock", "stock actual", "inventario", "inventario actual", "disponibles", "cantidad", "piezas", "unidades", "en existencia"] },
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
  /** Aviso que no impide aplicar (por ejemplo, piezas sin costo). */
  warning?: string;
  /** El archivo trae precio para este renglón. */
  priceInFile?: boolean;
  /** Renglón repetido: el renglón (anterior) con el mismo producto o código. Se puede unificar con él. */
  dupOf?: number;
  /** Lo que se guardará (solo campos con valor). */
  values: Partial<Record<Field, any>>;
  /** 2.8.2 · Cómo se encontró el producto de la app: por SKU/código o por descripción. */
  match?: "code" | "desc";
  /** Nombre del producto de la app con el que se ligó. */
  matchName?: string;
  /** Por descripción: con imagen se reemplazan las existencias; sin imagen solo se suman piezas. */
  mode?: "replace" | "add";
  /** Lo ligó el dueño a mano («¿Es tu…?»). */
  linked?: boolean;
  /** Producto nuevo que se parece a uno de la app: para preguntar «¿Es tu…?». */
  candidates?: { id: string; name: string }[];
  /** Producto que ya existe y el dueño desmarcó: no se toca. */
  off?: boolean;
};
export type Missing = { id: string; name: string; sku: string; stock: number };
export type ImportPlan = {
  rows: PlanRow[];
  counts: { new: number; update: number; same: number; error: number };
  /** 2.8.2 · Productos de la app que no vienen en el archivo, y los que se eliminarán. */
  missing: Missing[];
  remove: Missing[];
  /** Columnas reconocidas, para mostrarlas al dueño. */
  columns: string[];
  /** Avisos generales (columnas desconocidas, renglones vacíos…). */
  notes: string[];
  /** 2.7 · Comisión de la terminal sumada a los precios del archivo. */
  fee: {
    bps: number;
    /** Se suma la comisión a los precios del archivo. */
    addFee: boolean;
    /** La app aún suma la comisión al cobrar: al aceptar, pasa a ir dentro del precio. */
    switching: boolean;
    /** Renglones con precio en el archivo. */
    priced: number;
    /** Productos que NO traen precio en el archivo y también suben (solo al cambiar de modo). */
    others: number;
    /** Ejemplo para la confirmación. */
    example: { from: number; to: number } | null;
  };
};
export type PlanOptions = {
  /** 2.7: sumar la comisión de la terminal a los precios del archivo (por omisión, sí). */
  addFee?: boolean;
  /** 2.8.2 · Renglón → producto de la app elegido a mano (null = «No es», va como nuevo). */
  links?: Record<number, string | null>;
  /** Renglones de productos existentes que el dueño desmarcó. */
  off?: number[];
  /** Productos de la app (que no vienen en el archivo) a eliminar al aplicar. */
  remove?: string[];
  /** ¿El producto tiene imagen? (la pantalla también revisa las fotos del catálogo). */
  hasImage?: (p: Row) => boolean;
};
const ownImage = (p: Row) => !!(p.imageUri || p.cleanImageUri || (Array.isArray(p.imageUris) && p.imageUris.length));

const LABEL: Record<Field, string> = Object.fromEntries(COLUMNS.map((c) => [c.field, c.header.replace(/ \(.*\)$/, "")])) as any;
const showMoney = (n: number) => fmtMoney(n);
const META_TEXT: Field[] = ["brand", "flavor", "presentation", "description"];

function findHeader(table: Cell[][]): { at: number; head: Map<Field, number> } {
  const at = table.findIndex((r) => {
    const h = headerMap(r || []);
    return h.has("name") || h.has("sku");
  });
  if (at < 0)
    throw new Error('No encontré los encabezados. La primera fila debe decir al menos "SKU" o "Nombre" (descarga la plantilla para ver el formato).');
  return { at, head: headerMap(table[at]) };
}

/** Lee los renglones del archivo y calcula qué pasará con cada producto, sin guardar nada. */
export function planCatalogImport(b: Business, table: Cell[][], opts: PlanOptions = {}): ImportPlan {
  const { at: headerAt, head } = findHeader(table);
  const bps = b.feeBps();
  const addFee = opts.addFee !== false && bps > 0;
  let example: { from: number; to: number } | null = null;
  const notes: string[] = [];
  const unknown = (table[headerAt] || []).map(str).filter((h) => h && !headerMap([h]).size);
  if (unknown.length) notes.push(`Columnas que no se usan: ${unknown.join(", ")}.`);
  if (!head.has("price")) notes.push("Sin columna Precio: los precios no cambian y no se pueden dar de alta productos nuevos.");
  const products = b.stock();
  const catalog = known(b);
  const links = opts.links ?? {};
  const off = new Set(opts.off ?? []);
  const hasImage = opts.hasImage ?? ownImage;
  const touched = new Set<string>();
  // Existencias que traía el Excel descargado de la app (para no deshacer ventas posteriores).
  const exported = (b.setting(EXPORT_KEY, null) as { stock?: Record<string, number> } | null)?.stock ?? null;
  let keptSinceExport = 0;
  const reserved = new Map<string, number>();
  for (const x of b.all(
    "SELECT l.productId,COALESCE(SUM(CAST(s.value AS INTEGER)),0) n FROM allocations a JOIN settings s ON s.key='reservation:'||a.id JOIN lots l ON l.id=a.lotId GROUP BY l.productId",
  ))
    reserved.set(x.productId, Number(x.n) || 0);
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
        // 2.7: el precio del archivo + la comisión de la terminal (se confirma antes de aplicar).
        if (addFee) {
          const up = grossUp(v.price, bps);
          if (!example && up !== v.price) example = { from: v.price, to: up };
          v.price = up;
        }
        row.priceInFile = true;
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
      if (str(get(r, "stock"))) v.stock = whole(get(r, "stock"), "Existencias");
      if (v.addQty && v.stock !== undefined) throw new Error("Usa Existencias o Agregar piezas en este renglón, no las dos");
      if (str(get(r, "cost"))) {
        try {
          v.cost = money(get(r, "cost"));
        } catch {
          throw new Error(`Costo unitario: "${str(get(r, "cost"))}" no es un importe`);
        }
      }
      if (str(get(r, "expires"))) v.expires = dayOf(get(r, "expires"));
      if (v.expires && v.expires < today() && (v.addQty || v.stock)) throw new Error("Caducidad: la fecha ya pasó; esas piezas no se podrían vender");

      // ¿Qué producto es? Por SKU; si no trae SKU, por código de barras.
      let existing =
        (v.sku ? products.find((p) => String(p.sku).toUpperCase() === v.sku) || findProductByCode(products, v.sku) : null) ||
        (!v.sku && v.barcode ? findProductByCode(products, v.barcode) : null);
      // 2.8.2: si no, por descripción (marca, tipo de suplemento, presentación y sabor).
      let described = false;
      if (!existing && v.name) {
        const chosen = links[line];
        if (chosen) {
          existing = products.find((p) => p.id === chosen) ?? null;
          row.linked = !!existing;
        } else if (chosen !== null) {
          const m = describedMatch({ name: v.name, brand: v.brand, flavor: v.flavor, presentation: v.presentation }, catalog);
          if (m.auto) existing = products.find((p) => p.id === m.auto!.id) ?? null;
          else if (m.candidates.length) row.candidates = m.candidates.map((c) => ({ id: c.id, name: c.name }));
        }
        described = !!existing;
      }
      if (existing) touched.add(existing.id);
      const key = existing ? "id:" + existing.id : v.sku ? "sku:" + v.sku : "";
      if (key && seen.has(key)) {
        row.dupOf = seen.get(key);
        throw new Error(`Repetido: el mismo producto ya viene en el renglón ${seen.get(key)}`);
      }
      if (key) seen.set(key, line);
      if (v.barcode) {
        const owner = findProductByCode(products.filter((p) => p.id !== existing?.id), v.barcode);
        if (owner)
          throw new Error(`Código de barras: ya es de ${owner.name} (${owner.sku})`);
        const dup = [...seen.entries()].find(([k]) => k === "code:" + v.barcode);
        if (dup) {
          row.dupOf = dup[1];
          throw new Error(`Código de barras repetido en el renglón ${dup[1]}`);
        }
        seen.set("code:" + v.barcode, line);
      }
      if (v.addQty && !described) {
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
        if (v.stock !== undefined) {
          row.changes.push({ field: "stock", label: "Existencias", from: "0", to: String(v.stock) });
          if (v.stock && v.cost === undefined) {
            v.cost = 0;
            row.warning = "Sin Costo unitario: estas piezas quedan con costo $0 (la utilidad se verá más alta)";
          }
        }
        continue;
      }
      row.productId = existing.id;
      row.sku = existing.sku;
      if (described) {
        // Ya existe (encontrado por descripción): sus datos no se tocan, solo el inventario.
        // Con imagen, las existencias quedan como en el archivo (se pide confirmar);
        // sin imagen, las piezas del archivo se suman a las que ya hay.
        row.match = "desc";
        row.matchName = existing.name;
        row.mode = hasImage(existing) ? "replace" : "add";
        const now = Number(existing.stock) || 0;
        const keepOnly: Partial<Record<Field, any>> = {};
        const qty = v.stock ?? v.addQty;
        const costFor = () => {
          if (v.cost !== undefined) return v.cost;
          const c = lastCost.get(existing!.id) ?? existing!.referenceCost;
          if (c === undefined) row.warning = "Sin Costo unitario: las piezas que se suman quedan con costo $0";
          return Number(c) || 0;
        };
        if (row.mode === "replace" && v.stock !== undefined) {
          if (v.stock !== now) {
            const min = reserved.get(existing.id) ?? 0;
            if (v.stock < min) throw new Error(`Existencias: no puedes dejar menos de ${min} (apartadas para entregas pendientes)`);
            keepOnly.stock = v.stock;
            if (v.stock > now) keepOnly.cost = costFor();
            row.changes.push({ field: "stock", label: "Existencias", from: String(now), to: String(v.stock) });
          }
        } else if (qty) {
          keepOnly.addQty = qty;
          keepOnly.cost = costFor();
          row.changes.push({ field: "addQty", label: "Piezas", from: String(now), to: `+${qty}` });
        }
        if (v.expires && (keepOnly.addQty || keepOnly.stock)) keepOnly.expires = v.expires;
        row.values = keepOnly;
        row.kind = row.changes.length ? "update" : "same";
        if (row.kind === "update" && off.has(line)) row.off = true;
        continue;
      }
      row.match = "code";
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
      if (v.stock !== undefined) {
        const now = Number(existing.stock) || 0;
        if (v.stock === now) delete v.stock;
        else if (exported && exported[existing.id] === v.stock) {
          // Mismo número que al descargar: lo de hoy (ventas, entradas) manda.
          delete v.stock;
          keptSinceExport++;
        } else {
          const min = reserved.get(existing.id) ?? 0;
          if (v.stock < min) throw new Error(`Existencias: no puedes dejar menos de ${min} (apartadas para entregas pendientes)`);
          if (v.stock > now && v.cost === undefined) {
            const c = lastCost.get(existing.id) ?? existing.referenceCost;
            if (c === undefined) row.warning = "Sin Costo unitario: las piezas que se suman quedan con costo $0";
            v.cost = Number(c) || 0;
          }
          row.changes.push({ field: "stock", label: "Existencias", from: String(now), to: String(v.stock) });
        }
      }
      row.kind = row.changes.length ? "update" : "same";
      if (row.kind === "update" && off.has(line)) row.off = true;
    } catch (e) {
      row.kind = "error";
      row.error = e instanceof Error ? e.message : String(e);
    }
  }
  if (!rows.length) throw new Error("El archivo no trae productos debajo de los encabezados.");
  if (keptSinceExport)
    notes.push(
      `${keptSinceExport} ${keptSinceExport === 1 ? "producto conserva" : "productos conservan"} las existencias de la app: en el Excel tienen el mismo número que cuando lo descargaste y desde entonces hubo ventas o entradas.`,
    );
  const counts = { new: 0, update: 0, same: 0, error: 0 };
  for (const r of rows) if (!r.off) counts[r.kind]++;
  // 2.8.2: productos de la app que no vienen en el archivo (se pueden eliminar).
  const missing: Missing[] = products
    .filter((p) => !p.archived && !touched.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, sku: p.sku, stock: Number(p.stock) || 0 }));
  const toRemove = new Set(opts.remove ?? []);
  const remove = missing.filter((m) => toRemove.has(m.id));
  const switching = addFee && !b.feeInPrice();
  const repriced = new Set(rows.filter((r) => r.productId && r.kind !== "error" && !r.off && r.match !== "desc" && r.priceInFile).map((r) => r.productId));
  const others = switching ? products.filter((p) => !repriced.has(p.id) && p.price > 0).length : 0;
  const priced = rows.filter((r) => r.kind !== "error" && !r.off && r.match !== "desc" && r.priceInFile).length;
  return {
    rows,
    counts,
    missing,
    remove,
    columns: [...head.keys()].map((f) => LABEL[f]),
    notes,
    fee: { bps, addFee, switching, priced, others, example },
  };
}

export type ImportResult = { created: number; updated: number; units: number; counted: number; skipped: number; removed: number; archived: number };

/** Aplica el plan (solo renglones nuevos o con cambios) en una sola transacción. Los renglones con error se omiten. */
/** 2.8.2 · Archivo ya cargado (por su huella SHA-256). */
export const CATALOG_FILE_KEY = (hash: string) => "catalogFile:" + hash;

/**
 * 2.8.2 · Punto de control: piezas que ya tienes de los productos del archivo y las que
 * se sumarían («Actualmente tienes X piezas y vas a agregar N piezas más de archivo.xlsx»).
 */
export function catalogCheckpoint(b: Business, plan: ImportPlan): { have: number; add: number } {
  const stock = new Map(b.stock().map((p: Row) => [p.id, Number(p.stock) || 0]));
  const ids = new Set<string>();
  let add = 0;
  for (const r of plan.rows) {
    if (r.kind === "error" || r.off) continue;
    const now = r.productId ? (stock.get(r.productId) ?? 0) : 0;
    if (r.productId) ids.add(r.productId);
    if (r.kind === "same") continue;
    add += Number(r.values.addQty) || 0;
    if (r.values.stock !== undefined) add += Math.max(0, Number(r.values.stock) - now);
  }
  return { have: [...ids].reduce((n, id) => n + (stock.get(id) ?? 0), 0), add };
}

export function applyCatalogImport(b: Business, plan: ImportPlan, source?: { hash: string; name: string }): ImportResult {
  const result: ImportResult = { created: 0, updated: 0, units: 0, counted: 0, skipped: plan.counts.error, removed: 0, archived: 0 };
  const label = "Carga de catálogo " + today();
  b.transaction(() => {
    // 2.7: al aceptar la comisión en el precio, los productos que no traen precio en el archivo
    // también la incluyen (el cliente paga lo mismo) y al cobrar ya no se suma.
    if (plan.fee.switching) {
      const fromFile = new Set<string>();
      for (const r of plan.rows) if (r.productId && r.kind !== "error" && !r.off && r.match !== "desc" && r.priceInFile) fromFile.add(r.productId);
      b.setFeeInPrice(true, true, fromFile);
    }
    for (const row of plan.rows) {
      if ((row.kind !== "new" && row.kind !== "update") || row.off) continue;
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
        inventoryKnown: v.addQty || v.stock !== undefined ? true : (prev.inventoryKnown ?? row.kind !== "new"),
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
      if (v.stock !== undefined) {
        const now = Number(b.one("SELECT COALESCE(SUM(qty),0) n FROM lots WHERE productId=?", productId).n);
        if (v.stock > now) b.receive(productId!, label, v.expires || "", v.stock - now, v.cost ?? 0, null);
        else if (v.stock < now) b.adjustStock(productId!, v.stock, "Carga de catálogo");
        result.counted++;
      }
    }
    // 2.8.2: los que no venían en el archivo y el dueño marcó para eliminar (con ventas se archivan).
    for (const m of plan.remove) {
      if (b.deleteProduct(m.id).mode === "deleted") result.removed++;
      else result.archived++;
    }
    if (source?.hash)
      b.setSetting(CATALOG_FILE_KEY(source.hash), { at: new Date().toISOString(), name: source.name, units: result.units, created: result.created });
    b.audit(
      "catalog.import",
      today(),
      `${result.created} nuevos · ${result.updated} actualizados · ${result.units} piezas · ${result.counted} existencias` +
        (result.removed + result.archived ? ` · ${result.removed + result.archived} eliminados` : "") +
        (plan.fee.addFee ? ` · precios + ${feeLabel(plan.fee.bps)}` : ""),
    );
  });
  return result;
}

// ---------------------------------------------------------------- plantilla

export const EXPORT_KEY = "catalogExportStock";
/** Excel con el catálogo actual, listo para editar y volver a cargar. Recuerda las existencias que trae. */
export function catalogWorkbook(b: Business, when = new Date()): { bytes: Uint8Array; fileName: string; count: number } {
  const products = b.stock().sort((x, y) => String(x.category).localeCompare(String(y.category)) || String(x.name).localeCompare(String(y.name)));
  // 2.7: con la comisión dentro del precio, el Excel trae tu precio sin comisión; al cargarlo se vuelve a sumar.
  const inPrice = b.feeInPrice();
  const bps = b.feeBps();
  const catalog: Sheet = {
    name: "Catálogo",
    columns: [
      { header: "SKU", width: 16 },
      { header: "Nombre", width: 34 },
      { header: "Categoría", width: 16 },
      { header: inPrice ? "Precio sin comisión" : "Precio", type: "money", width: inPrice ? 18 : undefined },
      { header: "Stock mínimo", type: "int", width: 12 },
      { header: "Código de barras", width: 18 },
      { header: "Marca", width: 14 },
      { header: "Sabor", width: 14 },
      { header: "Presentación", width: 14 },
      { header: "Descripción", width: 40 },
      { header: "Activo", width: 8 },
      { header: "Existencias", type: "int", width: 12 },
      { header: "Agregar piezas", type: "int", width: 14 },
      { header: "Costo unitario", type: "money", width: 14 },
      { header: "Caducidad", width: 13 },
    ],
    rows: products.map((p: Row) => [
      p.sku,
      p.name,
      p.category,
      (inPrice ? baseOf(p.price, bps) : p.price) / 100,
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
      ["5. Existencias: escribe cuántas piezas tienes y la app deja ese número (como un conteo). Si no lo cambias, no se toca, aunque hayas vendido después de descargar el Excel."],
      ["6. Agregar piezas suma existencias como un lote nuevo. Costo unitario y Caducidad (opcionales) se usan para las piezas que se suman. Nada de esto mueve dinero de tus cuentas."],
      [`7. Precio: escribe tu precio. Al cargarlo, la app te pregunta si le suma la comisión de la terminal (${feeLabel(bps)}); si aceptas, el precio del catálogo ya la incluye y al cobrar no se suma otra vez.`],
      ["8. Guarda el archivo (.xlsx o CSV) y en la app ve a Ajustes → Actualizar catálogo → Elegir archivo. Verás los cambios antes de aplicarlos; ahí puedes quitar, modificar o unificar renglones."],
      ["Las ventas, cobros y costos anteriores nunca cambian."],
    ],
  };
  b.setSetting(EXPORT_KEY, { at: when.toISOString(), stock: Object.fromEntries(products.map((p: Row) => [p.id, Number(p.stock) || 0])) });
  const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`;
  return { bytes: buildXlsx([catalog, help], when), fileName: `Catalogo_Nova_${stamp}.xlsx`, count: products.length };
}

// ---------------------------------------------------------------- 2.7 · arreglar renglones desde la app

/** Campos que se pueden modificar desde la app (en este orden). */
export const EDITABLE: Field[] = ["name", "sku", "category", "price", "flavor", "stock", "barcode", "cost"];
export const fieldLabel = (f: Field) => LABEL[f];

/** Valores de un renglón como texto (para precargar el formulario de «Modificar»). */
export function rowFields(table: Cell[][], line: number): Partial<Record<Field, string>> {
  const { head } = findHeader(table);
  const r = table[line - 1] || [];
  const out: Partial<Record<Field, string>> = {};
  for (const f of EDITABLE) {
    const i = head.get(f);
    out[f] = i === undefined ? "" : str(r[i] ?? null);
  }
  return out;
}

function withColumn(table: Cell[][], field: Field): { table: Cell[][]; col: number } {
  const { at, head } = findHeader(table);
  const col = head.get(field);
  if (col !== undefined) return { table, col };
  const next = table.map((r) => [...(r || [])]);
  const width = Math.max(...next.map((r) => r.length));
  next[at][width] = COLUMNS.find((c) => c.field === field)!.header;
  return { table: next, col: width };
}

/** «Modificar»: cambia valores de un renglón (agrega la columna si el archivo no la traía). */
export function editRow(table: Cell[][], line: number, values: Partial<Record<Field, string>>): Cell[][] {
  let next = table.map((r) => [...(r || [])]);
  for (const [f, value] of Object.entries(values) as [Field, string][]) {
    if (value === undefined) continue;
    const { head } = findHeader(next);
    if (!head.has(f) && !String(value).trim()) continue;
    const added = withColumn(next, f);
    next = added.table;
    next[line - 1][added.col] = String(value).trim() || null;
  }
  return next;
}

/** «Quitar»: el renglón no se carga (se vacía para conservar los números de renglón). */
export function dropRow(table: Cell[][], line: number): Cell[][] {
  return table.map((r, i) => (i === line - 1 ? [] : r));
}

/**
 * «Unificar»: junta un renglón repetido con el primero. Suma Existencias y Agregar piezas,
 * junta los sabores distintos («Chocolate, Vainilla») y completa las celdas vacías del primero.
 */
export function mergeRows(table: Cell[][], keepLine: number, dropLine: number): Cell[][] {
  const { head } = findHeader(table);
  const next = table.map((r) => [...(r || [])]);
  const keep = next[keepLine - 1];
  const drop = next[dropLine - 1] || [];
  const width = Math.max(keep.length, drop.length);
  const sumCols = new Set([head.get("stock"), head.get("addQty")].filter((x) => x !== undefined) as number[]);
  const flavorCol = head.get("flavor");
  for (let i = 0; i < width; i++) {
    const a = str(keep[i] ?? null),
      d = str(drop[i] ?? null);
    if (!d) continue;
    if (sumCols.has(i)) {
      const x = Number(a.replace(/,/g, "") || 0),
        y = Number(d.replace(/,/g, ""));
      keep[i] = Number.isFinite(x) && Number.isFinite(y) ? x + y : a || d;
    } else if (i === flavorCol) {
      const parts = [...a.split(/\s*,\s*/), ...d.split(/\s*,\s*/)].filter(Boolean);
      const unique = parts.filter((x, k) => parts.findIndex((y) => fold(y) === fold(x)) === k);
      keep[i] = unique.join(", ");
    } else if (!a) keep[i] = drop[i] ?? null;
  }
  next[dropLine - 1] = [];
  return next;
}

/** Unifica todos los repetidos del plan, cada uno con su primer renglón. */
export function mergeAllDuplicates(table: Cell[][], plan: ImportPlan): Cell[][] {
  let next = table;
  for (const r of plan.rows) if (r.kind === "error" && r.dupOf) next = mergeRows(next, r.dupOf, r.line);
  return next;
}

/** Quita todos los renglones con error. */
export function dropAllErrors(table: Cell[][], plan: ImportPlan): Cell[][] {
  let next = table;
  for (const r of plan.rows) if (r.kind === "error") next = dropRow(next, r.line);
  return next;
}
