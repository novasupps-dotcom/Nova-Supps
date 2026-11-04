// 2.8 · Cargar pedido del proveedor (PDF) como inventario.
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Business, grossUp } from "../src/business.ts";
import { extractPdfText, pdfLines } from "../src/pdfText.ts";
import { applySupplierOrder, categoryOf, flavorCode, planSupplierOrder, priceCalc, readSupplierOrderPdf, realCosts, sizeOf } from "../src/supplierOrder.ts";
const { sampleOrder } = createRequire(import.meta.url)("./fixtures/orderPdf.cjs");

function shop() {
  const sql = new DatabaseSync(":memory:");
  const b = new Business({
    execSync: (s: string) => sql.exec(s),
    runSync: (s: string, ...p: any[]) => sql.prepare(s).run(...p),
    getAllSync: (s: string, ...p: any[]) => sql.prepare(s).all(...p) as any,
    getFirstSync: (s: string, ...p: any[]) => sql.prepare(s).get(...p) as any,
    withTransactionSync: (f: () => void) => {
      sql.exec("BEGIN");
      try {
        f();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  } as any);
  const bank = b.addAccount("Banco", "Banco", 1000000);
  const crea = b.quickProduct({ sku: "NS-CRE-003", name: "Creatine · GAT Sport · 1 kg", category: "Creatina", brand: "GAT Sport", flavor: "Sin Sabor", presentation: "1 kg", price: 64000, qty: 1, cost: 48000 });
  const gold = b.quickProduct({ sku: "NS-PRE-005", name: "Psychotic Gold · Insane Labz · Por confirmar", category: "Preentreno", brand: "Insane Labz", flavor: "Fruit Punch", presentation: "Por confirmar", price: 45000 });
  b.quickProduct({ sku: "NS-PRE-010", name: "Joker · Terror Labz · 30 Servicios", category: "Preentreno", brand: "Terror Labz", flavor: "Blood Orange", price: 50000 });
  return { b, bank, crea, gold };
}

test("PDF: texto con posición (Identity-H, ToUnicode, Flate, cm invertida) y pedido completo", () => {
  const bytes = sampleOrder();
  const lines = pdfLines(extractPdfText(bytes));
  assert(lines.some((l) => l.page === 2 && l.text === "Psychotic Gold 200 Gr"));
  const order = readSupplierOrderPdf(bytes);
  assert.equal(order.number, "0700001");
  assert.equal(order.supplier, "Suplementos GYM");
  assert.equal(order.status, "Pendiente de Pago");
  assert.deepEqual([order.subtotal, order.discount, order.shipping, order.total], [302638, 15132, 12700, 300206]);
  assert.deepEqual(order.warnings, []);
  assert.deepEqual(
    order.lines.map((l) => [l.brand, l.name, l.flavor, l.price, l.qty]),
    [
      ["GAT Sport", "Creatine 1 Kg", "", 52334, 3],
      ["Insane Labz", "Psychotic Black 60 Servings", "Grape", 41328, 2],
      ["Insane Labz", "Psychotic Black 60 Servings", "Fruit Punch", 41328, 1],
      ["Insane Labz", "Psychotic Gold 200 Gr", "Fruit Punch", 21652, 1],
    ],
  );
  // Costo real: el mismo factor (Total / Sub-total) para todas las piezas.
  const costs = realCosts(order);
  assert.deepEqual(costs, [51913, 40996, 40996, 21478]);
  const paid = order.lines.reduce((n, l, i) => n + l.qty * costs[i], 0);
  assert(Math.abs(paid - order.total) <= order.lines.length, `${paid} vs ${order.total}`);
});

test("homologar: tamaños, categorías y códigos de sabor", () => {
  assert.equal(sizeOf("Creatine 1 Kg")!.key, sizeOf("1000 g")!.key);
  assert.notEqual(sizeOf("300 g")!.key, sizeOf("1 kg")!.key);
  assert.equal(sizeOf("Psychotic Black 60 Servings")!.show, "60 Servicios");
  assert.equal(categoryOf({ brand: "Dragon Pharma", name: "Creamy Rice Cereal 25 Servings" }).prefix, "CHO");
  assert.equal(categoryOf({ brand: "Insane Labz", name: "Psychotic SAW 30 Servings" }).category, "Preentreno");
  assert.equal(flavorCode("Blue Raspberry"), "BLURAS");
  assert.equal(flavorCode("Strawberries & Cream"), "STRCRE");
});

test("calculadora: % sobre el costo + comisión de la terminal, redondeado al peso", () => {
  // $100 + 30% = $130; con la comisión (4.06%) el cliente paga $135.50 y se redondea a $136.
  assert.equal(grossUp(13000), 13550);
  const c = priceCalc(10000, 30, 406);
  assert.deepEqual([c.target, c.client, c.fee, c.net, c.profit], [13000, 13600, 552, 13048, 3048]);
  assert.equal(c.realPct.toFixed(1), "30.5");
  // Precio escrito a mano.
  const m = priceCalc(10000, 30, 406, 12000);
  assert.deepEqual([m.client, m.fee, m.profit], [12000, 487, 1513]);
});

test("plan: lo que existe suma piezas, lo nuevo se homologa y los sabores quedan agrupados", () => {
  const { b, crea, gold } = shop();
  const plan = planSupplierOrder(b, readSupplierOrderPdf(sampleOrder()));
  const [c, grape, punch, gfp] = plan.items;
  assert.equal(c.productId, crea);
  assert(c.sure);
  assert.equal(grape.productId, null);
  assert.equal(grape.newSku, "NS-PRE-011-GRA");
  assert.equal(punch.newSku, "NS-PRE-011-FRUPUN");
  assert.equal(grape.newName, "Psychotic Black · Insane Labz · 60 Servicios · Grape");
  assert.equal(grape.family, punch.family);
  // Psychotic Gold con presentación «por confirmar»: se propone, pero lo decide el dueño.
  assert.equal(gfp.productId, null);
  assert.equal(gfp.candidates[0].id, gold);
  assert.equal(gfp.candidates[0].sure, false);
  assert.equal(plan.groups.length, 3);
  assert.equal(plan.groups[0].currentClient, grossUp(64000));
  // El dueño confirma que sí es el mismo producto.
  const plan2 = planSupplierOrder(b, plan.order, { [gfp.key]: gold });
  assert.equal(plan2.items[3].productId, gold);
  assert.equal(plan2.groups[2].currentClient, grossUp(45000));
});

test("aplicar: piezas, costos, precios, sabores, pago, sin duplicar y margen proyectado", () => {
  const { b, bank, crea, gold } = shop();
  const order = readSupplierOrderPdf(sampleOrder());
  let plan = planSupplierOrder(b, order);
  plan = planSupplierOrder(b, order, { [plan.items[3].key]: gold });
  const [g0, g1, g2] = plan.groups;
  const black = priceCalc(g1.cost, 35, b.feeBps());
  const r = applySupplierOrder(
    b,
    plan,
    {
      [g0.family]: { client: 0, keepCurrent: true },
      [g1.family]: { client: black.client, keepCurrent: false },
      [g2.family]: { client: 49900, keepCurrent: false },
    },
    bank,
  );
  assert.deepEqual(r, { created: 2, restocked: 2, units: 7, repriced: 1, paid: 300206 });
  const st = b.stock();
  const c = st.find((p) => p.id === crea)!;
  assert.equal(c.stock, 4);
  assert.equal(c.price, 64000, "se conservó el precio actual");
  assert.equal(c.referenceCost, 51913);
  const variants = st.filter((p) => p.family === plan.items[1].family);
  assert.deepEqual(variants.map((p) => [p.sku, p.flavor, p.stock]).sort(), [
    ["NS-PRE-011-FRUPUN", "Fruit Punch", 1],
    ["NS-PRE-011-GRA", "Grape", 2],
  ]);
  assert.equal(variants[0].familyName, "Psychotic Black · Insane Labz · 60 Servicios");
  // Precio al cliente $X con la comisión al cobrar: en el catálogo se guarda sin comisión.
  assert.equal(grossUp(variants[0].price) <= black.client, true);
  assert.equal(st.find((p) => p.id === gold)!.price, b.feeInPrice() ? 49900 : st.find((p) => p.id === gold)!.price);
  assert.equal(st.find((p) => p.id === gold)!.presentation, "200 g");
  // Lotes con costo real y movimiento de compra; un solo pago por el total.
  assert.equal(b.one("SELECT COUNT(*) n FROM stock_moves WHERE kind='purchase' AND ref='pedido:0700001'").n, 4);
  assert.equal(b.one("SELECT SUM(amount) n FROM ledger WHERE kind='purchase' AND ref='pedido:0700001'").n, -300206);
  assert.equal(b.balance(bank), 1000000 - 300206);
  // El mismo pedido se detecta como ya cargado y lo nuevo ya se reconoce solo.
  const again = planSupplierOrder(b, order);
  assert(again.duplicate);
  assert(again.items.every((i) => i.productId && i.sure));
  // Margen y proyección (solo dueño).
  const proj = b.marginProjection();
  const row = proj.rows.find((x) => x.id === crea)!;
  assert.equal(row.units, 4);
  assert.equal(row.client, grossUp(64000));
  assert.equal(row.profit, row.client - row.fee - row.cost);
  assert.equal(proj.totals.profit, proj.rows.reduce((n, x) => n + x.units * x.profit, 0));
});

test("aplicar: sin saldo en la cuenta no se carga nada", () => {
  const { b } = shop();
  const poor = b.addAccount("Caja chica", "Efectivo", 1000);
  const plan = planSupplierOrder(b, readSupplierOrderPdf(sampleOrder()));
  const before = b.stock().reduce((n, p) => n + p.stock, 0);
  assert.throws(() => applySupplierOrder(b, plan, {}, poor), /tiene \$10\.00 y el pedido es de \$3,002\.06/);
  assert.equal(b.stock().reduce((n, p) => n + p.stock, 0), before);
  assert.equal(b.stock().length, 3);
});

test("candidatos: otro tamaño u otro sabor no es el mismo producto", () => {
  const { b } = shop();
  const line = { brand: "GAT Sport", name: "Creatine 300 g", flavor: "", price: 1, qty: 1, subtotal: 1 };
  const plan = planSupplierOrder(b, { supplier: "x", number: "", date: "", status: "", lines: [line], subtotal: 1, shipping: 0, discount: 0, total: 1, declaredUnits: 1, warnings: [] });
  assert.equal(plan.items[0].productId, null);
  assert.equal(plan.items[0].candidates.length, 0);
  const grape = { brand: "Insane Labz", name: "Psychotic Gold 30 Servings", flavor: "Grape", price: 1, qty: 1, subtotal: 1 };
  assert.equal(planSupplierOrder(b, { ...plan.order, lines: [grape] }).items[0].candidates.length, 0, "otro sabor");
});

// Prueba opcional con un PDF real: NOVA_ORDER_PDF=/ruta/pedido.pdf npm run test:order
test("PDF real (opcional)", { skip: !process.env.NOVA_ORDER_PDF || !existsSync(process.env.NOVA_ORDER_PDF) }, () => {
  const order = readSupplierOrderPdf(new Uint8Array(readFileSync(process.env.NOVA_ORDER_PDF!)));
  assert.deepEqual(order.warnings, []);
  assert.equal(order.lines.reduce((n, l) => n + l.qty, 0), order.declaredUnits);
});
