// 2.8.4 · Corregir cantidad (inventario duplicado) sin contar como merma.
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Business } from "../src/business.ts";

function shop() {
  const sql = new DatabaseSync(":memory:");
  return new Business({
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
}

test("bajar la cantidad duplicada: quita primero lo más reciente y no es merma", () => {
  const b = shop();
  const p = b.quickProduct({ sku: "X-1", name: "Creatina", price: 50000, qty: 5, cost: 30000 });
  b.receive(p, "Carga de catálogo (otra vez)", "", 5, 32000, null);
  const shrink = b.periodSummary(null).shrinkage;
  const r = b.correctStock(p, 5);
  assert.deepEqual(r, { before: 10, after: 5 });
  const lots = b.all("SELECT label,qty,cost FROM lots WHERE productId=? ORDER BY rowid", p);
  assert.deepEqual(lots.map((l) => [l.qty, l.cost]), [[5, 30000], [0, 32000]], "se quitó el lote duplicado (el más reciente)");
  assert.equal(b.periodSummary(null).shrinkage, shrink, "no cuenta como merma");
  assert.equal(b.all("SELECT * FROM stock_moves WHERE kind='correction'").length, 1);
  assert.equal(b.all("SELECT l.id FROM lots l WHERE l.qty != COALESCE((SELECT SUM(qty) FROM stock_moves WHERE lotId=l.id),0)").length, 0);
  // Subir también se puede (sin merma); misma cantidad avisa.
  assert.equal(b.correctStock(p, 7).after, 7);
  assert.equal(b.stock().find((x) => x.id === p).stock, 7);
  assert.throws(() => b.correctStock(p, 7), /misma cantidad/);
  assert.equal(b.periodSummary(null).shrinkage, shrink);
});
