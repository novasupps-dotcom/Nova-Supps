// Excel de ventas con el detalle completo: cada venta (un renglón por producto
// del folio), cada movimiento de dinero (cobros, abonos, devoluciones y
// comisiones) y un resumen ejecutivo del periodo. Todas las consultas son por
// lote (sin N+1).
import { salesReport } from "./reports";
import { feeLabel, localDay, money, saleSegment, spread, type Business, type Row } from "./business";
import { cardLabel } from "./receipt";
import { buildXlsx, type RowStyle, type Sheet } from "./xlsx";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const EXPORT_PERIODS = ["Hoy", "Esta semana", "Este mes", "Mes pasado", "Este año", "Todo"] as const;
export type ExportPeriod = (typeof EXPORT_PERIODS)[number];

/** Rango [from, to) en ISO (hora local del teléfono) para cada periodo. */
export function exportRange(p: ExportPeriod, now = new Date()): { from: string | null; to: string | null; label: string } {
  const y = now.getFullYear(),
    m = now.getMonth(),
    d = now.getDate();
  const at = (yy: number, mm: number, dd: number) => new Date(yy, mm, dd).toISOString();
  if (p === "Hoy") return { from: at(y, m, d), to: at(y, m, d + 1), label: "Hoy" };
  if (p === "Esta semana") {
    const monday = d - ((now.getDay() + 6) % 7);
    return { from: at(y, m, monday), to: at(y, m, d + 1), label: "Semana" };
  }
  if (p === "Este mes") return { from: at(y, m, 1), to: at(y, m + 1, 1), label: "Mes" };
  if (p === "Mes pasado") return { from: at(y, m - 1, 1), to: at(y, m, 1), label: "Mes-pasado" };
  if (p === "Este año") return { from: at(y, 0, 1), to: at(y + 1, 0, 1), label: "Año" };
  return { from: null, to: null, label: "Todo" };
}

const pesos = (c: number | null | undefined) => (c === null || c === undefined ? null : Math.round(Number(c)) / 100);
const when = (iso: string) => {
  const t = new Date(iso);
  return isNaN(t.getTime()) ? null : t;
};
const two = (n: number) => String(n).padStart(2, "0");
const fmtNow = (d: Date) => `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
const STATUS: Record<string, string> = { confirmed: "Activa", cancelled: "Cancelada" };

/** Forma de cobro legible a partir de la cuenta. */
export function methodLabel(kind: string, account: string): string {
  if (kind === "Efectivo") return "Efectivo";
  if (kind === "Tarjeta") return "Tarjeta (terminal)";
  if (kind === "Banco") return `Transferencia · ${account}`;
  if (kind === "Billetera") return `Billetera · ${account}`;
  return account || kind;
}

export function salesSheets(b: Business, range: { from: string | null; to: string | null }, periodName = "Todo"): { sheets: Sheet[]; count: number } {
  const since = range.from ?? "";
  const until = range.to ?? "9999";
  const sales = b.sales().filter((v) => v.created >= since && v.created < until);
  const ids = new Set(sales.map((v) => v.id));
  const bps = b.feeBps();
  const phones = new Map(b.all("SELECT id,phone FROM customers").map((c) => [c.id, c.phone]));
  const lineMeta = b.settingsMap("line:");
  const lineCost = new Map(b.all("SELECT lineId,COALESCE(SUM(qty*cost),0) cost FROM allocations GROUP BY lineId").map((r) => [r.lineId, r.cost as number]));
  const lines = new Map<string, Row[]>();
  for (const l of b.all("SELECT l.id,l.saleId,l.productId,l.qty,l.name,p.sku,p.category,p.name pname FROM sale_lines l LEFT JOIN products p ON p.id=l.productId ORDER BY l.id")) {
    if (!ids.has(l.saleId)) continue;
    const list = lines.get(l.saleId) ?? [];
    list.push(l);
    lines.set(l.saleId, list);
  }
  const moves = new Map<string, Row[]>();
  for (const l of b.all("SELECT l.*,a.name account,a.kind accountKind FROM ledger l JOIN accounts a ON a.id=l.accountId WHERE l.ref IS NOT NULL ORDER BY l.created,l.id")) {
    if (!ids.has(l.ref)) continue;
    const list = moves.get(l.ref) ?? [];
    list.push(l);
    moves.set(l.ref, list);
  }
  const isFee = (x: Row) => x.kind === "expense" && String(x.note || "").startsWith("Comisión tarjeta");

  const saleRows: any[][] = [];
  const moneyRows: any[][] = [];
  const byMethod = new Map<string, { sales: Set<string>; amount: number; fee: number }>();
  const bySeller = new Map<string, { n: number; total: number; profit: number }>();
  const bySegment = new Map<string, { units: number; amount: number }>();
  let active = 0,
    activeTotal = 0,
    cancelled = 0,
    cancelledTotal = 0,
    pieces = 0,
    collected = 0,
    receivable = 0,
    fees = 0,
    feeSales = 0,
    commissions = 0,
    commissionSales = 0,
    cost = 0,
    profit = 0;

  // De la más antigua a la más reciente (como se lee un reporte).
  for (const v of [...sales].reverse()) {
    const ok = v.status === "confirmed";
    const ls = lines.get(v.id) ?? [];
    const mv = moves.get(v.id) ?? [];
    const paid = mv.filter((x) => x.kind === "sale").reduce((n, x) => n + x.amount, 0);
    const refunded = -mv.filter((x) => x.kind === "refund").reduce((n, x) => n + x.amount, 0);
    const feeMoves = mv.filter(isFee);
    const fee = Math.max(0, -feeMoves.reduce((n, x) => n + x.amount, 0));
    const realFee = feeMoves.some((x) => String(x.note).includes("real"));
    const net = paid - refunded;
    const balance = ok ? Math.max(0, v.total - net) : 0;
    const units = ls.reduce((n, l) => n + l.qty, 0);
    const methods = [...new Set(mv.filter((x) => x.kind === "sale" || x.kind === "refund").map((x) => methodLabel(x.accountKind, x.account)))];
    const accounts = [...new Set(mv.filter((x) => x.kind === "sale" || x.kind === "refund").map((x) => x.account))];
    const card = (Array.isArray(v.mpPayments) ? v.mpPayments : []).map((x: Row) => x.card || {}).find((c: Row) => c.last4 || c.brand || c.authorization) || null;
    const seller = v.seller || "Dueño";
    const saleProfit = ok ? v.total - v.cost - fee : 0;
    // 1.9: comisión que pagó el cliente (va dentro del total).
    const commission = Number(v.commission) > 0 ? Number(v.commission) : 0;
    const folio = v.folio || String(v.id).slice(-8).toUpperCase();
    // 2.10 · Un renglón por producto del folio. Lo que es de toda la venta (total, cobros,
    // comisiones, utilidad) va solo en el primer renglón para que los totales cuadren.
    const goods = Math.max(0, v.total - commission);
    const stored = ls.map((l) => {
      const meta = lineMeta.get(l.id);
      return meta && Number.isFinite(meta.unitPrice) ? Math.round(meta.unitPrice * l.qty - (meta.discount || 0)) : null;
    });
    const amounts = ls.length && stored.every((x) => x !== null) ? (stored as number[]) : spread(goods, ls.map((l) => Number(l.qty)));
    const saleCols = [
      pesos(goods),
      pesos(commission || null),
      pesos(v.total),
      pesos(paid),
      pesos(refunded || null),
      pesos(balance),
    ];
    const payCols = [methods.join(" + ") || (ok ? "Sin cobro" : ""), accounts.join(" + ")];
    const feeCols = [
      fee > 0 ? "Sí" : "No",
      pesos(fee),
      fee > 0 ? (realFee ? "Real Mercado Pago" : `Estimada ${feeLabel(bps)}`) : "",
      pesos(net - fee),
      pesos(ok ? v.cost : 0),
      pesos(saleProfit),
    ];
    const cardCols = [card ? cardLabel(card) : "", card?.authorization || "", card?.operation || v.mpPaymentId || "", v.notes || ""];
    (ls.length ? ls : [null]).forEach((l: Row | null, i: number) => {
      const meta = l ? lineMeta.get(l.id) : null;
      const lc = l ? (lineCost.get(l.id) ?? 0) : null;
      const amount = l ? amounts[i] : null;
      const firstRow = i === 0;
      saleRows.push([
        when(v.created),
        folio,
        ls.length > 1 ? `${i + 1} de ${ls.length}` : "1 de 1",
        STATUS[v.status] || v.status,
        v.customer || "Público general",
        v.customerId ? phones.get(v.customerId) || "" : "",
        seller,
        v.channel || "",
        l ? l.name : "",
        l ? l.sku || "" : "",
        l ? l.category || "" : "",
        l ? l.qty : null,
        meta && Number.isFinite(meta.unitPrice) ? pesos(meta.unitPrice) : l && l.qty ? pesos(Math.round((amount ?? 0) / l.qty)) : null,
        meta?.discount ? pesos(meta.discount) : null,
        pesos(amount),
        pesos(lc),
        amount === null || lc === null ? null : pesos(amount - lc),
        ...(firstRow ? saleCols : saleCols.map(() => null)),
        ...payCols,
        ...(firstRow ? feeCols : [feeCols[0], null, feeCols[2], null, null, null]),
        ...(firstRow ? cardCols : [cardCols[0], cardCols[1], cardCols[2], ""]),
      ]);
      if (ok && l) {
        const seg = saleSegment({ category: l.category, name: l.pname || l.name });
        const g = bySegment.get(seg) ?? { units: 0, amount: 0 };
        g.units += l.qty;
        g.amount += amount ?? 0;
        bySegment.set(seg, g);
      }
    });
    for (const x of mv) {
      const kind = x.kind === "sale" ? "Cobro" : x.kind === "refund" ? "Devolución" : isFee(x) ? (String(x.note).includes("real") ? "Comisión tarjeta (real)" : "Comisión tarjeta (estimada)") : x.kind;
      moneyRows.push([when(x.created), folio, v.customer || "Público general", kind, methodLabel(x.accountKind, x.account), x.account, pesos(x.amount), x.note || ""]);
      if (x.kind === "sale" || x.kind === "refund" || isFee(x)) {
        const key = methodLabel(x.accountKind, x.account);
        const g = byMethod.get(key) ?? { sales: new Set<string>(), amount: 0, fee: 0 };
        if (isFee(x)) g.fee += -x.amount;
        else {
          g.amount += x.amount;
          g.sales.add(v.id);
        }
        byMethod.set(key, g);
      }
    }
    if (ok) {
      active++;
      activeTotal += v.total;
      pieces += units;
      collected += net;
      receivable += balance;
      fees += fee;
      if (fee > 0) feeSales++;
      commissions += commission;
      if (commission > 0) commissionSales++;
      cost += v.cost;
      profit += saleProfit;
      const g = bySeller.get(seller) ?? { n: 0, total: 0, profit: 0 };
      g.n++;
      g.total += goods;
      g.profit += saleProfit;
      bySeller.set(seller, g);
    } else {
      cancelled++;
      cancelledTotal += v.total;
    }
  }

  const fmtDay = (iso: string | null) => (iso ? localDay(iso).split("-").reverse().join("/") : "");
  const lastDay = range.to ? new Date(new Date(range.to).getTime() - 1).toISOString() : null;
  const report = salesReport(b, range);

  // 2.10 · Resumen ejecutivo: indicadores clave, estado de resultados, flujo de dinero y
  // lo que más se vendió. Importes en tu precio salvo donde se indica.
  const goodsTotal = activeTotal - commissions;
  const share = (part: number, whole: number) => (whole ? part / whole : null);
  const summary: any[][] = [];
  const styles: RowStyle[] = [];
  const add = (row: any[], style?: RowStyle) => (summary.push(row), styles.push(style ?? null));
  const blank = () => add([null, null, null, null]);
  const section = (title: string, cols: [string, string, string] = ["Cantidad", "Importe", "%"]) => add([title, ...cols], "section");
  add(["Resumen ejecutivo de ventas · Nova Supps", null, null, null], "title");
  add([`Periodo: ${periodName}${range.from ? ` (${fmtDay(range.from)} – ${fmtDay(lastDay)})` : ""} · Generado: ${fmtNow(new Date())}`, null, null, null]);
  blank();
  section("INDICADORES CLAVE", ["Cantidad", "Importe", "% / margen"]);
  add(["Ventas (a tu precio)", active, pesos(goodsTotal), null], "strong");
  add(["Utilidad", null, pesos(profit), share(profit, goodsTotal)], "strong");
  add(["Ticket promedio", null, active ? pesos(Math.round(goodsTotal / active)) : null, null]);
  add(["Piezas vendidas", pieces, null, null]);
  add(["Cobrado (neto de devoluciones)", null, pesos(collected), share(collected, activeTotal)]);
  add(["Por cobrar", null, pesos(receivable), share(receivable, activeTotal)]);
  add(["Ventas canceladas", cancelled, pesos(cancelledTotal), null]);
  if (report.totals.discount) add(["Descuentos por promociones", null, pesos(-report.totals.discount), share(report.totals.discount, goodsTotal)]);
  blank();
  section("ESTADO DE RESULTADOS", ["Ventas", "Importe", "% de ventas"]);
  add(["Ventas a tu precio", active, pesos(goodsTotal), share(goodsTotal, goodsTotal)]);
  add(["(+) Comisión absorbida por clientes", commissionSales, pesos(commissions), share(commissions, goodsTotal)]);
  add(["(=) Total cobrado a clientes", null, pesos(activeTotal), share(activeTotal, goodsTotal)], "strong");
  add(["(−) Costo de la mercancía", null, pesos(-cost), share(cost, goodsTotal)]);
  add(["(−) Comisión Mercado Pago (cobros con tarjeta)", feeSales, pesos(-fees), share(fees, goodsTotal)]);
  add(["(=) Utilidad", null, pesos(profit), share(profit, goodsTotal)], "strong");
  blank();
  section("FLUJO DE DINERO", ["Ventas", "Importe", "%"]);
  add(["Cobrado (neto de devoluciones)", null, pesos(collected), null]);
  add(["(−) Comisión Mercado Pago", feeSales, pesos(-fees), null]);
  add(["(=) Neto recibido", null, pesos(collected - fees), null], "strong");
  add(["Por cobrar a clientes", null, pesos(receivable), null]);
  blank();
  section("TOP 5 PRODUCTOS", ["Piezas", "Importe", "% de ventas"]);
  for (const p of report.products.slice(0, 5)) add([p.name, p.units, pesos(p.revenue), share(p.revenue, report.totals.revenue)]);
  if (!report.products.length) add(["Sin ventas en el periodo", null, null, null]);
  blank();
  section("POR FORMA DE COBRO", ["Ventas", "Cobrado", "% del cobrado"]);
  const methodTotal = [...byMethod.values()].reduce((n, g) => n + g.amount, 0);
  for (const [k, g] of [...byMethod.entries()].sort((x, y) => y[1].amount - x[1].amount)) {
    add([k, g.sales.size, pesos(g.amount), share(g.amount, methodTotal)]);
    if (g.fee) add([`   Comisión Mercado Pago ${k}`, null, pesos(-g.fee), null]);
  }
  blank();
  section("POR VENDEDOR", ["Ventas", "Importe", "% de ventas"]);
  for (const [k, g] of [...bySeller.entries()].sort((x, y) => y[1].total - x[1].total)) add([`${k} · utilidad ${money(g.profit)}`, g.n, pesos(g.total), share(g.total, goodsTotal)]);
  blank();
  section("POR CATEGORÍA", ["Piezas", "Importe", "% de ventas"]);
  const segTotal = [...bySegment.values()].reduce((n, g) => n + g.amount, 0);
  for (const [k, g] of [...bySegment.entries()].sort((x, y) => y[1].amount - x[1].amount)) add([k, g.units, pesos(g.amount), share(g.amount, segTotal)]);
  blank();
  add(["NOTAS", null, null, null], "section");
  add([`Comisión: ${feeLabel(bps)} de Mercado Pago, la absorbe el cliente con cualquier forma de pago (recibes tu precio completo).`, null, null, null]);
  add([`Ventas sin comisión al cliente (anteriores a 1.9): ${active - commissionSales}.`, null, null, null]);
  add(["El detalle está en la hoja Ventas: un renglón por producto; el total de cada folio va en su primer renglón.", null, null, null]);

  const sheets: Sheet[] = [
    {
      name: "Resumen",
      report: true,
      rowStyles: styles,
      columns: [{ header: "Concepto", width: 58 }, { header: "Cantidad", type: "int", width: 12 }, { header: "Importe", type: "money", width: 16 }, { header: "%", type: "pct", width: 13 }],
      rows: summary,
    },
    {
      name: "Ventas",
      totals: true,
      columns: [
        { header: "Fecha", type: "date" },
        { header: "Folio", width: 12 },
        { header: "Renglón", width: 9 },
        { header: "Estado", width: 11 },
        { header: "Cliente", width: 24 },
        { header: "Teléfono", width: 14 },
        { header: "Vendedor", width: 14 },
        { header: "Canal", width: 12 },
        { header: "Producto", width: 40 },
        { header: "SKU", width: 12 },
        { header: "Categoría", width: 18 },
        { header: "Piezas", type: "int" },
        { header: "Precio unitario", type: "money", sum: false },
        { header: "Descuento", type: "money" },
        { header: "Importe del producto", type: "money" },
        { header: "Costo del producto", type: "money" },
        { header: "Utilidad del producto", type: "money" },
        { header: "Tu precio (venta)", type: "money" },
        { header: "Comisión absorbida por el cliente", type: "money" },
        { header: "Total venta", type: "money" },
        { header: "Cobrado", type: "money" },
        { header: "Devuelto", type: "money" },
        { header: "Por cobrar", type: "money" },
        { header: "Forma de cobro", width: 26 },
        { header: "Cuenta", width: 20 },
        { header: "¿Comisión Mercado Pago?", width: 11 },
        { header: "Comisión Mercado Pago", type: "money" },
        { header: "Tipo de comisión", width: 20 },
        { header: "Neto recibido", type: "money" },
        { header: "Costo mercancía (venta)", type: "money" },
        { header: "Utilidad (venta)", type: "money" },
        { header: "Tarjeta", width: 22 },
        { header: "Autorización", width: 13 },
        { header: "Operación MP", width: 16 },
        { header: "Notas", width: 30 },
      ],
      rows: saleRows,
    },
    {
      name: "Cobros y comisiones",
      totals: true,
      columns: [
        { header: "Fecha", type: "date" },
        { header: "Folio", width: 12 },
        { header: "Cliente", width: 24 },
        { header: "Movimiento", width: 24 },
        { header: "Forma de cobro", width: 26 },
        { header: "Cuenta", width: 20 },
        { header: "Importe", type: "money" },
        { header: "Nota", width: 36 },
      ],
      rows: moneyRows,
    },
    // 2.1 · Resumen por producto y por vendedor (ventas confirmadas del periodo, en tu precio).
    {
      name: "Por producto",
      totals: true,
      columns: [
        { header: "Producto", width: 40 },
        { header: "Segmento", width: 14 },
        { header: "Piezas", type: "int" },
        { header: "Ventas", type: "int" },
        { header: "Importe (tu precio)", type: "money" },
        { header: "Descuento promociones", type: "money" },
        { header: "Costo", type: "money" },
        { header: "Utilidad", type: "money" },
      ],
      // 2.10: importes en pesos (antes salían en centavos).
      rows: report.products.map((p) => [p.name, p.segment, p.units, p.sales, pesos(p.revenue), pesos(p.discount), pesos(p.cost), pesos(p.profit)]),
    },
    {
      name: "Por vendedor",
      totals: true,
      columns: [
        { header: "Vendedor", width: 24 },
        { header: "Ventas", type: "int" },
        { header: "Piezas", type: "int" },
        { header: "Importe (tu precio)", type: "money" },
        { header: "Cobrado al cliente", type: "money" },
        { header: "Costo", type: "money" },
        { header: "Utilidad", type: "money" },
      ],
      rows: report.sellers.map((x) => [x.seller, x.sales, x.units, pesos(x.revenue), pesos(x.charged), pesos(x.cost), pesos(x.profit)]),
    },
  ];
  return { sheets, count: sales.length };
}

/** Bytes del Excel de ventas del periodo. */
export function salesWorkbook(b: Business, period: ExportPeriod, now = new Date()): { bytes: Uint8Array; count: number; fileName: string } {
  const range = exportRange(period, now);
  const { sheets, count } = salesSheets(b, range, period);
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return { bytes: buildXlsx(sheets, now), count, fileName: `Ventas_Nova_${range.label}_${stamp}.xlsx` };
}
