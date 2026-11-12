// 2.11.3/2.11.4 · El Excel del conteo reemplaza piezas (Físicas) y precio (Precio de Venta).
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Business } from "../src/business.ts";
import { readCatalogFile } from "../src/catalogImport.ts";
import { buildXlsx } from "../src/xlsx.ts";
import { applyStockImport, planStockImport } from "../src/stockImport.ts";

function db() {
  const sql = new DatabaseSync(":memory:");
  return {
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
  };
}
// Mismo formato que el Excel del conteo del dueño (hoja «Stock Físico»), con datos de prueba
// (el repositorio es público: no se guardan sus costos reales).
const HEAD = ["SKU", "Producto", "Marca", "Categoría", "Segmento", "Físicas", "Disponibles", "Mínimo", "Estado", "Precio de Compra", "Precio de Venta ", "Costo Total Mercancia ", "Costo Total Venta ", "Utilidad potencial X Pieza", "Margen"];
const row = (sku: string, name: string, fis: number, venta: number, compra = 100) => [sku, name, "Marca", "Cat", "Cat", fis, fis, 1, fis ? "OK" : "Sin stock", compra, venta, fis * compra, fis * venta, venta - compra, 0.33];
const xlsx = buildXlsx([
  {
    name: "Stock Físico",
    columns: HEAD.map((header) => ({ header })),
    rows: [
      row("NS-AMI-001", "AMINOx · BSN · 30 servicios", 3, 488.85, 322.08),
      row("NS-PRE-006", "Psychotic Gold muestra", 13, 30.23),
      row("NS-PRE-002", "Nitraflex · GAT Sport · 300 g", 0, 478.42),
      row("NS-AMI-004", "Hardcore BCAA · Mutant · 30 Servicios", 1, 332.5),
      row("NS-CRE-001", "Creatine · Dragon Pharma · 300 g", 3, 436.73),
      ...Array.from({ length: 45 }, (_, i) => row(`NS-OTRO-${i}`, `Otro ${i}`, 1, 100)),
      ["Total", null, null, null, null, 115, 115, null, null, null, null, 1, 2, 3, null],
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ],
  },
  { name: "Pedido 1", columns: [{ header: "Nombre" }, { header: "Piezas" }], rows: [["X", 1]] },
]);
const table = readCatalogFile(xlsx);

test("reemplaza piezas y precio de venta; no toca costos ni crea productos", () => {
  const b = new Business(db());
  b.addAccount("Caja", "Efectivo", 0);
  const ami = b.addProduct("NS-AMI-001", "AMINOx · BSN · 30 servicios", "Aminoácidos", 45000, 1);
  const muestra = b.addProduct("NS-PRE-006", "Psychotic Gold muestra", "PWO", 3023, 1);
  const nitra = b.addProduct("NS-PRE-002", "Nitraflex · GAT Sport · 300 g", "PWO", 47842, 1);
  const hard = b.addProduct("NS-AMI-004", "Hardcore BCAA · Mutant · 30 Servicios", "Aminoácidos", 33250, 1);
  const fuera = b.addProduct("NS-NO-EXCEL", "No viene en el Excel", "PWO", 10000, 1);
  b.receive(ami, "L1", "", 1, 30000, null); // la app dice 1, el conteo dice 3
  b.receive(ami, "L1b", "", 1, 30000, null); // (inventario cargado dos veces → 2)
  b.receive(muestra, "L2", "", 20, 1000, null); // 20 → 13
  b.receive(nitra, "L3", "", 2, 30000, null); // 2 → 0
  b.receive(hard, "L4", "", 1, 20000, null); // igual
  b.receive(fuera, "L5", "", 4, 5000, null);
  const productsBefore = b.stock().length;
  const shrink = b.periodSummary(null).shrinkage;
  const plan = planStockImport(b, table);
  const by = (sku: string) => plan.rows.find((r) => r.sku === sku)!;
  assert(!plan.rows.some((r) => r.sku === "TOTAL"), "el renglón Total se ignora");
  assert.equal(plan.rows.length, 50);
  assert.equal(plan.rows.reduce((n, r) => n + (r.counted || 0), 0), 65);
  assert.equal(by("NS-AMI-001").target, 3);
  assert.equal(by("NS-AMI-001").price, 48885, "Precio de Venta, no Precio de Compra");
  assert.equal(by("NS-PRE-006").target, 13);
  assert.equal(by("NS-PRE-002").target, 0);
  assert.deepEqual(
    plan.changes.map((r) => r.sku).sort(),
    ["NS-AMI-001", "NS-PRE-002", "NS-PRE-006"].sort(),
    "Hardcore y Nitraflex ya tienen el mismo precio; Hardcore las mismas piezas",
  );
  assert.equal(plan.errors.length, 0, JSON.stringify(plan.errors));
  const r = applyStockImport(b, plan);
  assert.deepEqual(r, { stock: 3, price: 1 });
  const p = (id: string) => b.stock().find((x: any) => x.id === id);
  assert.equal(Number(p(ami).stock), 3, "se reemplaza, no se suma");
  assert.equal(Number(p(muestra).stock), 13);
  assert.equal(Number(p(nitra).stock), 0);
  assert.equal(Number(p(hard).stock), 1);
  assert.equal(p(ami).price, 48885);
  assert.equal(p(muestra).price, 3023);
  assert.equal(Number(p(fuera).stock), 4, "lo que no viene en el Excel no se toca");
  assert.equal(p(fuera).price, 10000);
  assert.equal(b.stock().length, productsBefore, "no se crean productos");
  assert.equal(b.periodSummary(null).shrinkage, shrink, "no cuenta como merma");
  assert.deepEqual(
    b.all("SELECT DISTINCT cost FROM lots WHERE productId=? AND qty>0", ami).map((x: any) => x.cost),
    [30000],
    "el costo de compra no cambia",
  );
  assert.equal(planStockImport(b, table).changes.length, 0, "aplicarlo otra vez no cambia nada");
});

test("las piezas quedan exactamente como en el Excel aunque haya ventas después", () => {
  const b = new Business(db());
  const cash = b.addAccount("Caja", "Efectivo", 0);
  const crea = b.addProduct("NS-CRE-001", "Creatine · Dragon Pharma · 300 g", "Creatinas", 43673, 1);
  b.receive(crea, "L1", "", 5, 20000, null);
  b.sell([{ productId: crea, qty: 1 }], 43673, 43673, cash, null, null, "Mostrador");
  const plan = planStockImport(b, table);
  const r = plan.rows.find((x) => x.sku === "NS-CRE-001")!;
  assert.equal(r.current, 4);
  assert.equal(r.target, 3);
  applyStockImport(b, plan);
  assert.equal(Number(b.stock().find((x: any) => x.id === crea).stock), 3);
});

test("un producto repetido en el archivo es error y no se aplica dos veces", () => {
  const b = new Business(db());
  const a = b.addProduct("A-1", "Proteína", "Prot", 50000, 1);
  b.receive(a, "L1", "", 2, 20000, null);
  const dup = readCatalogFile(
    buildXlsx([{ name: "S", columns: [{ header: "SKU" }, { header: "Producto" }, { header: "Físicas" }, { header: "Precio" }], rows: [["A-1", "Proteína", 5, 600], ["", "Proteína", 7, 700]] }]),
  );
  const plan = planStockImport(b, dup);
  assert.equal(plan.errors.length, 1);
  assert.match(plan.errors[0].error!, /repetido/);
  applyStockImport(b, plan);
  assert.equal(Number(b.stock()[0].stock), 5);
  assert.equal(b.stock()[0].price, 60000);
});
