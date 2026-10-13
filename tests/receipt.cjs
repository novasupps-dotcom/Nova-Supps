// Comprobante de tarjeta: textos y datos de Mercado Pago.
const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
for(const extension of ['.ts','.tsx']) require.extensions[extension]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,file);
const { cardLabel, cardFromPayment, cardFromOrder, mergeCard, cardReceiptText, terminalPayments, validWhatsapp, whatsappNumber } = require("../src/receipt.ts");

  assert.equal(cardLabel({ brand: "debvisa", type: "debit_card", last4: "1111" }), "Visa débito •••• 1111");
  assert.equal(cardLabel({ brand: "master", type: "credit_card" }), "Mastercard crédito");
  assert.equal(cardLabel({}), "Tarjeta");
  const fromOrder = cardFromOrder({ transactions: { payments: [{ reference_id: "99", amount: "469.00", card: { last_digits: "4242" }, payment_method: { id: "visa", type: "credit_card", installments: 3 } }] } });
  const full = mergeCard(fromOrder, cardFromPayment({ id: 99, authorization_code: "A1", date_approved: "2026-10-03T12:41:00.000-06:00", transaction_amount: 469 }));
  assert.deepEqual([full.last4, full.authorization, full.installments, full.amount, full.operation], ["4242", "A1", 3, 46900, "99"]);
  const sale = { id: "abc12345678", folio: "", total: 46900, paid: 46900, customer: "Ana", created: "2026-10-03T18:41:00.000Z", lines: [{ qty: 1, name: "AMINOx", total: 46900 }], movements: [] };
  const text = cardReceiptText(sale, { orderId: "ORD1", kind: "venta", card: full });
  for (const s of ["Comprobante de pago con tarjeta", "Visa crédito •••• 4242", "3 meses", "Autorización: A1", "Operación Mercado Pago: 99", "1 × AMINOx", "Cliente: Ana"]) assert.ok(text.includes(s), s);
  const abono = cardReceiptText({ ...sale, paid: 20000 }, { orderId: "ORD2", kind: "abono", amount: 20000 });
  assert.ok(abono.includes("abono") && abono.includes("Saldo pendiente") && abono.includes("Orden Mercado Pago: ORD2"));
  assert.equal(terminalPayments({ mpOrderId: "O1", mpPaymentId: "P1", created: "x" })[0].kind, "venta");
  assert.equal(whatsappNumber("55 1234 5678"), "525512345678");
  assert.ok(validWhatsapp("5512345678") && !validWhatsapp("1234"));
console.log("Comprobantes: OK");
