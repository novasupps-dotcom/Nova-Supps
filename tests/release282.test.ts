// 2.8.2 · % de la terminal que recalcula precios, Excel que reconoce lo que ya existe
// (por descripción), productos que no vienen en el archivo y repetidos en Stock.
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Business, baseOf, grossUp } from "../src/business.ts";
import { applyCatalogImport, planCatalogImport, readCsv } from "../src/catalogImport.ts";
import { duplicateGroups } from "../src/duplicates.ts";

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
  const cash = b.addAccount("Caja", "Efectivo", 100000);
  return { b, cash };
}
const consistent = (b: Business) =>
  assert.equal(b.all("SELECT l.id FROM lots l WHERE l.qty != COALESCE((SELECT SUM(qty) FROM stock_moves WHERE lotId=l.id),0)").length, 0, "lotes = movimientos");

test("cambiar el % con la comisión en el precio recalcula todos los precios (y vuelve igual)", () => {
  const { b } = shop();
  const a = b.quickProduct({ sku: "A-1", name: "Uno", price: 104200 });
  const c = b.quickProduct({ sku: "A-2", name: "Dos", price: 52345 });
  // Sin comisión en el precio: el % no toca precios.
  assert.equal(b.setFeeBps(450), 0);
  assert.equal(b.one("SELECT price FROM products WHERE id=?", a).price, 104200);
  b.setFeeBps(406);
  b.setFeeInPrice(true, false);
  assert.equal(b.setFeeBps(450), 2);
  const pa = b.one("SELECT price FROM products WHERE id=?", a).price;
  const pc = b.one("SELECT price FROM products WHERE id=?", c).price;
  assert.equal(pa % 100, 0, "pesos cerrados se quedan cerrados");
  assert(pa >= grossUp(baseOf(104200, 406), 450) && pa < grossUp(baseOf(104200, 406), 450) + 100);
  assert.equal(pc, grossUp(baseOf(52345, 406), 450), "con centavos: exacto");
  // Lo que te queda casi no cambia.
  assert(Math.abs(baseOf(pc, 450) - baseOf(52345, 406)) <= 1);
  b.setFeeBps(406);
  assert.equal(b.one("SELECT price FROM products WHERE id=?", c).price, 52345);
});

function setup() {
  const { b, cash } = shop();
  const withPhoto = b.quickProduct({ sku: "NS-CRE-001", name: "Creatine · GAT Sport · 1 kg", category: "Creatina", brand: "GAT Sport", flavor: "Sin Sabor", presentation: "1 kg", price: 64000, qty: 4, cost: 40000, imageUri: "file:///fotos/p-1.jpg" });
  const noPhoto = b.quickProduct({ sku: "NS-PRO-002", name: "Iso 100 · Dymatize · 5 lb", category: "Proteína", brand: "Dymatize", flavor: "Chocolate", presentation: "5 lb", price: 199900, qty: 2, cost: 150000 });
  const other = b.quickProduct({ sku: "NS-BAR-003", name: "Barra · Quest · 60 g", category: "Barras", brand: "Quest", flavor: "Cookies", presentation: "60 g", price: 6000, qty: 10, cost: 3000 });
  const sold = b.quickProduct({ sku: "NS-OLD-004", name: "Viejo · Marca · 1 kg", category: "Otros", brand: "Marca", price: 10000, qty: 3, cost: 5000 });
  b.sell([{ productId: sold, qty: 1 }], 10000, 10000, cash, null, null, "Mostrador", true);
  return { b, withPhoto, noPhoto, other, sold };
}
const csv = (text: string) => readCsv(text);
const FILE =
  "Nombre,Marca,Sabor,Presentación,Precio,Existencias\n" +
  "Creatina Monohidratada,GAT Sport,,1 kg,700,9\n" +
  "Iso 100 Whey,Dymatize,Chocolate,5 lb,2100,3\n" +
  "Proteína Nueva,Otra Marca,Fresa,2 lb,900,5\n";

test("Excel sin SKU: reconoce lo que ya existe por descripción; con imagen reemplaza existencias, sin imagen suma piezas", () => {
  const { b, withPhoto, noPhoto, other, sold } = setup();
  const plan = planCatalogImport(b, csv(FILE), { addFee: false });
  const [cre, iso, nueva] = plan.rows;
  assert.equal(cre.productId, withPhoto);
  assert.equal(cre.match, "desc");
  assert.equal(cre.mode, "replace");
  assert.deepEqual(cre.changes.map((c) => [c.label, c.from, c.to]), [["Existencias", "4", "9"]]);
  assert.equal(iso.productId, noPhoto);
  assert.equal(iso.mode, "add");
  assert.deepEqual(iso.changes.map((c) => [c.label, c.to]), [["Piezas", "+3"]]);
  assert.equal(nueva.kind, "new");
  assert.equal(plan.counts.new, 1);
  assert.equal(plan.counts.update, 2);
  // Lo que no viene en el archivo.
  assert.deepEqual(plan.missing.map((m) => m.id).sort(), [other, sold].sort());
  assert.equal(plan.fee.priced, 1, "solo el nuevo trae precio que se use");

  const r = applyCatalogImport(b, planCatalogImport(b, csv(FILE), { addFee: false, remove: [other, sold] }));
  const stock = (id: string) => b.stock().find((p) => p.id === id);
  assert.equal(stock(withPhoto).stock, 9);
  assert.equal(stock(withPhoto).price, 64000, "sus datos no cambian");
  assert.equal(stock(withPhoto).name, "Creatine · GAT Sport · 1 kg");
  assert.equal(stock(noPhoto).stock, 5, "2 + 3");
  assert.equal(stock(noPhoto).price, 199900);
  assert.equal(r.created, 1);
  assert.equal(r.removed, 1);
  assert.equal(r.archived, 1, "con ventas se archiva");
  assert.equal(stock(other), undefined);
  assert.equal(stock(sold).archived, true);
  consistent(b);
});

test("desmarcar, «No es» y «¿Es tu…?»", () => {
  const { b, withPhoto, noPhoto } = setup();
  const off = planCatalogImport(b, csv(FILE), { addFee: false, off: [2] });
  assert.equal(off.rows[0].off, true);
  assert.equal(off.counts.update, 1);
  const notIt = planCatalogImport(b, csv(FILE), { addFee: false, links: { 3: null } });
  assert.equal(notIt.rows[1].kind, "new");
  assert.equal(notIt.rows[1].productId, undefined);
  // Nombre parecido sin marca: no se liga solo, se pregunta.
  const doubt = planCatalogImport(b, csv("Nombre,Presentación,Existencias\nIso 100,5 lb,1\n"), { addFee: false });
  assert.equal(doubt.rows[0].kind, "error", "sin precio no se puede dar de alta");
  assert.equal(doubt.rows[0].candidates?.[0].id, noPhoto);
  const linked = planCatalogImport(b, csv("Nombre,Presentación,Existencias\nIso 100,5 lb,1\n"), { addFee: false, links: { 2: noPhoto } });
  assert.equal(linked.rows[0].productId, noPhoto);
  assert.equal(linked.rows[0].linked, true);
  applyCatalogImport(b, off);
  assert.equal(b.stock().find((p) => p.id === withPhoto).stock, 4, "desmarcado: no se toca");
});

test("con SKU sigue igual que antes (actualiza precio y datos)", () => {
  const { b, withPhoto } = setup();
  const plan = planCatalogImport(b, csv("SKU,Precio\nNS-CRE-001,700\n"), { addFee: false });
  assert.equal(plan.rows[0].match, "code");
  assert.deepEqual(plan.rows[0].changes.map((c) => c.label), ["Precio"]);
  applyCatalogImport(b, plan);
  assert.equal(b.stock().find((p) => p.id === withPhoto).price, 70000);
});

test("repetidos en Stock: se detectan y se unifican sin contar como merma", () => {
  const { b, withPhoto } = setup();
  const twin = b.quickProduct({ sku: "DUP-1", name: "Creatine · GAT Sport · 1000 g", category: "Creatina", brand: "GAT Sport", presentation: "1000 g", price: 64000, qty: 6, cost: 41000, barcode: "7501234567893" });
  const groups = duplicateGroups(b);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].products.map((p) => p.id), [twin, withPhoto], "primero el de más piezas");
  const lossBefore = b.all("SELECT * FROM stock_moves WHERE kind='adjust'").length;
  const r = b.mergeProducts(withPhoto, [twin]);
  assert.deepEqual(r, { moved: 6, removed: 1 });
  const kept = b.stock().find((p) => p.id === withPhoto);
  assert.equal(kept.stock, 10);
  assert.equal(kept.barcode, "7501234567893", "el código pasa al que se queda");
  assert.equal(b.stock().find((p) => p.id === twin), undefined);
  assert.equal(b.all("SELECT * FROM stock_moves WHERE kind='adjust'").length, lossBefore);
  assert.equal(b.one("SELECT SUM(qty*cost) v FROM lots WHERE productId=?", withPhoto).v, 4 * 40000 + 6 * 41000, "conserva el costo");
  assert.equal(duplicateGroups(b).length, 0);
  consistent(b);
});
