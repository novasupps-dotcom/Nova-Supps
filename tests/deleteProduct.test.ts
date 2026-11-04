// 2.8.1 · Eliminar productos desde Stock.
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Business } from "../src/business.ts";
import { publish } from "../src/sync.ts";

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

test("sin ventas: se borra por completo (lotes, movimientos, ficha y promociones); el dinero no cambia", () => {
  const { b, cash } = shop();
  const p = b.quickProduct({ sku: "X-1", name: "Producto de prueba", price: 10000, qty: 3, cost: 5000, brand: "Marca" });
  b.receive(p, "Compra", "", 2, 5000, cash);
  b.savePromo({ name: "2x1 prueba", kind: "nxm", target: "product", ref: p, n: 2, m: 1, active: true });
  b.setSetting("supplierMap:algo", p);
  const balance = b.balance(cash);
  const r = b.deleteProduct(p);
  assert.deepEqual(r, { mode: "deleted", name: "Producto de prueba" });
  assert.equal(b.all("SELECT * FROM products WHERE id=?", p).length, 0);
  assert.equal(b.all("SELECT * FROM lots WHERE productId=?", p).length, 0);
  assert.equal(b.setting("product:" + p, null), null);
  assert.equal(b.setting("supplierMap:algo", null), null);
  assert.equal(b.promos().length, 0);
  assert.equal(b.balance(cash), balance, "la compra pagada sigue registrada");
  assert.equal(b.one("SELECT COUNT(*) n FROM audit WHERE action='product.delete'").n, 1);
});

test("con ventas: se archiva y conserva el historial", () => {
  const { b, cash } = shop();
  const p = b.quickProduct({ sku: "X-2", name: "Vendido", price: 10000, qty: 2, cost: 5000 });
  b.sell([{ productId: p, qty: 1 }], 10000, 10000, cash, null, null, "Mostrador", true);
  assert.deepEqual(b.deleteProduct(p), { mode: "archived", name: "Vendido" });
  assert.equal(b.stock().find((x) => x.id === p)!.archived, true);
  assert.equal(b.sales().length, 1);
});

test("los productos eliminados también se quitan del catálogo en línea", async () => {
  const { b } = shop();
  const a = b.quickProduct({ sku: "A-1", name: "Queda", price: 1000 });
  const z = b.quickProduct({ sku: "Z-1", name: "Se va", price: 1000 });
  const removed: string[] = [];
  const rows = new Map<string, any>();
  const cloud: any = {
    cfg: { url: "https://demo.supabase.co" },
    select: async () => [],
    insert: async (table: string, list: any[]) => {
      if (table === "catalog") for (const r of list) rows.set(r.product_id, r);
      return [];
    },
    remove: async (table: string, filter: string) => {
      removed.push(table + "?" + filter);
      for (const id of [...rows.keys()]) if (filter.includes('"' + id + '"')) rows.delete(id);
    },
  };
  await publish(b, cloud, null);
  assert(rows.has(a) && rows.has(z));
  b.deleteProduct(z);
  await publish(b, cloud, null);
  assert.deepEqual(removed, [`catalog?product_id=in.("${z}")`]);
  assert(rows.has(a) && !rows.has(z));
  await publish(b, cloud, null);
  assert.equal(removed.length, 1, "no se vuelve a borrar");
});
