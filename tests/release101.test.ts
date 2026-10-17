import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Business, cardFee, feeLabel } from "../src/business.ts";
import { applyRelease08 } from "./fixtures/releaseUpdate.ts";
import { initialize } from "./fixtures/legacyImport.ts";
const seed = readFileSync(new URL("./fixtures/initialData.json", import.meta.url), "utf8");
const patch = JSON.parse(readFileSync(new URL("./fixtures/release08.json", import.meta.url), "utf8"));
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
  const card = b.addAccount("Point", "Tarjeta", 0);
  const bank = b.addAccount("Banco", "Banco", 0);
  const p = b.addProduct("A-1", "Proteína", "Prot", 50000, 1);
  const q = b.addProduct("B-1", "Creatina", "Crea", 30000, 1);
  b.receive(p, "L1", "2030-01-01", 10, 20000, null);
  b.receive(q, "L2", "2030-01-01", 10, 10000, null);
  const c = b.customer("Ana", "", "", "Cliente", "");
  return { b, cash, card, bank, p, q, c };
}
const imported = () => {
  const b = new Business(db());
  initialize(b,seed);
  applyRelease08(b, patch);
  return b;
};

test("comisión configurable: aplica a cobros nuevos y no cambia los anteriores", () => {
  const { b, card, p } = fresh();
  assert.equal(b.feeBps(), 406);
  const s1 = b.sell([{ productId: p, qty: 1 }], 50000, 50000, card, null, null, "Mostrador");
  assert.equal(b.saleDetail(s1).fees, 2030);
  b.setFeeBps(350);
  const s2 = b.sell([{ productId: p, qty: 1 }], 50000, 50000, card, null, null, "Mostrador");
  assert.equal(b.saleDetail(s2).fees, 1750);
  assert.equal(b.saleDetail(s1).fees, 2030, "la venta anterior conserva su comisión");
  assert.match(b.lastFeeEntry(s2)!.note, /3\.5%/);
  assert.throws(() => b.setFeeBps(2500));
  assert.throws(() => b.setFeeBps(4.5));
  assert.equal(feeLabel(406), "4.06%");
  assert.equal(feeLabel(350), "3.5%");
  assert.equal(cardFee(91900), 3731);
});

test("la importación ya no pisa la comisión configurada ni guarda copia interna", () => {
  const b = new Business(db());
  initialize(b,seed);
  b.setSetting("cardFeeBps", 380);
  applyRelease08(b, patch);
  assert.equal(b.feeBps(), 380);
  assert.equal(b.setting("beforeRelease08"), null);
  b.setSetting("beforeRelease08", "x".repeat(5000));
  assert.equal(b.cleanupLegacy(), true);
  assert.equal(b.setting("beforeRelease08"), null);
  assert.equal(b.cleanupLegacy(), false);
});

test("comisión real de Mercado Pago sustituye la estimada", () => {
  const { b, card, p } = fresh();
  const s = b.sell([{ productId: p, qty: 1 }], 50000, 50000, card, null, null, "Mostrador");
  const fee = b.lastFeeEntry(s)!;
  b.setRealFee(fee.id, 2001);
  assert.equal(b.saleDetail(s).fees, 2001);
  assert.equal(b.periodSummary(null).fees, 2001);
  assert.match(b.lastFeeEntry(s)!.note, /real/);
});

test("mermas: los ajustes a la baja restan de la utilidad, no del dinero disponible", () => {
  const { b, cash, p } = fresh();
  b.sell([{ productId: p, qty: 1 }], 50000, 50000, cash, null, null, "Mostrador");
  const before = b.periodSummary(null);
  assert.equal(before.shrinkage, 0);
  b.adjustStock(p, 7, "Merma o caducado"); // 9 → 7: 2 × 200
  const r = b.periodSummary(null);
  assert.equal(r.shrinkage, 40000);
  assert.equal(r.profit, 50000 - 20000 - 40000);
  assert.equal(r.available, before.available, "la merma no mueve dinero");
  b.adjustStock(p, 8, "Conteo físico"); // apareció una
  assert.equal(b.periodSummary(null).shrinkage, 20000);
  assert.equal(b.metrics().shrinkage, 20000);
});

test("corte de caja separa ventas en efectivo de aportaciones y traspasos", () => {
  const { b, cash, bank, p } = fresh();
  const from = new Date(Date.now() - 60000).toISOString();
  b.sell([{ productId: p, qty: 1 }], 50000, 50000, cash, null, null, "Mostrador");
  b.movement("capital", cash, 30000, "Fondo de caja");
  b.movement("expense", cash, 5000, "Bolsas");
  b.movement("transfer", cash, 20000, "Depósito", null, bank);
  const to = new Date(Date.now() + 60000).toISOString();
  const r = b.cashSummary(from, to);
  assert.equal(r.sales, 50000);
  assert.equal(r.expenses, 5000);
  assert.equal(r.operating, 45000);
  assert.deepEqual(
    r.others.map((x: any) => [x.kind, x.amount]),
    [
      ["capital", 30000],
      ["transfer", -20000],
      ["opening", 100000],
    ],
  );
  assert.equal(r.closing - r.opening, 100000 + 45000 + 10000);
});

test("devolución parcial: regresa unidades a su lote, ajusta total, costo y devuelve dinero", () => {
  const { b, cash, p, q } = fresh();
  const s = b.sell([{ productId: p, qty: 3 }, { productId: q, qty: 1 }], 180000, 180000, cash, null, null, "Mostrador");
  const balance0 = b.balance(cash);
  // Regresan 1 proteína: 3 → 2, total 180000 → 130000
  const r = b.reviseSale(s, [{ productId: p, qty: 2 }, { productId: q, qty: 1 }], 130000, { refundAccountId: cash });
  assert.equal(r.refund, 50000);
  assert.equal(r.returned, 1);
  const d = b.saleDetail(s);
  assert.equal(d.total, 130000);
  assert.equal(d.cost, 2 * 20000 + 10000);
  assert.equal(d.paid, 130000);
  assert.equal(b.balance(cash), balance0 - 50000);
  assert.equal(b.stock().find((x) => x.id === p)!.stock, 8);
  assert.equal(d.lines.reduce((n: number, l: any) => n + l.total, 0), 130000);
  // Sin devolver lo suficiente no procede
  assert.throws(() => b.reviseSale(s, [{ productId: p, qty: 1 }, { productId: q, qty: 1 }], 80000, { refund: 0 }), /devuelve al menos/);
  // Quitar un producto completo y agregar otro
  assert.throws(() => b.reviseSale(s, [{ productId: p, qty: 3 }], 150000, {}), /saldo pendiente/);
  b.reviseSale(s, [{ productId: p, qty: 3 }], 130000, {});
  const d2 = b.saleDetail(s);
  assert.equal(d2.lines.length, 1);
  assert.equal(b.stock().find((x) => x.id === q)!.stock, 10);
  // Exportar y restaurar sigue pasando todas las validaciones
  const raw = b.backup();
  const b2 = new Business(db());
  b2.restore(raw);
  assert.equal(b2.saleDetail(s).total, 130000);
  // Cancelar y eliminar después de modificar
  b.cancel(s);
  b.deleteCancelledSale(s);
  assert.equal(b.stock().find((x) => x.id === p)!.stock, 10);
  assert.equal(b.balance(cash), 100000);
});

test("modificar venta a crédito: el nuevo saldo queda por cobrar", () => {
  const { b, cash, p, c } = fresh();
  const s = b.sell([{ productId: p, qty: 1 }], 50000, 20000, cash, c, null, "Mostrador");
  const r = b.reviseSale(s, [{ productId: p, qty: 2 }], 100000);
  assert.equal(r.balance, 80000);
  assert.equal(b.sales().find((x) => x.id === s)!.paid, 20000);
  assert.throws(() => b.reviseSale(s, [{ productId: p, qty: 50 }], 100000), /insuficientes/);
  assert.equal(b.saleDetail(s).total, 100000, "el intento fallido no dejó cambios");
});

test("dryRun valida sin guardar", () => {
  const { b, cash, p } = fresh();
  const s = b.sell([{ productId: p, qty: 2 }], 100000, 100000, cash, null, null, "Mostrador");
  b.dryRun(() => b.reviseSale(s, [{ productId: p, qty: 1 }], 50000, { refundAccountId: cash }));
  assert.equal(b.saleDetail(s).total, 100000);
  assert.equal(b.stock().find((x) => x.id === p)!.stock, 8);
});

test("consultas agregadas devuelven lo mismo que antes", () => {
  const b = imported();
  const sales = b.sales();
  for (const s of sales) assert.equal(s.paid, b.one("SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE ref=? AND kind='sale'", s.id).n);
  const p = b.stock().find((x) => x.available > 0)!;
  const cash = b.accounts().find((a) => a.kind === "Efectivo")!.id;
  const before = b.stock().find((x) => x.id === p.id)!.available;
  b.sell([{ productId: p.id, qty: 1 }], p.price, p.price, cash, null, null, "Instagram", true);
  assert.equal(b.stock().find((x) => x.id === p.id)!.available, before - 1);
  assert.equal(b.sales()[0].paid, p.price);
});
