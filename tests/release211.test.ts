// 2.11 · Comprobante de venta en PDF, corte de 6:30 PM a 6:30 PM, semanas del mes y
// formas de pago (Billetera se muestra como Transferencia).
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Business } from "../src/business.ts";
import { cardKind, longDate, paymentLines, receiverLabel, salePdf, salePdfInfo } from "../src/salePdf.ts";
import { corteRange, hourLabel, monthWeeks } from "../src/screens/ownerShared.ts";

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
  const cash = b.addAccount("Efectivo", "Efectivo", 0);
  const card = b.addAccount("Terminal", "Tarjeta", 0);
  const mp = b.addAccount("Mercado Pago", "Billetera", 0);
  const p = b.addProduct("A-1", "Proteína", "Proteínas", 50000, 1);
  const q = b.addProduct("B-1", "Creatina", "Creatinas", 30000, 1);
  b.receive(p, "L1", "2030-01-01", 10, 20000, null);
  b.receive(q, "L2", "2030-01-01", 10, 15000, null);
  return { b, cash, card, mp, p, q };
}
const opts = (b: Business, transferAccounts: any[] = []) => ({
  store: "GGG · Nova Supps",
  accounts: b.all("SELECT id,name,kind FROM accounts"),
  products: new Map(b.stock().map((x: any) => [x.id, x])),
  transferAccounts,
});

test("PDF de venta en efectivo: productos, pagó con y cambio", () => {
  const { b, cash, p, q } = fresh();
  const id = b.sell([{ productId: p, qty: 1 }, { productId: q, qty: 2 }], 110000, 110000, cash, null, null, "WhatsApp");
  b.setSetting("sale:" + id, { ...b.setting("sale:" + id, {}), cashGiven: 120000, seller: "Ana" });
  const info = salePdfInfo(b.saleDetail(id), opts(b));
  assert.equal(info.lines.length, 2);
  assert.deepEqual(info.lines.map((l) => [l.name, l.qty, l.total]), [["Proteína", 1, 50000], ["Creatina", 2, 60000]]);
  assert.equal(info.seller, "Ana");
  assert.equal(info.channel, "WhatsApp");
  assert.equal(info.customer, "Público en general");
  const rows = Object.fromEntries(paymentLines(info.payments[0]));
  assert.equal(rows["Forma de pago"], "Efectivo");
  assert.equal(rows["Pagó con"], "$1,200.00");
  assert.equal(rows["Cambio entregado"], "$100.00");
  const bytes = salePdf(info);
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), "%PDF-");
  // Pago exacto
  b.setSetting("sale:" + id, { ...b.setting("sale:" + id, {}), cashGiven: null });
  const exact = Object.fromEntries(paymentLines(salePdfInfo(b.saleDetail(id), opts(b)).payments[0]));
  assert.match(exact["Pagó con"], /exacto/);
  assert.match(exact["Cambio"], /pago exacto/);
});

test("PDF de venta con tarjeta y con transferencia", () => {
  const { b, card, mp, p } = fresh();
  const id = b.sell([{ productId: p, qty: 1 }], 52030, 52030, card, null, null, "Mostrador", false, null, { amount: 2030, bps: 406 });
  b.setSetting("sale:" + id, { ...b.setting("sale:" + id, {}), cardManual: { last4: "4242", type: "Crédito", operation: "998877" } });
  const info = salePdfInfo(b.saleDetail(id), opts(b));
  assert.equal(info.commission, 2030);
  const rows = Object.fromEntries(paymentLines(info.payments[0]));
  assert.equal(rows["Tarjeta"], "Tarjeta •••• 4242");
  assert.equal(rows["Tipo"], "Crédito");
  assert.equal(rows["No. de transacción"], "998877");
  // Terminal Mercado Pago: datos de la tarjeta del cobro.
  b.setSetting("sale:" + id, { ...b.setting("sale:" + id, {}), cardManual: null, mpOrderId: "ORD1", mpPayments: [{ card: { last4: "1111", brand: "debvisa", type: "debit_card", operation: "PAY55" } }] });
  const t = Object.fromEntries(paymentLines(salePdfInfo(b.saleDetail(id), opts(b)).payments[0]));
  assert.match(t["Forma de pago"], /débito · terminal Mercado Pago/);
  assert.equal(t["Tarjeta"], "Visa •••• 1111");
  assert.equal(t["No. de transacción"], "PAY55");
  assert.deepEqual(cardKind({ brand: "master", type: "credit_card" }), { brand: "Mastercard", type: "Crédito" });
  // Transferencia: cuenta, emisor y receptor.
  const id2 = b.sell([{ productId: p, qty: 1 }], 50000, 50000, mp, null, null, "Mostrador");
  b.setSetting("sale:" + id2, { ...b.setting("sale:" + id2, {}), transferFrom: "Juan Pérez · BBVA" });
  const list = [{ id: "mercadopago", label: "Mercado Pago", bank: "Mercado Pago", holder: "Gustavo R.", clabe: "722969010000001234", account: "", card: "", note: "", accountId: mp }];
  const tr = Object.fromEntries(paymentLines(salePdfInfo(b.saleDetail(id2), opts(b, list)).payments[0]));
  assert.equal(tr["Forma de pago"], "Transferencia");
  assert.equal(tr["Emisor (quién paga)"], "Juan Pérez · BBVA");
  assert.equal(tr["Receptor"], "Mercado Pago · Gustavo R. · CLABE ••• 1234");
  assert.equal(receiverLabel("Otra", [], "x"), "Otra");
});

test("Fecha larga del comprobante", () => {
  assert.equal(longDate(new Date(2026, 10, 11, 9, 5)), "Miércoles 11 de noviembre de 2026 · 09:05 h");
});

test("Corte de 6:30 PM a 6:30 PM", () => {
  const r = corteRange("2026-11-11", "18:30");
  assert.equal(new Date(r.from).getTime(), new Date(2026, 10, 10, 18, 30).getTime());
  assert.equal(new Date(r.to).getTime(), new Date(2026, 10, 11, 18, 30).getTime());
  assert.equal(hourLabel("18:30"), "6:30 PM");
  assert.equal(hourLabel("09:00"), "9:00 AM");
  // Una venta a las 7 PM entra al corte del día siguiente.
  const late = new Date(2026, 10, 11, 19, 0).toISOString();
  const next = corteRange("2026-11-12", "18:30");
  assert(late >= next.from && late < next.to);
});

test("Semanas del mes (lunes a domingo)", () => {
  const w = monthWeeks(new Date(2026, 10, 1), new Date(2026, 11, 1));
  assert.deepEqual(w.map((x) => x.label), ["1 nov", "2–8 nov", "9–15 nov", "16–22 nov", "23–29 nov", "30 nov"]);
  assert.equal(w[1].from.getDate(), 2);
  assert.equal(w[5].to.getMonth(), 11);
});

test("Formas de pago: Billetera se muestra como Transferencia y se suma con Banco", () => {
  const { b, mp, p } = fresh();
  const bank = b.addAccount("BBVA", "Banco", 0);
  b.sell([{ productId: p, qty: 1 }], 50000, 50000, mp, null, null, "Mostrador");
  b.sell([{ productId: p, qty: 1 }], 50000, 50000, bank, null, null, "Mostrador");
  const ps = b.periodSummary(null);
  assert.deepEqual(ps.byMethod.map((x: any) => [x.method, x.gross]), [["Transferencia", 100000]]);
});
