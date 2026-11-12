// 2.11.3 · Actualizar existencias desde el Excel del conteo (Unidades físicas).
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Business } from "../src/business.ts";
import { readCatalogFile } from "../src/catalogImport.ts";
import { buildXlsx } from "../src/xlsx.ts";
import { applyStockImport, fileDate, planStockImport } from "../src/stockImport.ts";

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
const NAME = "Stock_Nova_2026-11-11_1139.xlsx";
// Mismo formato que el Excel del conteo del dueño (hoja «Stock Físico»), con datos de prueba
// (el repositorio es público: no se guardan sus costos reales).
const HEAD = ["SKU", "Producto", "Marca", "Categoría", "Segmento", "Físicas", "Disponibles", "Mínimo", "Estado", "Precio de Compra", "Precio de Venta ", "Costo Total Mercancia ", "Costo Total Venta ", "Utilidad potencial X Pieza", "Margen"];
const row = (sku: string, name: string, fis: number, min: number) => [sku, name, "Marca", "Cat", "Cat", fis, fis, min, fis ? "OK" : "Sin stock", 100, 150, fis * 100, fis * 150, 50, 0.33];
const xlsx = buildXlsx([
  {
    name: "Stock Físico",
    columns: HEAD.map((header) => ({ header })),
    rows: [
      row("NS-AMI-001", "AMINOx · BSN · 30 servicios", 3, 1),
      row("NS-PRE-006", "Psychotic Gold muestra", 13, 1),
      row("NS-PRE-002", "Nitraflex · GAT Sport · 300 g", 0, 1),
      row("NS-AMI-004", "Hardcore BCAA · Mutant · 30 Servicios", 1, 0),
      row("NS-CRE-001", "Creatine · Dragon Pharma · 300 g", 3, 1),
      ...Array.from({ length: 45 }, (_, i) => row(`NS-OTRO-${i}`, `Otro ${i}`, 1, 1)),
      [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    ],
  },
  { name: "Pedido 1", columns: [{ header: "Nombre" }, { header: "Piezas" }], rows: [["X", 1]] },
]);
const table = readCatalogFile(xlsx);

test("lee el Excel del conteo: columna Físicas por SKU", () => {
  const b = new Business(db());
  const cash = b.addAccount("Caja", "Efectivo", 0);
  const ami = b.addProduct("NS-AMI-001", "AMINOx · BSN · 30 servicios", "Aminoácidos", 48885, 1);
  const muestra = b.addProduct("NS-PRE-006", "Psychotic Gold muestra", "PWO", 3023, 1);
  const nitra = b.addProduct("NS-PRE-002", "Nitraflex · GAT Sport · 300 g", "PWO", 47842, 1);
  const hard = b.addProduct("NS-AMI-004", "Hardcore BCAA · Mutant · 30 Servicios", "Aminoácidos", 33250, 1);
  b.receive(ami, "L1", "", 1, 30000, null); // la app dice 1, el conteo dice 3
  b.receive(muestra, "L2", "", 20, 1000, null); // la app dice 20, el conteo dice 13
  b.receive(nitra, "L3", "", 2, 30000, null); // la app dice 2, el conteo dice 0
  b.receive(hard, "L4", "", 1, 20000, null); // igual (1) pero mínimo 1 → 0
  const shrink = b.periodSummary(null).shrinkage;
  const plan = planStockImport(b, table);
  const by = (sku: string) => plan.rows.find((r) => r.sku === sku)!;
  assert.equal(by("NS-AMI-001").target, 3);
  assert.equal(by("NS-PRE-006").target, 13);
  assert.equal(by("NS-PRE-002").target, 0);
  assert.equal(plan.changes.length, 4, "3 existencias + 1 mínimo");
  assert(plan.missing.length > 40, "los demás SKU del archivo no existen en esta base de prueba");
  assert.equal(plan.errors.length, 0, JSON.stringify(plan.errors));
  const r = applyStockImport(b, plan);
  assert.deepEqual(r, { stock: 3, minimum: 1 });
  const stock = (id: string) => Number(b.stock().find((p: any) => p.id === id).stock);
  assert.equal(stock(ami), 3);
  assert.equal(stock(muestra), 13);
  assert.equal(stock(nitra), 0);
  assert.equal(Number(b.one("SELECT minimum FROM products WHERE id=?", hard).minimum), 0);
  assert.equal(b.periodSummary(null).shrinkage, shrink, "no cuenta como merma");
  assert.equal(b.one("SELECT price FROM products WHERE id=?", ami).price, 48885, "el precio no cambia");
  assert.equal(planStockImport(b, table).changes.length, 0, "aplicarlo otra vez no cambia nada");
  void cash;
});

test("descuenta lo vendido después de la hora del archivo", () => {
  const b = new Business(db());
  const cash = b.addAccount("Caja", "Efectivo", 0);
  const crea = b.addProduct("NS-CRE-001", "Creatine · Dragon Pharma · 300 g", "Creatinas", 43673, 1);
  b.receive(crea, "L1", "", 5, 20000, null);
  b.sell([{ productId: crea, qty: 1 }], 43673, 43673, cash, null, null, "Mostrador");
  const since = fileDate(NAME)!;
  assert.equal(new Date(since).getTime(), new Date(2026, 10, 11, 11, 39).getTime());
  // Venta hecha «ahora» (después del archivo): el conteo de 3 queda en 2.
  const plan = planStockImport(b, table, { since });
  const row = plan.rows.find((r) => r.sku === "NS-CRE-001")!;
  assert.equal(row.counted, 3);
  assert.equal(row.soldAfter, 1);
  assert.equal(row.target, 2);
  assert.equal(fileDate("otro.xlsx"), null);
});
