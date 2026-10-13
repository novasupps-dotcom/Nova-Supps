// 2.1 · Reportes por producto, por vendedor y de promociones de un periodo.
// Importes en TU precio (sin la comisión que absorbe el cliente), que es lo que
// recibes; "Cobrado al cliente" incluye la comisión.
import { saleSegment, spread, type Business, type Row } from "./business";

export type ProductReport = { productId: string; name: string; segment: string; units: number; sales: number; revenue: number; cost: number; profit: number; discount: number };
export type SellerReport = { seller: string; sales: number; units: number; revenue: number; charged: number; cost: number; profit: number };
export type PromoReport = { name: string; sales: number; amount: number };
export type SalesReport = { products: ProductReport[]; sellers: SellerReport[]; promos: PromoReport[]; totals: { sales: number; units: number; revenue: number; charged: number; cost: number; profit: number; discount: number } };

/** Ventas confirmadas creadas en [from, to). */
export function salesReport(b: Business, range: { from: string | null; to: string | null }): SalesReport {
  const since = range.from ?? "";
  const until = range.to ?? "9999";
  const sales = b.all("SELECT id,total,created FROM sales WHERE status='confirmed' AND created>=? AND created<?", since, until);
  const ids = new Set(sales.map((v) => v.id as string));
  const meta = b.settingsMap("sale:");
  const lineMeta = b.settingsMap("line:");
  const lineCost = new Map(b.all("SELECT lineId,COALESCE(SUM(qty*cost),0) cost FROM allocations GROUP BY lineId").map((r) => [r.lineId as string, Number(r.cost)]));
  const linesBySale = new Map<string, Row[]>();
  for (const l of b.all("SELECT l.id,l.saleId,l.productId,l.qty,l.name,p.category,p.name pname FROM sale_lines l LEFT JOIN products p ON p.id=l.productId ORDER BY l.id")) {
    if (!ids.has(l.saleId)) continue;
    const list = linesBySale.get(l.saleId) ?? [];
    list.push(l);
    linesBySale.set(l.saleId, list);
  }
  const products = new Map<string, ProductReport & { saleIds: Set<string> }>();
  const sellers = new Map<string, SellerReport>();
  const promos = new Map<string, PromoReport>();
  const totals = { sales: 0, units: 0, revenue: 0, charged: 0, cost: 0, profit: 0, discount: 0 };
  for (const v of sales) {
    const m = meta.get(v.id) ?? {};
    const ls = linesBySale.get(v.id) ?? [];
    const commission = Number(m.commission) > 0 ? Number(m.commission) : 0;
    const goods = Math.max(0, Number(v.total) - commission);
    // Importe de cada renglón en tu precio: el guardado en la venta o, en ventas antiguas, proporcional.
    const stored = ls.map((l) => {
      const lm = lineMeta.get(l.id);
      return lm && Number.isFinite(Number(lm.unitPrice)) ? Math.round(Number(lm.unitPrice) * l.qty - (Number(lm.discount) || 0)) : null;
    });
    const amounts = stored.every((x) => x !== null) && ls.length ? (stored as number[]) : spread(goods, ls.map((l) => Number(l.qty)));
    const seller = String(m.seller || "Tú (dueño)");
    const s = sellers.get(seller) ?? { seller, sales: 0, units: 0, revenue: 0, charged: 0, cost: 0, profit: 0 };
    let saleCost = 0,
      saleUnits = 0;
    ls.forEach((l, i) => {
      const cost = lineCost.get(l.id) ?? 0;
      const discount = Math.max(0, Math.round(Number(lineMeta.get(l.id)?.discount) || 0));
      const p = products.get(l.productId) ?? { productId: l.productId, name: String(l.pname || l.name), segment: saleSegment({ category: l.category, name: l.pname || l.name }), units: 0, sales: 0, revenue: 0, cost: 0, profit: 0, discount: 0, saleIds: new Set<string>() };
      p.units += Number(l.qty);
      p.revenue += amounts[i];
      p.cost += cost;
      p.profit += amounts[i] - cost;
      p.discount += discount;
      p.saleIds.add(v.id);
      products.set(l.productId, p);
      saleCost += cost;
      saleUnits += Number(l.qty);
      totals.discount += discount;
    });
    s.sales++;
    s.units += saleUnits;
    s.revenue += goods;
    s.charged += Number(v.total);
    s.cost += saleCost;
    s.profit += goods - saleCost;
    sellers.set(seller, s);
    for (const x of Array.isArray(m.promos) ? m.promos : []) {
      const name = String(x.name || "Promoción");
      const pr = promos.get(name) ?? { name, sales: 0, amount: 0 };
      pr.sales++;
      pr.amount += Number(x.amount) || 0;
      promos.set(name, pr);
    }
    totals.sales++;
    totals.units += saleUnits;
    totals.revenue += goods;
    totals.charged += Number(v.total);
    totals.cost += saleCost;
    totals.profit += goods - saleCost;
  }
  return {
    products: [...products.values()].map(({ saleIds, ...p }) => ({ ...p, sales: saleIds.size })).sort((a, b) => b.revenue - a.revenue || b.units - a.units),
    sellers: [...sellers.values()].sort((a, b) => b.revenue - a.revenue),
    promos: [...promos.values()].sort((a, b) => b.amount - a.amount),
    totals,
  };
}
