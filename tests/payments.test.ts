import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Business } from "../src/business.ts";
import { paymentRows } from "../src/payments.ts";

test("tabla de cobros: pagos, abonos y devoluciones por fecha real; excluye aportaciones y gastos", () => {
  const sql = new DatabaseSync(":memory:");
  const b = new Business({
    execSync: (s) => sql.exec(s),
    runSync: (s, ...p) => sql.prepare(s).run(...p),
    getAllSync: (s, ...p) => sql.prepare(s).all(...p) as any,
    getFirstSync: (s, ...p) => sql.prepare(s).get(...p) as any,
    withTransactionSync: (f) => {
      sql.exec("BEGIN");
      try {
        f();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  });
  const cash = b.addAccount("Caja", "Efectivo", 0),
    bank = b.addAccount("Banco", "Banco", 0);
  b.run(
    "insert into sales values('sale-table','2026-10-12T12:00:00Z',null,null,'Mostrador',20000,0,'confirmed')",
  );
  b.setSetting("sale:sale-table", { folio: "VNS-TEST" });
  for (const [id, amount, kind, note, account, day] of [
    ["initial", 10000, "sale", "Cobro de venta", cash, "12"],
    ["payment", 10000, "sale", "Abono", bank, "13"],
    ["refund", -2500, "refund", "Devolución", bank, "14"],
    ["fee", -406, "expense", "Comisión tarjeta", bank, "14"],
    ["capital", 1000, "capital", "Aportación", cash, "14"],
  ] as const)
    b.run(
      "insert into ledger values(?,?,?,?,?,?,?,null)",
      id,
      "2026-10-" + day + "T12:00:00Z",
      account,
      amount,
      kind,
      "sale-table",
      note,
    );
  const rows = paymentRows(b);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["refund", "payment", "initial"],
  );
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["Devolución", "Abono", "Cobro"],
  );
  assert.equal(rows[1].method, "Transferencia");
  assert.ok(rows[1].created.startsWith("2026-10-13"));
  assert.ok(rows.every((r) => r.folio === "VNS-TEST"));
  assert.equal(
    rows.reduce((s, r) => s + r.amount, 0),
    17500,
  );
  sql.close();
});
