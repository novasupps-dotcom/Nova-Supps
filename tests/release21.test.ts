// 2.1 · Promociones (motor y venta), autorización por promoción y SHA-256.
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Business, promoDiscounts, promoLineDiscount, promoLive, promoSummary, promoTagFor, saleSegment, type Promo } from "../src/business.ts";
import { sha256Hex } from "../src/sha256.ts";

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
function fresh() {
  const b = new Business(db());
  const cash = b.addAccount("Caja", "Efectivo", 100000);
  const p = b.addProduct("A-1", "Proteína", "Prot", 50000, 1);
  const q = b.addProduct("B-1", "Creatina", "Crea", 30000, 1);
  b.receive(p, "L1", "2030-01-01", 10, 20000, null);
  b.receive(q, "L2", "2030-01-01", 10, 20000, null);
  return { b, cash, p, q };
}
const promo = (x: Partial<Promo>): Promo => ({ id: "x", name: "P", active: true, kind: "nxm", target: "all", n: 2, m: 1, ...x }) as Promo;
const line = (qty: number, price = 1000, productId = "a", segment = "Creatinas") => ({ productId, segment, qty, price });

test("motor de promociones: N×M, volumen, % y vigencia", () => {
  assert.equal(promoLineDiscount(promo({}), line(1), "2026-10-15"), 0, "2x1 con una pieza no descuenta");
  assert.equal(promoLineDiscount(promo({}), line(2), "2026-10-15"), 1000);
  assert.equal(promoLineDiscount(promo({}), line(5), "2026-10-15"), 2000, "5 piezas en 2x1: paga 3");
  assert.equal(promoLineDiscount(promo({ n: 3, m: 2 }), line(7), "2026-10-15"), 2000, "3x2 con 7: dos gratis");
  assert.equal(promoLineDiscount(promo({ kind: "percent", percent: 15 }), line(3), "2026-10-15"), 450);
  assert.equal(promoLineDiscount(promo({ kind: "volume", percent: 10, minQty: 3 }), line(2), "2026-10-15"), 0);
  assert.equal(promoLineDiscount(promo({ kind: "volume", percent: 10, minQty: 3 }), line(3), "2026-10-15"), 300);
  assert.equal(promoLineDiscount(promo({ active: false }), line(2), "2026-10-15"), 0, "apagada");
  assert.equal(promoLineDiscount(promo({ from: "2026-10-16" }), line(2), "2026-10-15"), 0, "aún no empieza");
  assert.equal(promoLineDiscount(promo({ to: "2026-10-14" }), line(2), "2026-10-15"), 0, "ya terminó");
  assert.equal(promoLineDiscount(promo({ from: "2026-10-15", to: "2026-10-15" }), line(2), "2026-10-15"), 1000, "vigencia inclusiva");
  assert.equal(promoLineDiscount(promo({ target: "segment", ref: "PWO" }), line(2), "2026-10-15"), 0, "otra categoría");
  assert.equal(promoLineDiscount(promo({ target: "product", ref: "b" }), line(2), "2026-10-15"), 0, "otro producto");
  assert.equal(promoLive(promo({ to: "2026-01-01" }), "2026-10-15"), false);
});

test("no se acumulan: gana la que más descuenta por renglón", () => {
  const list = [promo({ id: "a", name: "2x1" }), promo({ id: "b", name: "−30%", kind: "percent", percent: 30 })];
  const r = promoDiscounts([line(2, 1000, "a"), line(1, 1000, "b")], list, "2026-10-15");
  assert.deepEqual(r.hits.map((h) => [h.productId, h.name, h.amount]), [["a", "2x1", 1000], ["b", "−30%", 300]]);
  assert.equal(r.total, 1300);
  assert.deepEqual(promoSummary([...r.hits, { productId: "c", amount: 500, promoId: "a", name: "2x1" }]), [{ name: "2x1", amount: 1500 }, { name: "−30%", amount: 300 }]);
  assert.equal(promoTagFor([promo({ id: "s", target: "segment", ref: "Creatinas" }), promo({ id: "p", target: "product", ref: "a", kind: "percent", percent: 10 })], "a", "Creatinas", "2026-10-15"), "−10%", "la del producto manda en la etiqueta");
});

test("savePromo valida y guarda; deletePromo la quita", () => {
  const { b, q } = fresh();
  assert.throws(() => b.savePromo({ name: "", kind: "nxm", n: 2, m: 1 }));
  assert.throws(() => b.savePromo({ name: "Mal", kind: "nxm", n: 2, m: 2 }), /M menor que N/);
  assert.throws(() => b.savePromo({ name: "Mal", kind: "percent", percent: 95 }), /entre 1 y 90/);
  assert.throws(() => b.savePromo({ name: "Mal", kind: "volume", percent: 10, minQty: 1 }), /2 o más/);
  assert.throws(() => b.savePromo({ name: "Mal", kind: "percent", percent: 10, target: "segment" }), /categoría/);
  assert.throws(() => b.savePromo({ name: "Mal", kind: "percent", percent: 10, from: "2026-10-20", to: "2026-10-01" }), /fecha final/);
  assert.throws(() => b.savePromo({ name: "Mal", kind: "percent", percent: 10, from: "2026-02-30" }), /Fecha inválida/);
  assert.throws(() => b.savePromo({ name: "Mal", kind: "percent", percent: 10, to: "2026-13-01" }), /Fecha inválida/);
  const id = b.savePromo({ name: "2x1 Creatina", kind: "nxm", n: 2, m: 1, target: "product", ref: q });
  assert.equal(b.promos().length, 1);
  assert.deepEqual(b.promoFor([{ productId: q, qty: 2 }]).total, 30000);
  b.savePromo({ id, name: "2x1 Creatina", kind: "nxm", n: 2, m: 1, target: "product", ref: q, active: false });
  assert.equal(b.promos().length, 1, "editar no duplica");
  assert.equal(b.promoFor([{ productId: q, qty: 2 }]).total, 0, "apagada");
  b.deletePromo(id);
  assert.equal(b.promos().length, 0);
});

test("venta debajo del costo: se permite solo si la causa es tu promoción", () => {
  const { b, cash, q } = fresh();
  // Costo 20,000 por pieza, precio 30,000: 2x1 → cobra 30,000 por 2 (costo 40,000).
  b.savePromo({ name: "2x1", kind: "nxm", n: 2, m: 1, target: "product", ref: q });
  const promoOff = b.promoFor([{ productId: q, qty: 2 }]);
  assert.equal(promoOff.total, 30000);
  const lineInfo = { [q]: { discount: 30000 } };
  const id = b.sell([{ productId: q, qty: 2 }], 30000, 30000, cash, null, null, "Mostrador", false, null, null, lineInfo);
  const d = b.saleDetail(id);
  assert.equal(d.total, 30000);
  assert.equal(d.lines[0].discount, 30000);
  const audit = b.all("SELECT note FROM audit WHERE ref=?", id).map((r: any) => r.note).join(" ");
  assert.match(audit, /por promoción/);
  // Precio especial (sin promoción) debajo del costo: sigue pidiendo autorización.
  assert.throws(() => b.sell([{ productId: q, qty: 2 }], 30000, 30000, cash, null, null, "Mostrador"), /debajo del costo/);
  // Promoción + rebaja extra que deja aún más abajo: tampoco.
  assert.throws(() => b.sell([{ productId: q, qty: 2 }], 15000, 15000, cash, null, null, "Mostrador", false, null, null, { [q]: { discount: 20000 } }), /debajo del costo/);
  // Con tu autorización explícita, sí.
  assert.ok(b.sell([{ productId: q, qty: 2 }], 15000, 15000, cash, null, null, "Mostrador", true));
});

test("categoría de venta del producto (la usa la promoción por categoría)", () => {
  const { b, q } = fresh();
  const row = b.one("SELECT id,name,price,category FROM products WHERE id=?", q);
  assert.equal(typeof saleSegment(row), "string");
});

test("SHA-256 en JS puro igual que el de Node", () => {
  for (const n of [0, 1, 55, 56, 63, 64, 65, 1000, 100_000]) {
    const data = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 255);
    assert.equal(sha256Hex(data), createHash("sha256").update(data).digest("hex"), `largo ${n}`);
  }
});
