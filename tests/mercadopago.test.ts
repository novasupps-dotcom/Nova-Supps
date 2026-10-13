import { test } from "node:test";
import assert from "node:assert/strict";
import { MercadoPago, orderOutcome, outcomeText, mpAmount, MpError } from "../src/mercadopago.ts";
function fake(responses: any[]) {
  const calls: any[] = [];
  const fetcher = async (url: string, init: any) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    const r = responses.shift();
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  return { calls, fetcher };
}
test("crea la order Point con monto string de 2 decimales, terminal e idempotencia", async () => {
  const { calls, fetcher } = fake([{ status: 201, body: { id: "ORD1", status: "created", transactions: { payments: [{ id: "PAY1", status: "created" }] } } }]);
  const mp = new MercadoPago("APP_USR-x", fetcher as any);
  const o = await mp.createOrder({ terminalId: "NEWLAND_N950__X", amount: 48885, reference: "NOVA-abc" });
  assert.equal(o.id, "ORD1");
  const c = calls[0];
  assert.equal(c.url, "https://api.mercadopago.com/v1/orders");
  assert.equal(c.method, "POST");
  assert.equal(c.headers.Authorization, "Bearer APP_USR-x");
  assert.equal(c.headers["X-Idempotency-Key"], "NOVA-abc");
  assert.deepEqual(c.body.transactions, { payments: [{ amount: "488.85" }] });
  assert.equal(c.body.type, "point");
  assert.equal(c.body.config.point.terminal_id, "NEWLAND_N950__X");
  assert.equal(mpAmount(1000), "10.00");
});
test("estados: aprobado, cancelado en terminal, rechazado, vencido y por confirmar", () => {
  assert.equal(orderOutcome({ status: "processed", transactions: { payments: [{ status: "processed", status_detail: "accredited" }] } }), "approved");
  assert.equal(orderOutcome({ status: "at_terminal" }), "pending");
  assert.equal(orderOutcome({ status: "created" }), "pending");
  assert.equal(orderOutcome({ status: "canceled", transactions: { payments: [{ status: "canceled", status_detail: "canceled_on_terminal" }] } }), "canceled");
  assert.equal(orderOutcome({ status: "failed", transactions: { payments: [{ status: "failed", status_detail: "rejected_by_issuer" }] } }), "failed");
  assert.match(outcomeText({ status: "failed", transactions: { payments: [{ status: "failed", status_detail: "rejected_by_issuer" }] } }), /banco rechazó/);
  assert.equal(orderOutcome({ status: "expired" }), "expired");
  assert.equal(orderOutcome({ status: "action_required", transactions: { payments: [{ status: "action_required", status_detail: "check_on_terminal" }] } }), "check");
});
test("errores de Mercado Pago se explican en español", async () => {
  const { fetcher } = fake([{ status: 409, body: { errors: [{ code: "already_queued_order_for_terminal", message: "x" }] } }, { status: 401, body: {} }]);
  const mp = new MercadoPago("bad", fetcher as any);
  await assert.rejects(mp.createOrder({ terminalId: "T", amount: 100, reference: "r" }), (e: MpError) => /cobro en espera/.test(e.message));
  await assert.rejects(mp.me(), (e: MpError) => e.code === "unauthorized" && /no es válida/.test(e.message));
  const offline = new MercadoPago("t", (async () => { throw new Error("net"); }) as any);
  await assert.rejects(offline.getOrder("ORD"), /conexión/);
});
test("terminales y modo PDV", async () => {
  const { calls, fetcher } = fake([{ status: 200, body: { data: { terminals: [{ id: "PAX_A910__1", operating_mode: "STANDALONE" }] } } }, { status: 200, body: {} }]);
  const mp = new MercadoPago("t", fetcher as any);
  assert.equal((await mp.terminals())[0].id, "PAX_A910__1");
  await mp.setMode("PAX_A910__1", "PDV");
  assert.equal(calls[1].method, "PATCH");
  assert.deepEqual(calls[1].body, { terminals: [{ id: "PAX_A910__1", operating_mode: "PDV" }] });
});
import { paymentFee, orderPayment } from "../src/mercadopago.ts";
test("comisión real y devolución parcial", async () => {
  assert.equal(paymentFee({ fee_details: [{ type: "mercadopago_fee", amount: 37.31, fee_payer: "collector" }] }), 3731);
  assert.equal(paymentFee({ transaction_amount: 919, transaction_details: { net_received_amount: 881.69 } }), 3731);
  assert.equal(paymentFee({}), null);
  assert.deepEqual(orderPayment({ transactions: { payments: [{ id: "PAY1", reference_id: "123", amount: "10.00" }] } }), { id: "PAY1", referenceId: "123", amount: 1000 });
  const calls: any[] = [];
  const mp = new MercadoPago("APP_USR-x", async (url: string, init: any) => {
    calls.push({ url, init });
    return { ok: true, status: 201, json: async () => ({}) };
  });
  await mp.refundOrder("ORD1", { paymentId: "PAY1", amount: 2450 });
  assert.equal(JSON.parse(calls[0].init.body).transactions[0].amount, "24.50");
  await mp.refundOrder("ORD1");
  assert.equal(calls[1].init.body, undefined);
});
