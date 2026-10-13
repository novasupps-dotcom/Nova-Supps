import { DatabaseSync } from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Business} from '../src/business.ts';
import {applyRelease08} from './fixtures/releaseUpdate.ts';
import {initialize} from './fixtures/legacyImport.ts';
const seed=readFileSync(new URL('./fixtures/initialData.json',import.meta.url),'utf8');
const patch=JSON.parse(readFileSync(new URL('./fixtures/release08.json',import.meta.url),'utf8'));
function setup(){const sql=new DatabaseSync(':memory:');const b=new Business({execSync:s=>sql.exec(s),runSync:(s,...p)=>sql.prepare(s).run(...p),getAllSync:(s,...p)=>sql.prepare(s).all(...p) as any,getFirstSync:(s,...p)=>sql.prepare(s).get(...p) as any,withTransactionSync:f=>{sql.exec('BEGIN');try{f();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}});initialize(b,seed);return b;}
test('Excel: 11 folios, 5409 brutos, 37.30 comisiones, 5371.70 netos',()=>{
 const b=setup();assert.deepEqual(applyRelease08(b,patch),[]);
 const m=b.metrics();assert.equal(m.netSales,537170);assert.equal(m.revenue,540900);assert.equal(m.fees,3730);assert.equal(m.netCollected,537170);assert.equal(m.cost,413125);assert.equal(m.gross,127775);assert.equal(m.orders,11);assert.equal(m.receivable,0);assert.equal(m.operatingOutflows,109900);
 assert.equal(b.stock().reduce((n,p)=>n+p.stock,0),149);
 for(const s of patch.sales){const actual=b.saleDetail(s.id);assert.equal(actual.total,s.total);assert.equal(actual.paid,s.total);assert.equal(actual.fees,s.payments.reduce((n,p)=>n+p.fee,0));for(const line of actual.lines){const expected=s.lines.find(l=>l.id===line.id);assert.equal(line.unitPrice,expected.unitPrice);assert.equal(line.qty,expected.qty);}}
 const before=JSON.parse(b.backup()).data;applyRelease08(b,patch);assert.deepEqual(JSON.parse(b.backup()).data,before);
});
test('cada abono de tarjeta aplica 4.06% una sola vez; efectivo/transferencia sin comisión',()=>{
 const b=setup();applyRelease08(b,patch);
 const p=b.stock().find(p=>p.available>0 && p.price>=10000)!;const customer=b.customers()[0].id;
 const sale=b.sell([{productId:p.id,qty:1}],10000,0,null,customer,null,'Mostrador',true);
 b.collect(sale,'card',3333);b.collect(sale,'card',3333);b.collect(sale,'transfer',2334);b.collect(sale,'cash',1000);
 const d=b.saleDetail(sale);assert.equal(d.fees,270);assert.equal(d.netCollected,9730);assert.equal(d.paid,10000);
 assert.throws(()=>b.collect(sale,'card',1));assert.equal(b.saleDetail(sale).fees,270);
});
test('migración conserva foto, borrador, venta local y cancelación',()=>{
 const b=setup();b.setSetting('uiSession',{form:'Venta',cart:[{productId:'NS-BAR-001',qty:1}]});b.setSetting('product:NS-BAR-001',{imageUri:'data:image/png;base64,abc'});
 b.cancel('VNS0001');const id=b.sell([{productId:'NS-BAR-001',qty:1}],3900,3900,'cash',null,null,'Mostrador',true);
 applyRelease08(b,patch);assert.equal(b.saleDetail('VNS0001').status,'cancelled');assert.equal(b.saleDetail(id).total,3900);assert.equal(b.setting('uiSession').form,'Venta');assert.equal(b.setting('product:NS-BAR-001').imageUri,'data:image/png;base64,abc');
});
test('actualización desde 0.6 libera dos barras reservadas y concilia VNS0011 sin doble salida',()=>{
 const b=setup();const v6=structuredClone(patch);v6.release='fixture06';v6.sales=v6.sales.filter(s=>s.id!=='VNS0011');const s=v6.sales.find(s=>s.id==='VNS0010');s.lines[0].qty=3;s.lines[0].delivered=1;s.payments[0].amount=11700;s.payments[0].fee=475;s.total=15200;s.cost=3*s.lines[0].unitCost+s.lines[1].unitCost;
 applyRelease08(b,v6);assert.equal(b.stock().reduce((n,p)=>n+p.stock,0),151);
 b.run("DELETE FROM settings WHERE key='release08' OR key LIKE 'source08:%'");assert.deepEqual(applyRelease08(b,patch),[]);assert.equal(b.metrics().netSales,537170);assert.equal(b.stock().reduce((n,p)=>n+p.stock,0),149);assert.equal(b.stock().reduce((n,p)=>n+p.available,0),149);
});
test('stock insuficiente revierte toda la venta importada',()=>{
 const b=setup();b.run("UPDATE lots SET qty=0 WHERE productId='NS-BAR-001'");const count=b.sales().length;const balance=b.metrics().collected;
 const changed={...patch,sales:patch.sales.filter(s=>s.id==='VNS0010')};assert.equal(applyRelease08(b,changed).length,1);assert.equal(b.sales().length,count);assert.equal(b.metrics().collected,balance);assert.equal(b.all("SELECT * FROM sale_lines WHERE saleId='VNS0010'").length,0);
});
test('0.9.1: ventas por forma de pago, netas y después de gastos operativos',()=>{
 const b=setup();applyRelease08(b,patch);const r=b.periodSummary(null);
 const by=Object.fromEntries(r.byMethod.map((x:any)=>[x.method,x]));
 assert.equal(r.revenue,540900);
 assert.equal(by.Transferencia.gross,337400);assert.equal(by.Transferencia.fee,0);
 assert.equal(by.Efectivo.gross,111600);assert.equal(by.Efectivo.fee,0);
 assert.equal(by.Tarjeta.gross,91900);assert.equal(by.Tarjeta.fee,3730);assert.equal(by.Tarjeta.net,88170);
 assert.equal(r.byMethod.reduce((n:number,x:any)=>n+x.net,0),537170);assert.equal(r.netSales,537170);
 assert.equal(r.expenses,109900);assert.equal(r.afterExpenses,431000);assert.equal(r.available,427270);
 assert.equal(r.available,b.metrics().cash);
});
