import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Business, cents, today } from "../src/business.ts";
function setup() {
  const sqlite = new DatabaseSync(":memory:");
  const db = {
    execSync: (s: string) => {
      sqlite.exec(s);
    },
    runSync: (s: string, ...p: any[]) => sqlite.prepare(s).run(...p),
    getAllSync: (s: string, ...p: any[]) => sqlite.prepare(s).all(...p) as any,
    getFirstSync: (s: string, ...p: any[]) =>
      sqlite.prepare(s).get(...p) as any,
    withTransactionSync: (fn: () => void) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        fn();
        sqlite.exec("COMMIT");
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const b = new Business(db);
  const a = b.addAccount("Caja", "Efectivo", 100000);
  const p = b.addProduct("GAT-300", "Creatina 300 g", "Creatina", 36900, 2);
  b.receive(p, "A", "2030-01-01", 5, 20000, null);
  return { b, a, p };
}
test("centavos exactos y formatos inválidos", () => {
  assert.equal(cents("0.29"), 29);
  assert.equal(cents("369.00"), 36900);
  assert.equal(cents("1,000"), 100000);
  assert.equal(cents("$1,250.50"), 125050);
  assert.equal(cents(" 1250,5 "), 125050);
  for (const n of ["-2", "1.123", "NaN", "1e3", "1,00,0", ""])
    assert.throws(() => cents(n));
});
test("venta actualiza inventario, cobro, margen y caja juntos", () => {
  const { b, a, p } = setup();
  b.sell([{ productId: p, qty: 2 }], 73800, 73800, a, null, null, "Mostrador");
  assert.equal(b.stock()[0].stock, 3);
  assert.equal(b.balance(a), 173800);
  assert.equal(b.metrics().gross, 33800);
  assert.equal(b.metrics().receivable, 0);
});
test("sin stock no hay registros parciales ni cobros", () => {
  const { b, a, p } = setup();
  const before = b.backup();
  assert.throws(() =>
    b.sell(
      [{ productId: p, qty: 6 }],
      221400,
      221400,
      a,
      null,
      null,
      "Mostrador",
    ),
  );
  assert.equal(b.sales().length, 0);
  assert.equal(b.balance(a), 100000);
  assert.deepEqual(JSON.parse(b.backup()).data, JSON.parse(before).data);
});
test("FEFO bloquea caducados y conserva costo histórico", () => {
  const { b, a, p } = setup();
  b.receive(p, "CADUCADO", "2020-01-01", 100, 1, null);
  b.receive(p, "PRIMERO", today(), 1, 15000, null);
  b.sell([{ productId: p, qty: 2 }], 73800, 73800, a, null, null, "WhatsApp");
  assert.equal(b.metrics().cost, 35000);
  assert.equal(b.stock()[0].available, 4);
});
test("venta a crédito, abono y bloqueo de sobrecobro", () => {
  const { b, a, p } = setup();
  const c = b.customer("Cliente", "555", "", "Prospecto", "");
  const s = b.sell(
    [{ productId: p, qty: 1 }],
    36900,
    10000,
    a,
    c,
    null,
    "WhatsApp",
  );
  assert.equal(b.metrics().receivable, 26900);
  b.collect(s, a, 26900);
  assert.equal(b.metrics().receivable, 0);
  assert.throws(() => b.collect(s, a, 1));
});
test("traspasos y aportaciones no inflan utilidad", () => {
  const { b, a } = setup();
  const to = b.addAccount("Banco", "Banco", 0);
  b.movement("transfer", a, 10000, "Traspaso", null, to);
  b.movement("capital", to, 5000, "Aportación");
  assert.equal(b.balance(a), 90000);
  assert.equal(b.balance(to), 15000);
  assert.equal(b.metrics().result, 0);
  assert.equal(b.metrics().cash, 105000);
});
test("cancelar revierte unidades y cobro una sola vez", () => {
  const { b, a, p } = setup();
  const s = b.sell(
    [{ productId: p, qty: 1 }],
    36900,
    36900,
    a,
    null,
    null,
    "Mostrador",
  );
  b.cancel(s);
  assert.equal(b.stock()[0].stock, 5);
  assert.equal(b.balance(a), 100000);
  assert.equal(b.metrics().revenue, 0);
  assert.throws(() => b.cancel(s));
});
test("compras consumen caja pero no son gasto operativo duplicado", () => {
  const { b, a, p } = setup();
  b.receive(p, "Compra", "", 2, 10000, a);
  assert.equal(b.balance(a), 80000);
  assert.equal(b.metrics().expenses, 0);
  assert.equal(b.stock()[0].stock, 7);
});
test("componentes repetidos no permiten sobreventa", () => {
  const { b, a, p } = setup();
  assert.throws(() =>
    b.sell(
      [
        { productId: p, qty: 3 },
        { productId: p, qty: 3 },
      ],
      221400,
      221400,
      a,
      null,
      null,
      "Mostrador",
    ),
  );
  assert.equal(b.stock()[0].stock, 5);
});
test("restauración completa y rollback de respaldo roto", () => {
  const { b, a, p } = setup();
  const original = b.backup();
  b.sell([{ productId: p, qty: 1 }], 36900, 36900, a, null, null, "Mostrador");
  b.restore(original);
  assert.equal(b.stock()[0].stock, 5);
  assert.equal(b.sales().length, 0);
  const bad = JSON.parse(original);
  bad.data.lots[0].qty = 999;
  assert.throws(() => b.restore(JSON.stringify(bad)));
  assert.equal(b.stock()[0].stock, 5);
});
test("autorizar precio bajo costo es explícito", () => {
  const { b, a, p } = setup();
  assert.throws(() =>
    b.sell(
      [{ productId: p, qty: 1 }],
      10000,
      10000,
      a,
      null,
      null,
      "Mostrador",
    ),
  );
  b.sell(
    [{ productId: p, qty: 1 }],
    10000,
    10000,
    a,
    null,
    null,
    "Mostrador",
    true,
  );
  assert.equal(b.metrics().gross, -10000);
});
test("editar catálogo no reescribe costo y nombre de una venta", () => {
  const { b, a, p } = setup();
  const sale = b.sell(
    [{ productId: p, qty: 1 }],
    36900,
    36900,
    a,
    null,
    null,
    "Mostrador",
  );
  b.updateProduct(p, "GAT-300", "Nombre nuevo", "Creatina", 40000, 1);
  assert.equal(b.sales()[0].total, 36900);
  assert.equal(b.metrics().cost, 20000);
  assert.equal(
    b.all("SELECT name FROM sale_lines WHERE saleId=?", sale)[0].name,
    "Creatina 300 g",
  );
});
test("restaurar traspaso roto revierte todos los cambios", () => {
  const { b, a } = setup();
  const to = b.addAccount("Banco", "Banco", 0);
  b.movement("transfer", a, 10000, "Traspaso", null, to);
  const raw = JSON.parse(b.backup());
  raw.data.ledger = raw.data.ledger.filter(
    (l: any) => !(l.kind === "transfer" && l.amount > 0),
  );
  assert.throws(() => b.restore(JSON.stringify(raw)));
  assert.equal(b.balance(to), 10000);
});
test("cancelación sin dinero suficiente conserva venta y stock", () => {
  const { b, a, p } = setup();
  const sale = b.sell(
    [{ productId: p, qty: 1 }],
    36900,
    36900,
    a,
    null,
    null,
    "Mostrador",
  );
  b.movement("withdrawal", a, 136900, "Retiro");
  assert.throws(() => b.cancel(sale));
  assert.equal(b.sales()[0].status, "confirmed");
  assert.equal(b.stock()[0].stock, 4);
});
test("fallo de referencia revierte compra y venta", () => {
  const { b, a, p } = setup();
  assert.throws(() =>
    b.sell(
      [{ productId: p, qty: 1 }],
      36900,
      36900,
      a,
      "cliente-inexistente",
      null,
      "Mostrador",
    ),
  );
  assert.equal(b.stock()[0].stock, 5);
  assert.throws(() => b.receive(p, "B", "", 100, 20000, a));
  assert.equal(b.balance(a), 100000);
});

test('altas rápidas son atómicas: un alta inválida no deja producto huérfano',()=>{
 const {b}=setup();const before=b.stock().length;
 assert.throws(()=>b.quickProduct({name:'Nuevo',price:10000,qty:2}));
 assert.equal(b.stock().length,before);
 const p=b.quickProduct({name:'Nuevo',price:10000,qty:2,cost:5000});
 assert.match(b.stock().find(x=>x.id===p)!.sku,/^NS-AUTO-/);
 const customer=b.saveCustomer({name:'Cliente'});
 b.sell([{productId:p,qty:1}],10000,0,null,customer,null,'Mostrador');
 assert.equal(b.stock().find(x=>x.id===p)!.available,1);
});

test('corregir seguimiento de venta conserva importe, fecha, costo y stock',()=>{
 const {b,a,p}=setup();
 const saleId=b.sell([{productId:p,qty:1}],36900,36900,a,null,null,'Mostrador');
 const before=b.sales()[0],qty=b.stock()[0].stock;
 b.updateSaleDetails(saleId,{channel:'Instagram',notes:'Seguimiento'});
 const after=b.sales()[0];for(const key of ['total','cost','paid','created'])assert.equal(after[key],before[key]);
 assert.equal(after.channel,'Instagram');assert.equal(after.notes,'Seguimiento');assert.equal(b.stock()[0].stock,qty);
});

test('comisión solo para nuevos cobros con tarjeta y una vez por abono',()=>{
 const {b,p}=setup();const account=b.addAccount('Terminal','Tarjeta',0);const customer=b.saveCustomer({name:'Ana'});
 b.setSetting('cardFeeBps',406);
 const sale=b.sell([{productId:p,qty:1}],36900,10000,account,customer,null,'Mostrador');
 assert.equal(b.balance(account),9594);
 b.collect(sale,account,26900);assert.equal(b.balance(account),35402);
 assert.equal(b.all("SELECT * FROM ledger WHERE kind='expense'").length,2);
});

test('respaldo v2 se puede restaurar de nuevo sin romper referencias',()=>{
 const {b}=setup();const customer=b.saveCustomer({name:'Ana'});
 const raw=b.backup();b.restore(raw);b.restore(raw);
 assert.equal(b.customers().find(c=>c.id===customer)!.name,'Ana');
 assert.equal(b.all('PRAGMA foreign_key_check').length,0);
});

test('0.9: etapas del formulario aceptadas, resumen por periodo y archivo',()=>{
 const {b,a,p}=setup();
 for(const stage of ['Prospecto','Cliente','Frecuente','Inactivo']) b.saveCustomer({name:'C '+stage,stage});
 assert.equal(b.customers().length,4);
 b.sell([{productId:p,qty:1}],36900,36900,a,null,null,'Mostrador');
 const all=b.periodSummary(null);assert.equal(all.revenue,36900);assert.equal(all.orders,1);assert.equal(all.ticket,36900);
 assert.equal(b.periodSummary('2999-01-01').revenue,0);
 b.setProductArchived(p,true);assert.equal(b.stock()[0].archived,true);
 b.setProductArchived(p,false);assert.equal(b.stock()[0].archived,false);
 const c=b.customers()[0].id;b.setCustomerArchived(c,true);assert.equal(b.customers()[0].archived,true);
});
test('0.9: el respaldo no incluye la sesión de pantalla ni copias internas',()=>{
 const {b}=setup();b.setSetting('uiSession',{version:1,f:{imageUri:'x'.repeat(1000)}});b.setSetting('beforeRelease08','{}');
 const keys=JSON.parse(b.backup()).data.settings.map((s:any)=>s.key);
 assert.ok(!keys.includes('uiSession'));assert.ok(!keys.includes('beforeRelease08'));
});
test('0.9: fecha local para registros guardados en UTC',async()=>{
 const {localDay}=await import('../src/business.ts');
 assert.equal(localDay('2026-10-02'),'2026-10-02');
 const d=new Date(2026,9,2,21,30);assert.equal(localDay(d.toISOString()),'2026-10-02');
});
test('0.9.3: eliminar una venta cancelada con tarjeta la quita por completo, comisión incluida',()=>{
 const {b,p}=setup();const card=b.addAccount('Terminal','Tarjeta',100000);
 const before={cash:b.metrics().cash,stock:b.stock()[0].stock,backup:JSON.parse(b.backup()).data};
 const sale=b.sell([{productId:p,qty:1}],11700,11700,card,null,null,'Mostrador',true);
 assert.throws(()=>b.deleteCancelledSale(sale),/canceladas/);
 b.cancel(sale);assert.equal(b.balance(card),100000-475);
 b.deleteCancelledSale(sale);
 assert.equal(b.sales().length,0);assert.equal(b.balance(card),100000);assert.equal(b.stock()[0].stock,before.stock);
 assert.equal(b.metrics().cash,before.cash+0);
 for(const t of ['sales','sale_lines','allocations','stock_moves','ledger'])assert.equal(JSON.parse(b.backup()).data[t].filter((r:any)=>r.ref===sale||r.saleId===sale||r.id===sale).length,0,t);
 b.restore(b.backup());
});
test('2.0: el cliente absorbe la comisión: tú recibes tu precio exacto con cualquier forma de pago',async()=>{
 const {grossUp,baseOf,chargeFor,customerView,cardFee}=await import('../src/business.ts');
 assert.equal(grossUp(49900),52012);assert.equal(52012-cardFee(52012),49900,'$499 → $520.12 → recibes $499.00');
 assert.equal(grossUp(36900),38462);assert.equal(grossUp(0),0);assert.equal(grossUp(36900,0),36900);
 for(let p=1;p<200000;p+=37){const t=grossUp(p);assert.ok(t-cardFee(t)>=p,'nunca recibes menos: '+p);assert.ok(t-1-cardFee(t-1)<p,'el mínimo que lo logra: '+p);assert.equal(baseOf(t),p);}
 // El cliente ve cada producto ya con la comisión; el total cuadra con la suma.
 const c=chargeFor([{qty:2,price:49900},{qty:1,price:36900}]);
 assert.deepEqual(c.lines,[104024,38462]);assert.equal(c.total,142486);assert.equal(c.subtotal,c.total);assert.equal(c.discount,0);assert.equal(c.commission,142486-136700);
 assert.ok(c.total-cardFee(c.total)>=136700);
 // Con precio especial (descuento): el descuento se ve en precios al cliente.
 const d=chargeFor([{qty:1,price:49900}],406,45000);
 assert.equal(d.total,grossUp(45000));assert.equal(d.subtotal,52012);assert.equal(d.discount,52012-grossUp(45000));
 const {b,a,p}=setup();
 const t=grossUp(36900);
 const s=b.sell([{productId:p,qty:1}],t,t,a,null,null,'Mostrador',false,null,{amount:t-36900,bps:406});
 const v=b.saleDetail(s);
 assert.equal(v.total,t);assert.equal(v.basePrice,36900);assert.equal(v.commission,t-36900);
 assert.equal(v.lines[0].total,36900,'el renglón del dueño va con su precio');
 assert.deepEqual(customerView(v),{lines:[{qty:1,name:'Creatina 300 g',total:t}],subtotal:t,discount:0,total:t},'el cliente no ve la comisión');
 assert.equal(b.periodSummary(null).commissions,t-36900);
 // Tarjeta: después de Mercado Pago queda tu precio exacto.
 const card=b.addAccount('Terminal','Tarjeta',0);
 const t2=chargeFor([{qty:2,price:36900}]).total;
 const s2=b.sell([{productId:p,qty:2}],t2,t2,card,null,null,'Mostrador',false,null,{amount:t2-73800,bps:406});
 assert.ok(b.balance(card)>=73800&&b.balance(card)<=73801,'recibes tus $738.00');
 // Modificar la venta (devolver una pieza) conserva la regla.
 b.reviseSale(s2,[{productId:p,qty:1}],t,{refundAccountId:card,base:36900});
 const d2=b.saleDetail(s2);
 assert.equal(d2.commission,t-36900);assert.equal(d2.basePrice,36900);assert.equal(d2.lines.reduce((n:number,l:any)=>n+l.total,0),36900);
 // Venta de antes (sin comisión): el cliente ve lo mismo que antes.
 const s3=b.sell([{productId:p,qty:1}],36900,36900,a,null,null,'Mostrador');
 assert.equal(b.saleDetail(s3).commission,undefined);assert.equal(customerView(b.saleDetail(s3)).subtotal,36900);
});
test('1.9: regresa los precios al precio original una sola vez (respaldos 1.7/1.8 también)',async()=>{
 const {upliftPrice}=await import('../src/business.ts');
 const {b,p}=setup();
 const before=b.one('SELECT price FROM products WHERE id=?',p).price;const q=b.addProduct('GAT-301','Proteína 1 kg','Proteína',59900,2);
 // Paquete creado con una versión anterior (la 2.2.5 ya no los da de alta, pero los conserva).
 const bundle='combo-viejo';b.run('INSERT INTO bundles VALUES(?,?,?)',bundle,'Combo',50000);
 const price=(id:string)=>b.one('SELECT price FROM products WHERE id=?',id).price;
 // Simula un teléfono 1.7/1.8: precios +4.06% con la marca y los precios anteriores.
 b.run('UPDATE products SET price=? WHERE id=?',upliftPrice(before),p);b.run('UPDATE bundles SET price=? WHERE id=?',upliftPrice(50000),bundle);
 b.setSetting('catalogUplift',{bps:406,at:'2026-10-01T00:00:00.000Z',products:{[p]:before},bundles:{[bundle]:50000}});
 const raw=b.backup();
 assert.equal(b.restoreBasePrices(),2);
 assert.equal(price(p),before,'precio exacto anterior');assert.equal(b.one('SELECT price FROM bundles WHERE id=?',bundle).price,50000);
 assert.deepEqual(b.setting('pricing').changed.products[p],[upliftPrice(before),before]);
 assert.equal(b.restoreBasePrices(),0,'no se aplica dos veces');
 assert.equal(price(q),59900,'un producto dado de alta en pesos cerrados no cambia');
 // Precios escritos después: en pesos cerrados se respetan; con centavos de comisión se regresan.
 b.run('DELETE FROM settings WHERE key=?','pricing');
 b.run('UPDATE products SET price=? WHERE id=?',39900,p);
 assert.equal(b.restoreBasePrices(),0,'los precios en pesos cerrados se respetan');
 assert.equal(price(p),39900);
 b.run('DELETE FROM settings WHERE key=?','pricing');b.setSetting('catalogUplift',{bps:406,products:{},bundles:{}});
 b.run('UPDATE products SET price=? WHERE id=?',38398,p);
 b.restoreBasePrices();assert.equal(price(p),36900);
 // Un respaldo 1.7/1.8 se corrige al restaurarlo; uno anterior (sin marca) queda igual.
 b.restore(raw);assert.equal(price(p),upliftPrice(before));
 assert.equal(b.restoreBasePrices(),2);assert.equal(price(p),before);
 const old=JSON.parse(raw);old.data.settings=old.data.settings.filter((r:any)=>!['catalogUplift','pricing'].includes(r.key));
 old.data.products=old.data.products.map((r:any)=>({...r,price:before}));
 b.restore(JSON.stringify(old));assert.equal(b.restoreBasePrices(),0);assert.equal(price(p),before);assert.ok(b.setting('pricing'));
});
test('0.9.6: la clave de Mercado Pago no sale en respaldos y sobrevive a restaurar; validar venta no guarda nada',()=>{
 const {b,a,p}=setup();b.setSetting('mpConfig',{token:'APP_USR-secreto',terminalId:'T',enabled:true});
 const raw=b.backup();assert.ok(!raw.includes('APP_USR-secreto'));
 b.restore(raw);assert.equal(b.setting('mpConfig').token,'APP_USR-secreto');
 const before=b.stock()[0].stock;b.validateSale([{productId:p,qty:1}],36900,36900,a,null,null,'Mostrador');
 assert.equal(b.stock()[0].stock,before);assert.equal(b.sales().length,0);
 assert.throws(()=>b.validateSale([{productId:p,qty:99}],36900,36900,a,null,null,'Mostrador'),/insuficientes/);
});
test('1.0: ajuste de inventario por conteo (baja FEFO, respeta caducidad, sube con último costo) y renombrar cuenta',()=>{
 const {b,a,p}=setup();b.receive(p,'B','2029-01-01',2,21000,null);
 const r=b.adjustStock(p,4,'Merma o caducado','golpe');assert.equal(r.before,7);assert.equal(r.delta,-3);assert.equal(b.stock()[0].stock,4);
 assert.equal(b.lots().find(l=>l.label==='B')!.qty,0);assert.equal(r.value,2*21000+20000);
 const up=b.adjustStock(p,6,'Conteo físico');assert.equal(up.delta,2);assert.equal(b.stock()[0].stock,6);
 assert.throws(()=>b.adjustStock(p,6,'Conteo físico'),/nada que ajustar/);
 b.restore(b.backup());assert.equal(b.stock()[0].stock,6);
 b.renameAccount(a,'Caja tienda');assert.equal(b.accounts().find(x=>x.id===a)!.name,'Caja tienda');
 const s=b.periodSummary('2000-01-01','2000-01-02');assert.equal(s.orders,0);
});

test("1.5.1: 'disponibles' coincide con lo que una venta puede tomar (apartados)", () => {
  const { b, a, p } = setup();
  // Apartado (entrega pendiente) mayor que un lote: no debe "prestar" unidades de otro cálculo.
  b.receive(p, "B", "2030-01-01", 1, 20000, null);
  const lotA = b.all("SELECT id FROM lots WHERE productId=? AND label='A'", p)[0].id;
  const sale = b.sell([{ productId: p, qty: 1 }], 36900, 36900, a, null, null, "Mostrador");
  const alloc = b.all("SELECT a.id FROM allocations a JOIN sale_lines l ON l.id=a.lineId WHERE l.saleId=?", sale)[0].id;
  b.setSetting("reservation:" + alloc, 9); // dato inconsistente (más apartado que el lote)
  const shown = b.stock().find((x) => x.id === p)!.available;
  assert.equal(shown, b.sellable(p));
  if (shown > 0) b.sell([{ productId: p, qty: shown }], 36900 * shown, 36900 * shown, a, null, null, "Mostrador");
  assert.equal(b.stock().find((x) => x.id === p)!.available, 0);
  assert.ok(lotA);
});
