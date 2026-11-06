// 2.10 · Reporte de stock (Excel) desde la pantalla Stock: resumen ejecutivo del
// inventario, una fila por producto con su valor y rotación, lo que hay que
// reabastecer y el detalle por lote. Todas las consultas son por lote (sin N+1).
import { localDay, saleSegment, today, type Business } from "./business";
import { buildXlsx, type RowStyle, type Sheet } from "./xlsx";

const pesos = (c: number | null | undefined) => (c === null || c === undefined ? null : Math.round(Number(c)) / 100);
const two = (n: number) => String(n).padStart(2, "0");
const fmtNow = (d: Date) => `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
const fmtDay = (day: string) => (day ? day.split("-").reverse().join("/") : "");
const plusDays = (day: string, n: number) => {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${two(t.getUTCMonth() + 1)}-${two(t.getUTCDate())}`;
};

export type StockStatus = "OK" | "Bajo mínimo" | "Sin stock" | "Por confirmar";
export function stockStatus(p: { inventoryKnown?: boolean; available: number; minimum: number }): StockStatus {
  if (!p.inventoryKnown) return "Por confirmar";
  if (p.available < 1) return "Sin stock";
  if (p.available <= p.minimum) return "Bajo mínimo";
  return "OK";
}

/** Hojas del reporte de stock (productos activos; los archivados no cuentan). */
export function stockSheets(b: Business, now = new Date()): { sheets: Sheet[]; count: number } {
  const day = today();
  const soon = plusDays(day, 30);
  const since = new Date(now.getTime() - 30 * 86400000).toISOString();
  const products = b.stock().filter((p: any) => !p.archived);
  const ids = new Set(products.map((p: any) => p.id as string));
  // Piezas vendidas en los últimos 30 días (ventas activas) para la rotación.
  const sold30 = new Map<string, number>(
    b
      .all("SELECT l.productId,COALESCE(SUM(l.qty),0) n FROM sale_lines l JOIN sales s ON s.id=l.saleId WHERE s.status='confirmed' AND s.created>=? GROUP BY l.productId", since)
      .map((r) => [r.productId as string, Number(r.n)]),
  );
  const lots = b.lots().filter((l: any) => ids.has(l.productId) && Number(l.qty) > 0);
  const nextExpiry = new Map<string, string>();
  for (const l of lots) {
    if (!l.expires) continue;
    const prev = nextExpiry.get(l.productId);
    if (!prev || l.expires < prev) nextExpiry.set(l.productId, l.expires);
  }

  const rows: any[][] = [];
  const restock: any[][] = [];
  const bySegment = new Map<string, { products: number; pieces: number; cost: number; retail: number }>();
  const tally = { products: 0, physical: 0, available: 0, cost: 0, retail: 0, low: 0, out: 0, unknown: 0 };
  for (const p of products as any[]) {
    const physical = Number(p.stock) || 0;
    const available = Number(p.available) || 0;
    const cost = Number(p.value) || 0;
    const retail = (Number(p.price) || 0) * physical;
    const avgCost = physical ? Math.round(cost / physical) : null;
    const status = stockStatus(p);
    const sold = sold30.get(p.id) ?? 0;
    const daysLeft = sold > 0 ? Math.round(available / (sold / 30)) : null;
    const seg = saleSegment({ category: p.category, name: p.name });
    rows.push([
      p.sku,
      p.name,
      p.brand || "",
      p.category || "",
      seg,
      physical,
      available,
      Math.max(0, physical - available) || null,
      Number(p.minimum) || 0,
      status,
      pesos(avgCost),
      pesos(p.price),
      pesos(cost),
      pesos(retail),
      pesos(retail - cost),
      retail ? (retail - cost) / retail : null,
      sold || null,
      daysLeft,
      nextExpiry.has(p.id) ? fmtDay(nextExpiry.get(p.id)!) : "",
    ]);
    if (status === "Bajo mínimo" || status === "Sin stock")
      restock.push([p.sku, p.name, seg, available, Number(p.minimum) || 0, Math.max(0, (Number(p.minimum) || 0) * 2 - available) || null, sold || null, status]);
    tally.products++;
    tally.physical += physical;
    tally.available += available;
    tally.cost += cost;
    tally.retail += retail;
    if (status === "Bajo mínimo") tally.low++;
    if (status === "Sin stock") tally.out++;
    if (status === "Por confirmar") tally.unknown++;
    const g = bySegment.get(seg) ?? { products: 0, pieces: 0, cost: 0, retail: 0 };
    g.products++;
    g.pieces += physical;
    g.cost += cost;
    g.retail += retail;
    bySegment.set(seg, g);
  }
  restock.sort((x, y) => (x[7] === y[7] ? String(x[1]).localeCompare(String(y[1])) : x[7] === "Sin stock" ? -1 : 1));

  const lotRows: any[][] = [];
  let expired = { lots: 0, pieces: 0, cost: 0 },
    expiring = { lots: 0, pieces: 0, cost: 0 };
  for (const l of lots as any[]) {
    const qty = Number(l.qty) || 0;
    const value = qty * (Number(l.cost) || 0);
    const state = !l.expires ? "Sin caducidad" : l.expires < day ? "Caducado" : l.expires <= soon ? "Caduca en 30 días" : "Vigente";
    if (state === "Caducado") (expired.lots++, (expired.pieces += qty), (expired.cost += value));
    if (state === "Caduca en 30 días") (expiring.lots++, (expiring.pieces += qty), (expiring.cost += value));
    lotRows.push([l.product, l.sku, l.label || "", l.expires ? fmtDay(l.expires) : "", state, qty, pesos(l.cost), pesos(value)]);
  }

  const share = (part: number, whole: number) => (whole ? part / whole : null);
  const summary: any[][] = [];
  const styles: RowStyle[] = [];
  const add = (row: any[], style?: RowStyle) => (summary.push(row), styles.push(style ?? null));
  const blank = () => add([null, null, null, null]);
  add(["Reporte de stock · Nova Supps", null, null, null], "title");
  add([`Corte al ${fmtDay(localDay(now.toISOString()))} · Generado: ${fmtNow(now)}`, null, null, null]);
  blank();
  add(["INDICADORES CLAVE", "Cantidad", "Importe", "% / margen"], "section");
  add(["Productos activos", tally.products, null, null], "strong");
  add(["Piezas en existencia (físicas)", tally.physical, null, null]);
  add(["Piezas disponibles para vender", tally.available, null, share(tally.available, tally.physical)]);
  add(["Valor del inventario a costo", null, pesos(tally.cost), null], "strong");
  add(["Valor del inventario a precio de venta", null, pesos(tally.retail), null]);
  add(["Utilidad potencial", null, pesos(tally.retail - tally.cost), share(tally.retail - tally.cost, tally.retail)], "strong");
  blank();
  add(["ALERTAS", "Productos", "Valor a costo", "% de productos"], "section");
  add(["Sin stock", tally.out, null, share(tally.out, tally.products)]);
  add(["Bajo mínimo", tally.low, null, share(tally.low, tally.products)]);
  add(["Existencias por confirmar", tally.unknown, null, share(tally.unknown, tally.products)]);
  add([`Lotes caducados (${expired.pieces} pzas)`, expired.lots, pesos(expired.cost), null]);
  add([`Lotes que caducan en 30 días (${expiring.pieces} pzas)`, expiring.lots, pesos(expiring.cost), null]);
  blank();
  add(["POR CATEGORÍA", "Piezas", "Valor a costo", "% del valor"], "section");
  for (const [k, g] of [...bySegment.entries()].sort((x, y) => y[1].cost - x[1].cost)) add([`${k} · ${g.products} ${g.products === 1 ? "producto" : "productos"}`, g.pieces, pesos(g.cost), share(g.cost, tally.cost)]);
  blank();
  add(["TOP 10 POR VALOR A COSTO", "Piezas", "Valor a costo", "% del valor"], "section");
  for (const r of [...rows].sort((x, y) => (y[12] ?? 0) - (x[12] ?? 0)).slice(0, 10)) add([r[1], r[5], r[12], share((r[12] ?? 0) * 100, tally.cost)]);
  blank();
  add(["NOTAS", null, null, null], "section");
  add(["Disponibles: lo que una venta puede tomar (lotes vigentes menos lo apartado).", null, null, null]);
  add(["Días de inventario: disponibles ÷ venta diaria de los últimos 30 días.", null, null, null]);
  add(["Sugerido a pedir: lo necesario para llegar al doble del mínimo.", null, null, null]);

  const sheets: Sheet[] = [
    {
      name: "Resumen",
      report: true,
      rowStyles: styles,
      columns: [{ header: "Concepto", width: 58 }, { header: "Cantidad", type: "int", width: 12 }, { header: "Importe", type: "money", width: 16 }, { header: "%", type: "pct", width: 14 }],
      rows: summary,
    },
    {
      name: "Stock",
      totals: true,
      columns: [
        { header: "SKU", width: 14 },
        { header: "Producto", width: 40 },
        { header: "Marca", width: 16 },
        { header: "Categoría", width: 18 },
        { header: "Segmento", width: 14 },
        { header: "Físicas", type: "int" },
        { header: "Disponibles", type: "int", width: 11 },
        { header: "Apartadas / no vendibles", type: "int", width: 12 },
        { header: "Mínimo", width: 9 },
        { header: "Estado", width: 14 },
        { header: "Costo promedio", type: "money", sum: false },
        { header: "Precio", type: "money", sum: false },
        { header: "Valor a costo", type: "money" },
        { header: "Valor a precio", type: "money" },
        { header: "Utilidad potencial", type: "money" },
        { header: "Margen", type: "pct", width: 10 },
        { header: "Vendidas 30 días", type: "int", width: 11 },
        { header: "Días de inventario", width: 11 },
        { header: "Caducidad más próxima", type: "text", width: 13 },
      ],
      rows,
    },
    {
      name: "Por reabastecer",
      columns: [
        { header: "SKU", width: 14 },
        { header: "Producto", width: 40 },
        { header: "Segmento", width: 14 },
        { header: "Disponibles", type: "int", width: 11 },
        { header: "Mínimo", type: "int" },
        { header: "Sugerido a pedir", type: "int", width: 11 },
        { header: "Vendidas 30 días", type: "int", width: 11 },
        { header: "Estado", width: 14 },
      ],
      rows: restock,
    },
    {
      name: "Lotes",
      totals: true,
      columns: [
        { header: "Producto", width: 40 },
        { header: "SKU", width: 14 },
        { header: "Lote", width: 14 },
        { header: "Caducidad", width: 12 },
        { header: "Estado", width: 18 },
        { header: "Piezas", type: "int" },
        { header: "Costo unitario", type: "money", sum: false },
        { header: "Valor a costo", type: "money" },
      ],
      rows: lotRows,
    },
  ];
  return { sheets, count: products.length };
}

/** Bytes del Excel de stock al momento. */
export function stockWorkbook(b: Business, now = new Date()): { bytes: Uint8Array; count: number; fileName: string } {
  const { sheets, count } = stockSheets(b, now);
  const stamp = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}_${two(now.getHours())}${two(now.getMinutes())}`;
  return { bytes: buildXlsx(sheets, now, "Stock GNS · Nova Supps"), count, fileName: `Stock_Nova_${stamp}.xlsx` };
}
