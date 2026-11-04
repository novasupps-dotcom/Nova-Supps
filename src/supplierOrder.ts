// 2.8 · Cargar un pedido de proveedor en PDF (Suplementos GYM, impresión de pedido de Chrome)
// como inventario nuevo:
//  1. Lee productos, sabores, precio, cantidad, descuento, envío y total del PDF.
//  2. Busca cada renglón en el catálogo (marca + nombre + presentación + sabor). Lo que ya
//     existe solo suma piezas; lo nuevo se da de alta con SKU homologado (NS-PRE-011-GRA).
//  3. Costo real por pieza: precio del PDF con su parte del descuento y del envío.
//  4. Calculadora de precio: costo × (1 + % de ganancia) + comisión de la terminal, redondeado
//     hacia arriba al peso; el dueño lo puede cambiar. Con productos existentes se confirma
//     si se queda el precio actual o el nuevo.
//  5. Los sabores de un mismo producto quedan agrupados (familia): al vender se elige el sabor.
// Todo se aplica en una sola transacción y el mismo pedido no se carga dos veces.
import { baseOf, cardFee, grossUp, type Business, type Row } from "./business";
import { extractPdfText, pdfLines, type PdfLine } from "./pdfText";
import { sha256Hex } from "./sha256";

export type OrderLine = {
  brand: string;
  /** Nombre como viene en el PDF, por ejemplo «Psychotic Black 60 Servings». */
  name: string;
  flavor: string;
  /** Precio unitario del PDF (centavos). */
  price: number;
  qty: number;
  subtotal: number;
};
export type SupplierOrder = {
  supplier: string;
  number: string;
  date: string;
  status: string;
  lines: OrderLine[];
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  /** Piezas que dice el PDF («Productos Pedidos (24)»), para comprobar la lectura. */
  declaredUnits: number | null;
  warnings: string[];
  /** 2.8.2 · Huella del archivo (SHA-256) y su nombre: para saber si ya se cargó. */
  fileHash?: string;
  fileName?: string;
};

const MONEY = /^-?\$\s?[\d,]+(\.\d{1,2})?$/;
function cents(text: string): number {
  const t = text.replace(/[$,\s]/g, "");
  const neg = t.startsWith("-");
  const [a, b = ""] = t.replace("-", "").split(".");
  const n = Number(a) * 100 + Number((b + "00").slice(0, 2));
  return neg ? -n : n;
}

/** Lee el pedido a partir de los renglones del PDF (posición de cada texto en la página). */
export function parseSupplierOrder(lines: PdfLine[]): SupplierOrder {
  const all = lines.map((l) => l.text).join("\n");
  const number = /Pedido\s*#\s*(\d+)/i.exec(all)?.[1] ?? "";
  const date = /Fecha de Pedido:\s*(.+)/i.exec(all)?.[1]?.trim() ?? "";
  const status = /Estatus:\s*(.+)/i.exec(all)?.[1]?.trim() ?? "";
  const host = /https?:\/\/(?:www\.)?([a-z0-9.-]+)/i.exec(all)?.[1] ?? "";
  const supplier = /suplementosgym/i.test(host) ? "Suplementos GYM" : host || "Proveedor";
  const declared = /Productos Pedidos\s*\((\d+)\)/i.exec(all);
  const warnings: string[] = [];

  const below = (l: PdfLine, test: (t: string) => boolean) =>
    lines.find((m) => m.page === l.page && Math.abs(m.x - l.x) < 4 && m.y < l.y && l.y - m.y < 22 && test(m.text));
  const sameRow = (label: PdfLine) =>
    lines.find((m) => m.page === label.page && Math.abs(m.y - label.y) < 2.5 && m.x > label.x && MONEY.test(m.text));
  const amountOf = (re: RegExp) => {
    const label = lines.find((l) => re.test(l.text) && sameRow(l));
    return label ? Math.abs(cents(sameRow(label)!.text)) : null;
  };
  const subtotal = amountOf(/^Sub-?total$/i);
  const shipping = amountOf(/^Env[ií]o\b/i) ?? 0;
  const discount = amountOf(/^Descuento\b/i) ?? 0;
  const total = amountOf(/^Total$/i);

  // Cada producto tiene la etiqueta «Precio» con su importe justo debajo.
  const anchors = lines
    .filter((l) => /^Precio$/i.test(l.text) && below(l, (t) => MONEY.test(t)))
    .sort((a, b) => a.page - b.page || b.y - a.y);
  // Fin de la lista en cada página: el resumen (Sub-total con importe).
  const summaryY = new Map<number, number>();
  for (const l of lines) if (/^Sub-?total$/i.test(l.text) && sameRow(l)) summaryY.set(l.page, Math.max(summaryY.get(l.page) ?? -1, l.y));

  const out: OrderLine[] = [];
  anchors.forEach((a, i) => {
    const price = cents(below(a, (t) => MONEY.test(t))!.text);
    const qtyLabel = lines.find((l) => l.page === a.page && /^Cantidad$/i.test(l.text) && Math.abs(l.y - a.y) < 6);
    const qtyLine = qtyLabel && below(qtyLabel, (t) => /^\d+$/.test(t));
    const subLabel = lines.find((l) => l.page === a.page && /^Subtotal$/i.test(l.text) && Math.abs(l.y - a.y) < 6);
    const subLine = subLabel && below(subLabel, (t) => MONEY.test(t));
    const qty = qtyLine ? Number(qtyLine.text) : 0;
    const sub = subLine ? cents(subLine.text) : price * qty;
    // Columna derecha (nombre completo, sin cortes): a la derecha del subtotal.
    const rightX = (subLabel?.x ?? a.x + 100) + 40;
    const next = anchors[i + 1];
    const floor = next && next.page === a.page ? next.y + 3 : (summaryY.get(a.page) ?? 0) + 3;
    const right = lines
      .filter((l) => l.page === a.page && l.x >= rightX && l.y <= a.y + 3 && l.y > floor)
      .sort((x, y) => y.y - x.y);
    if (!right.length || !qty) {
      warnings.push(`No se pudo leer el producto de $${(price / 100).toFixed(2)} (página ${a.page}).`);
      return;
    }
    const brand = right[0].text;
    const nameParts: string[] = [];
    const flavorParts: string[] = [];
    for (const l of right.slice(1)) {
      const f = /^Sabor:\s*(.*)$/i.exec(l.text);
      if (f) flavorParts.push(f[1]);
      else if (flavorParts.length) flavorParts.push(l.text);
      else nameParts.push(l.text);
    }
    out.push({
      brand,
      name: nameParts.join(" ").replace(/\s+/g, " ").trim(),
      flavor: flavorParts.join(" ").replace(/\s+/g, " ").trim(),
      price,
      qty,
      subtotal: sub,
    });
    if (price * qty !== sub) warnings.push(`${brand} ${nameParts.join(" ")}: precio × cantidad no da el subtotal del PDF.`);
  });
  if (!out.length) throw new Error("No encontré productos en el PDF. Debe ser la impresión del pedido (Imprimir pedido) de tu proveedor.");
  const sum = out.reduce((n, l) => n + l.subtotal, 0);
  if (subtotal !== null && sum !== subtotal)
    warnings.push(`La suma de los productos (${fmt(sum)}) no coincide con el Sub-total del PDF (${fmt(subtotal)}). Revisa que no falte ningún renglón.`);
  const units = out.reduce((n, l) => n + l.qty, 0);
  if (declared && Number(declared[1]) !== units)
    warnings.push(`El PDF dice ${declared[1]} productos y se leyeron ${units} piezas.`);
  const sub = subtotal ?? sum;
  const tot = total ?? sub - discount + shipping;
  if (total !== null && sub - discount + shipping !== total)
    warnings.push("Sub-total − descuento + envío no da el Total del PDF; se usa el Total para el costo.");
  return { supplier, number, date, status, lines: out, subtotal: sub, shipping, discount, total: tot, declaredUnits: declared ? Number(declared[1]) : null, warnings };
}
const fmt = (n: number) => "$" + (n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** PDF (bytes) → pedido. */
export function readSupplierOrderPdf(bytes: Uint8Array, fileName = ""): SupplierOrder {
  return { ...parseSupplierOrder(pdfLines(extractPdfText(bytes))), fileHash: sha256Hex(bytes), fileName };
}

// ---------------------------------------------------------------- nombres, tamaños y sabores

const PLAIN: Record<string, string> = { á: "a", à: "a", ä: "a", â: "a", é: "e", è: "e", ë: "e", ê: "e", í: "i", ì: "i", ï: "i", î: "i", ó: "o", ò: "o", ö: "o", ô: "o", ú: "u", ù: "u", ü: "u", û: "u", ñ: "n", ç: "c" };
export const fold = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[áàäâéèëêíìïîóòöôúùüûñç]/g, (c) => PLAIN[c] ?? c)
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
const SYN: Record<string, string> = { creatina: "creatine", proteina: "protein", monohidrato: "monohydrate", aminoacidos: "amino", glutamina: "glutamine", carnitina: "carnitine", cafeina: "caffeine" };
const STOP = new Set(["de", "del", "la", "el", "the", "con", "y", "and", "por", "confirmar"]);
const UNIT: Record<string, string> = {
  serving: "serv", servings: "serv", servicio: "serv", servicios: "serv", serv: "serv", scoops: "serv", porciones: "serv",
  kg: "kg", kilo: "kg", kilos: "kg", g: "g", gr: "g", grs: "g", gramos: "g", lb: "lb", lbs: "lb", libras: "lb", oz: "oz",
  ml: "ml", l: "l", caps: "cap", capsulas: "cap", capsules: "cap", tabs: "tab", tabletas: "tab", tablets: "tab", barra: "pz", barras: "pz", lata: "pz", latas: "pz",
};
const UNIT_SHOW: Record<string, string> = { serv: "Servicios", kg: "kg", g: "g", lb: "lb", oz: "oz", ml: "ml", l: "L", cap: "cápsulas", tab: "tabletas", pz: "piezas" };
const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(servings?|servicios?|serv|scoops|porciones|kilos?|kg|grs?|gramos|g|lbs?|libras|oz|ml|l|caps|capsulas|capsules|tabs|tabletas|tablets|barras?|latas?)\b/i;

/** Tamaño normalizado («60serv», «1kg», «200g») y cómo mostrarlo («60 Servicios»). */
export function sizeOf(text: string): { key: string; show: string; raw: string } | null {
  const m = SIZE_RE.exec(fold(text).replace(/(\d),(\d)/g, "$1.$2"));
  if (!m) return null;
  const unit = UNIT[m[2].toLowerCase()] ?? m[2].toLowerCase();
  const num = Number(m[1].replace(",", "."));
  const n = String(num);
  // Peso en gramos para comparar «1 kg» con «1000 g» o «2 lb» con «907 g».
  const grams = unit === "kg" ? num * 1000 : unit === "lb" ? num * 453.6 : unit === "oz" ? num * 28.35 : unit === "g" ? num : 0;
  const key = grams ? Math.round(grams) + "g" : n + unit;
  return { key, show: `${n} ${UNIT_SHOW[unit] ?? unit}`, raw: m[0] };
}
function tokens(text: string, drop: string[] = []): string[] {
  const out: string[] = [];
  const skip = new Set(drop.flatMap((d) => fold(d).split(" ")));
  for (let t of fold(text).replace(SIZE_RE, " ").split(" ")) {
    if (!t || STOP.has(t) || skip.has(t) || /^\d+$/.test(t)) continue;
    t = SYN[t] ?? t;
    out.push(t);
  }
  return out;
}
const NO_FLAVOR = new Set(["", "sin sabor", "natural", "unflavored", "sin", "n a"]);
const flavorKey = (f: unknown) => {
  const k = fold(f);
  return NO_FLAVOR.has(k) ? "" : k;
};

/** Nombre base sin el tamaño: «Psychotic Black 60 Servings» → «Psychotic Black». */
function baseTitle(name: string): string {
  const m = SIZE_RE.exec(name.replace(/(\d),(\d)/g, "$1.$2"));
  const idx = m ? name.toLowerCase().indexOf(m[1]) : -1;
  return (idx > 0 ? name.slice(0, idx) : name).replace(/\s+/g, " ").replace(/[\s·,-]+$/, "").trim() || name.trim();
}

// ---------------------------------------------------------------- catálogo

export type Known = { id: string; sku: string; name: string; brand: string; size: string; flavor: string; flavorList: string[]; base: string[]; stock: number; price: number; family: string; archived: boolean };
export function known(b: Business): Known[] {
  return b.stock().map((p: Row) => {
    const parts = String(p.name).split(" · ");
    const brand = String(p.brand || parts[1] || "");
    const sizeText = [p.presentation, parts[2], p.name].map((x) => String(x || "")).find((x) => sizeOf(x)) || "";
    const fl = String(p.flavor || "");
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      brand,
      size: sizeOf(sizeText)?.key ?? "",
      flavor: flavorKey(fl),
      flavorList: fl.split(/\s*,\s*/).map(flavorKey).filter(Boolean),
      base: tokens(parts[0] || p.name, [brand]),
      stock: Number(p.stock) || 0,
      price: p.price,
      family: String(p.family || ""),
      archived: !!p.archived,
    };
  });
}
function jaccard(a: string[], b: string[]) {
  if (!a.length && !b.length) return 1;
  const A = new Set(a),
    B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
const sameBrand = (a: string, b: string) => {
  const x = fold(a),
    y = fold(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

export type Candidate = { id: string; name: string; sku: string; stock: number; score: number; sure: boolean; why: string };
/** Productos del catálogo que podrían ser este renglón (el primero, si es «seguro», se usa solo). */
export function candidatesFor(line: OrderLine, catalog: Known[], remembered?: string): Candidate[] {
  const size = sizeOf(line.name)?.key ?? "";
  const base = tokens(baseTitle(line.name), [line.brand]);
  const flavor = flavorKey(line.flavor);
  const out: Candidate[] = [];
  for (const p of catalog) {
    if (remembered && p.id === remembered) {
      out.push({ id: p.id, name: p.name, sku: p.sku, stock: p.stock, score: 2, sure: true, why: "ya lo ligaste en un pedido anterior" });
      continue;
    }
    if (!sameBrand(p.brand, line.brand)) continue;
    const nameScore = jaccard(base, p.base);
    if (nameScore < 0.7) continue;
    // Misma unidad y otro tamaño (300 g vs 1 kg, 35 vs 60 servicios) = otro producto.
    const sizeScore = !size || !p.size ? 0.5 : size === p.size ? 1 : size.replace(/[\d.]+/, "") === p.size.replace(/[\d.]+/, "") ? 0 : 0.5;
    if (sizeScore === 0) continue;
    const flavorScore =
      flavor === p.flavor ? 1 : p.flavorList.length > 1 && p.flavorList.includes(flavor) ? 0.7 : /diferentes sabores|varios/.test(p.flavor) ? 0.5 : 0;
    if (flavorScore === 0) continue;
    const score = nameScore * 0.5 + sizeScore * 0.3 + flavorScore * 0.2;
    const sure = nameScore === 1 && sizeScore === 1 && flavorScore === 1;
    const why = [nameScore < 1 && "nombre parecido", sizeScore < 1 && "presentación por confirmar", flavorScore < 1 && "sabor dentro de un producto con varios sabores"].filter(Boolean).join(", ");
    out.push({ id: p.id, name: p.name, sku: p.sku, stock: p.stock, score, sure, why: why || "mismo producto" });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

/**
 * 2.8.2 · Un renglón del Excel sin SKU: ¿qué producto de la app es? Por descripción —
 * marca (de su columna, del nombre «Producto · Marca · Tamaño» o encontrada dentro del
 * nombre), tipo de suplemento, presentación y sabor. `auto` = tan claro que se liga solo.
 */
export function describedMatch(
  row: { name: string; brand?: string; flavor?: string; presentation?: string },
  catalog: Known[],
): { auto: Candidate | null; candidates: Candidate[] } {
  const parts = String(row.name || "").split(" · ").map((x) => x.trim());
  let brand = String(row.brand || "").trim() || (parts.length > 1 ? parts[1] : "");
  if (!brand) {
    // Marca escrita dentro del nombre («Creatina GAT Sport 1 kg»): la más larga que aparezca.
    const text = ` ${fold(row.name)} `;
    brand =
      [...new Set(catalog.map((p) => p.brand).filter(Boolean))]
        .filter((x) => fold(x).length >= 3 && text.includes(` ${fold(x)} `))
        .sort((x, y) => y.length - x.length)[0] ?? "";
  }
  const sizeText = [row.presentation, parts[2], row.name].map((x) => String(x || "")).find((x) => sizeOf(x)) || "";
  const size = sizeOf(sizeText)?.key ?? "";
  const base = tokens(baseTitle(parts[0] || row.name), [brand]);
  const flavor = flavorKey(row.flavor);
  if (!base.length) return { auto: null, candidates: [] };
  const out: Candidate[] = [];
  for (const p of catalog) {
    const brandOk = !!brand && sameBrand(p.brand, brand);
    if (brand && p.brand && !brandOk) continue;
    let nameScore = jaccard(base, p.base);
    // «Creatine» contra «Creatine Monohydrate»: todo lo de uno viene en el otro.
    const A = new Set(base),
      B = new Set(p.base);
    if (nameScore < 0.8 && p.base.length && ([...B].every((t) => A.has(t)) || [...A].every((t) => B.has(t)))) nameScore = 0.8;
    if (nameScore < 0.5) continue;
    const sizeScore = !size || !p.size ? 0.5 : size === p.size ? 1 : size.replace(/[\d.]+/, "") === p.size.replace(/[\d.]+/, "") ? 0 : 0.5;
    if (sizeScore === 0) continue;
    const flavorScore =
      flavor === p.flavor
        ? 1
        : p.flavorList.length > 1 && p.flavorList.includes(flavor)
          ? 0.7
          : !flavor || /diferentes sabores|varios/.test(p.flavor)
            ? 0.4
            : 0;
    if (flavorScore === 0) continue;
    const score = nameScore * 0.5 + sizeScore * 0.3 + flavorScore * 0.2 - (brandOk ? 0 : 0.15);
    const sure = brandOk && nameScore === 1 && sizeScore === 1 && flavorScore === 1;
    out.push({ id: p.id, name: p.name, sku: p.sku, stock: p.stock, score, sure, why: brandOk ? "misma marca" : "sin marca para comparar" });
  }
  out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  const [top, second] = out;
  const clear = !!top && (top.sure || (top.why === "misma marca" && top.score >= 0.85 && (!second || second.score <= top.score - 0.1)));
  return { auto: clear ? top : null, candidates: out.slice(0, 3) };
}

// ---------------------------------------------------------------- SKU homologado

const CATEGORIES: { test: RegExp; category: string; prefix: string }[] = [
  { test: /creatin/, category: "Creatina", prefix: "CRE" },
  { test: /whey|protein|isolat|iso ?100|caseina|casein/, category: "Proteína", prefix: "PRO" },
  { test: /bcaa|eaa|amino/, category: "Aminoácidos", prefix: "AMI" },
  { test: /glutamin/, category: "Glutamina", prefix: "GLU" },
  { test: /carnitin|carnigen/, category: "Carnitina", prefix: "CAR" },
  { test: /gainer|mass|ganador/, category: "Ganador de peso", prefix: "GAN" },
  { test: /cereal|rice|arroz|avena|oat|pancake|carb/, category: "Carbohidratos", prefix: "CHO" },
  { test: /omega/, category: "Omega 3", prefix: "OME" },
  { test: /vitamin|multivit|\bd3\b|zinc|magnesio|magnesium/, category: "Vitaminas", prefix: "VIT" },
  { test: /testo|testrol|hormon/, category: "Soporte hormonal", prefix: "SOP" },
  { test: /bar\b|barra/, category: "Barra proteica", prefix: "BAR" },
  { test: /coffee|cafe/, category: "Café funcional", prefix: "CAF" },
  { test: /energy drink|bebida|lata/, category: "Bebida energética", prefix: "BEB" },
  { test: /pre ?workout|preentreno|pre entreno|psychotic|venom|veinz|pump|nitra|c4|cbum|joker|boss|stim|nitric/, category: "Preentreno", prefix: "PRE" },
];
export function categoryOf(line: { brand: string; name: string }): { category: string; prefix: string } {
  const t = fold(`${line.name} ${line.brand}`);
  return CATEGORIES.find((c) => c.test.test(t)) ?? { category: "General", prefix: "GEN" };
}
/** Código corto del sabor: «Blue Raspberry» → «BLURAS», «Grape» → «GRA». */
export function flavorCode(flavor: string): string {
  const words = fold(flavor).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w && !STOP.has(w));
  return (words.slice(0, 2).map((w) => w.slice(0, 3)).join("") || "SAB").toUpperCase();
}

// ---------------------------------------------------------------- plan

export type PlanItem = {
  line: OrderLine;
  /** Costo real por pieza (con su parte del descuento y del envío), centavos. */
  unitCost: number;
  key: string;
  family: string;
  familyName: string;
  candidates: Candidate[];
  /** Producto existente elegido (o null = producto nuevo). */
  productId: string | null;
  sure: boolean;
  newSku: string;
  newName: string;
  category: string;
  size: string;
};
export type PriceGroup = {
  family: string;
  name: string;
  items: number[];
  cost: number;
  /** Precio que paga hoy el cliente (si el grupo tiene un producto existente). */
  currentClient: number | null;
};
export type OrderPlan = { order: SupplierOrder; items: PlanItem[]; groups: PriceGroup[]; duplicate: Row | null };

const lineKey = (l: OrderLine) => fold(`${l.brand}|${l.name}|${l.flavor}`);
export const ORDER_KEY = (n: string) => "supplierOrder:" + n;
export const ORDER_FILE_KEY = (hash: string) => "supplierOrderFile:" + hash;

/** Costo real por pieza: el subtotal de cada renglón se ajusta al Total pagado (exacto al centavo). */
export function realCosts(order: SupplierOrder): number[] {
  // Mismo factor para todas las piezas: (Total pagado) / (Sub-total del PDF). El redondeo a
  // centavos por pieza puede dejar unos centavos de diferencia contra el Total.
  const sub = order.lines.reduce((n, l) => n + l.subtotal, 0) || 1;
  return order.lines.map((l) => Math.round((l.subtotal / l.qty) * (order.total / sub)));
}

/** Arma el plan: qué producto es cada renglón, SKU de los nuevos y grupos para el precio. */
export function planSupplierOrder(b: Business, order: SupplierOrder, choices: Record<string, string | null> = {}): OrderPlan {
  const catalog = known(b);
  const costs = realCosts(order);
  const used = new Set(catalog.map((p) => p.sku.toUpperCase()));
  const nextNumber = new Map<string, number>();
  const nextFor = (prefix: string) => {
    if (!nextNumber.has(prefix)) {
      let max = 0;
      for (const sku of used) {
        const m = new RegExp(`^NS-${prefix}-(\\d{3})`).exec(sku);
        if (m) max = Math.max(max, Number(m[1]));
      }
      nextNumber.set(prefix, max);
    }
    const n = nextNumber.get(prefix)! + 1;
    nextNumber.set(prefix, n);
    return `NS-${prefix}-${String(n).padStart(3, "0")}`;
  };
  const familySku = new Map<string, string>();
  const items: PlanItem[] = order.lines.map((line, i) => {
    const key = lineKey(line);
    const remembered = b.setting("supplierMap:" + key, null) as string | null;
    const candidates = candidatesFor(line, catalog, remembered ?? undefined);
    const auto = candidates[0]?.sure ? candidates[0].id : null;
    const productId = key in choices ? choices[key] : auto;
    const size = sizeOf(line.name);
    const title = baseTitle(line.name);
    const family = fold(`${line.brand}|${tokens(title, [line.brand]).join(" ")}|${size?.key ?? ""}`);
    const familyName = [title, line.brand, size?.show].filter(Boolean).join(" · ");
    const { category, prefix } = categoryOf(line);
    let newSku = "";
    if (!productId) {
      if (!familySku.has(family)) {
        // Si la familia ya existe en el catálogo (otro sabor), se usa su número.
        const sibling = catalog.find((p) => p.family === family);
        familySku.set(family, sibling ? sibling.sku.replace(/-[A-Z0-9]+$/, "") : nextFor(prefix));
      }
      const base = familySku.get(family)!;
      newSku = line.flavor ? `${base}-${flavorCode(line.flavor)}` : base;
      for (let n = 2; used.has(newSku.toUpperCase()); n++) newSku = `${line.flavor ? `${base}-${flavorCode(line.flavor)}` : base}${n}`;
      used.add(newSku.toUpperCase());
    }
    return {
      line,
      unitCost: costs[i],
      key,
      family,
      familyName,
      candidates,
      productId,
      sure: !!auto && productId === auto,
      newSku,
      newName: line.flavor ? `${familyName} · ${line.flavor}` : familyName,
      category,
      size: size?.show ?? "",
    };
  });
  const bps = b.feeBps();
  const inPrice = b.feeInPrice();
  const groups: PriceGroup[] = [];
  items.forEach((it, i) => {
    let g = groups.find((x) => x.family === it.family);
    if (!g) {
      g = { family: it.family, name: it.familyName, items: [], cost: 0, currentClient: null };
      groups.push(g);
    }
    g.items.push(i);
    g.cost = Math.max(g.cost, it.unitCost);
    if (it.productId && g.currentClient === null) {
      const p = catalog.find((x) => x.id === it.productId);
      if (p) g.currentClient = inPrice ? p.price : grossUp(p.price, bps);
    }
  });
  const duplicate =
    (order.number ? (b.setting(ORDER_KEY(order.number), null) as Row | null) : null) ??
    (order.fileHash ? (b.setting(ORDER_FILE_KEY(order.fileHash), null) as Row | null) : null);
  return { order, items, groups, duplicate };
}

/**
 * 2.8.2 · Punto de control: lo que ya tienes de los productos del pedido y lo que se suma.
 * «Actualmente tienes X piezas y vas a agregar N piezas más del Pedido #… (archivo.pdf)».
 */
export function orderCheckpoint(b: Business, plan: OrderPlan): { have: number; add: number; source: string; when: string } {
  const stock = new Map(b.stock().map((p: Row) => [p.id, Number(p.stock) || 0]));
  const ids = new Set(plan.items.filter((i) => i.productId).map((i) => i.productId!));
  const have = [...ids].reduce((n, id) => n + (stock.get(id) ?? 0), 0);
  const add = plan.order.lines.reduce((n, l) => n + l.qty, 0);
  const o = plan.order;
  const source = `Pedido ${o.number ? "#" + o.number : ""}${o.fileName ? ` (${o.fileName})` : ""}`.replace(/\s+/g, " ").trim();
  return { have, add, source, when: String(plan.duplicate?.at || "").slice(0, 10) };
}

// ---------------------------------------------------------------- calculadora

export type PriceCalc = {
  cost: number;
  markupPct: number;
  /** Lo que quieres recibir: costo + ganancia. */
  target: number;
  /** Precio que paga el cliente: lo anterior + comisión de la terminal, redondeado hacia arriba al peso. */
  client: number;
  fee: number;
  /** Lo que te queda después de la comisión. */
  net: number;
  profit: number;
  /** Ganancia real sobre el costo, %. */
  realPct: number;
  bps: number;
};
/** % de ganancia sobre el costo + comisión de la terminal (la absorbe el cliente). */
export function priceCalc(cost: number, markupPct: number, bps: number, client?: number): PriceCalc {
  const target = Math.round(cost * (1 + markupPct / 100));
  const suggested = Math.ceil(grossUp(target, bps) / 100) * 100;
  const c = client ?? suggested;
  const fee = cardFee(c, bps);
  const net = c - fee;
  return { cost, markupPct, target, client: c, fee, net, profit: net - cost, realPct: cost ? ((net - cost) / cost) * 100 : 0, bps };
}
/** Precio a guardar en el catálogo para que el cliente pague `client`. */
export function catalogPrice(b: Business, client: number): number {
  return b.feeInPrice() ? client : baseOf(client, b.feeBps());
}

// ---------------------------------------------------------------- aplicar

export type GroupDecision = { client: number; keepCurrent: boolean };

/** 2.8.4 · El plan con las cantidades que el dueño cambió (por renglón). El costo por pieza no cambia. */
export function withQuantities(plan: OrderPlan, qty: Record<string, number>): OrderPlan {
  return { ...plan, items: plan.items.map((it) => (qty[it.key] === undefined ? it : { ...it, line: { ...it.line, qty: qty[it.key] } })) };
}
export type ApplyResult = { created: number; restocked: number; units: number; repriced: number; paid: number };

export function applySupplierOrder(
  b: Business,
  plan: OrderPlan,
  decisions: Record<string, GroupDecision>,
  accountId: string | null,
): ApplyResult {
  const { order } = plan;
  const ref = "pedido:" + (order.number || Date.now());
  const label = `Pedido ${order.number ? "#" + order.number : ""} · ${order.supplier}`.trim();
  const result: ApplyResult = { created: 0, restocked: 0, units: 0, repriced: 0, paid: 0 };
  b.transaction(() => {
    if (accountId) {
      const balance = b.balance(accountId);
      if (balance < order.total)
        throw new Error(`La cuenta elegida tiene ${fmt(balance)} y el pedido es de ${fmt(order.total)}. Elige otra cuenta o «No registrar pago».`);
    }
    const touched = new Set<string>();
    for (const g of plan.groups) {
      const d = decisions[g.family] ?? { client: priceCalc(g.cost, 30, b.feeBps()).client, keepCurrent: g.currentClient !== null };
      const client = d.keepCurrent && g.currentClient !== null ? g.currentClient : d.client;
      const price = catalogPrice(b, client);
      const members = g.items.map((i) => plan.items[i]);
      const grouped = members.length > 1 || b.stock().some((p: Row) => p.family === g.family && !members.some((m) => m.productId === p.id));
      for (const it of members) {
        // 2.8.4: la cantidad se puede cambiar antes de cargar; 0 = no se carga ese renglón.
        if (it.line.qty <= 0) continue;
        let productId = it.productId;
        if (!productId) {
          productId = b.addProduct(it.newSku, it.newName, it.category, price, 1);
          result.created++;
        } else {
          const p = b.one("SELECT * FROM products WHERE id=?", productId);
          if (!(d.keepCurrent && g.currentClient !== null) && p.price !== price) {
            b.updateProduct(p.id, p.sku, p.name, p.category, price, p.minimum);
            result.repriced++;
          }
          if (!touched.has(productId)) result.restocked++;
        }
        touched.add(productId);
        const prev = b.setting("product:" + productId, {});
        const sku = b.one("SELECT sku FROM products WHERE id=?", productId).sku;
        b.setSetting("product:" + productId, {
          ...prev,
          imageKey: prev.imageKey || sku,
          sourceName: prev.sourceName || it.newName,
          brand: prev.brand || it.line.brand,
          flavor: it.productId ? prev.flavor || it.line.flavor : it.line.flavor,
          presentation: prev.presentation && !/confirmar/i.test(prev.presentation) ? prev.presentation : it.size || prev.presentation || "",
          ...(grouped ? { family: g.family, familyName: g.name } : {}),
          referenceCost: it.unitCost,
          inventoryKnown: true,
          archived: false,
        });
        b.receivePurchase(productId, label, it.line.qty, it.unitCost, ref, `${order.supplier} · ${it.line.brand} ${it.line.name}${it.line.flavor ? " · " + it.line.flavor : ""}`);
        b.setSetting("supplierMap:" + it.key, productId);
        result.units += it.line.qty;
      }
    }
    if (accountId) {
      b.payPurchase(accountId, order.total, ref, `${label}${order.number ? "" : ""}`);
      result.paid = order.total;
    }
    const record = {
      at: new Date().toISOString(),
      supplier: order.supplier,
      total: order.total,
      units: result.units,
      products: [...touched],
      fileName: order.fileName || "",
    };
    if (order.number) b.setSetting(ORDER_KEY(order.number), record);
    if (order.fileHash) b.setSetting(ORDER_FILE_KEY(order.fileHash), record);
    b.audit("supplier.order", ref, `${result.created} nuevos · ${result.restocked} con más piezas · ${result.units} piezas · ${fmt(order.total)}`);
  });
  return result;
}
