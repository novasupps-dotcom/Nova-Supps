import { DatabaseSync } from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Business} from '../src/business.ts';
import {initialize,mergeCatalogueUpdate} from './fixtures/legacyImport.ts';
function empty(){const sql=new DatabaseSync(':memory:');return new Business({execSync:(s)=>sql.exec(s),runSync:(s,...p)=>sql.prepare(s).run(...p),getAllSync:(s,...p)=>sql.prepare(s).all(...p) as any,getFirstSync:(s,...p)=>sql.prepare(s).get(...p) as any,withTransactionSync:(f)=>{sql.exec('BEGIN');try{f();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}})}
const seed=readFileSync(new URL('./fixtures/initialData.json',import.meta.url),'utf8');
const baseline=readFileSync(new URL('./fixtures/baselineData.v03.json',import.meta.url),'utf8');
const update=readFileSync(new URL('./fixtures/updateData.json',import.meta.url),'utf8');
test('carga conciliada y reinicio sin duplicar ni sobrescribir nuevas ventas',()=>{
 const b=empty();assert.equal(initialize(b,seed),true);
 assert.equal(b.stock().length,41);assert.equal(b.customers().length,8);assert.equal(b.sales().length,9);
 assert.equal(b.stock().reduce((n,p)=>n+p.stock,0),153);
 assert.equal(b.metrics().revenue,525700);assert.equal(b.metrics().cash,412370);assert.equal(b.metrics().receivable,0);
 assert.equal(b.metrics().cost,404266);assert.equal(b.metrics().expenses,113330);
 const glut=b.stock().find(p=>p.sku==='NS-GLU-001')!;assert.equal(glut.inventoryKnown,false);
 const p=b.stock().find(p=>p.available>0&&p.price>100)!;
 const account=b.accounts().find(a=>a.kind==='Efectivo')!;
 b.sell([{productId:p.id,qty:1}],p.price,p.price,account.id,null,null,'Mostrador',true);
 const total=b.metrics().revenue;assert.equal(initialize(b,seed),false);assert.equal(b.sales().length,10);assert.equal(b.metrics().revenue,total);
 const backup=b.backup();const other=empty();other.restore(backup);assert.equal(other.metrics().revenue,total);
});
test('actualización agrega folios faltantes una vez y conserva ventas y cambios locales',()=>{
 const b=empty(); initialize(b,baseline);
 const p=b.stock().find(x=>x.sku==='NS-PRE-005')!;
 b.quickProduct({...p,price:p.price+100,description:'Mi descripción personalizada'});
 const account=b.accounts().find(a=>a.kind==='Efectivo')!;
 const other=b.stock().find(x=>x.sku==='NS-AMI-001')!;
 b.sell([{productId:other.id,qty:1}],other.price,other.price,account.id,null,null,'Mostrador',true);
 const before=b.sales().length;
 assert.equal(mergeCatalogueUpdate(b,update).length,0);
 assert.equal(b.sales().length,before+2);
 assert.equal(b.stock().reduce((n,x)=>n+x.stock,0),152);
 assert.equal(b.stock().find(x=>x.sku===p.sku)!.price,p.price+100);
 assert.equal(b.stock().find(x=>x.sku===p.sku)!.description,'Mi descripción personalizada');
 assert.equal(b.sales().find(x=>x.id==='VNS0009')!.total,103800);
 assert.equal(b.sales().find(x=>x.id==='VNS0009')!.paid,103800);
 assert.equal(b.one('SELECT COUNT(*) n FROM ledger WHERE ref=?','IL002').n,1);
 const snapshot=[b.sales().length,b.metrics().revenue,b.metrics().cash,b.stock().reduce((n,x)=>n+x.stock,0)];
 mergeCatalogueUpdate(b,update);
 assert.deepEqual([b.sales().length,b.metrics().revenue,b.metrics().cash,b.stock().reduce((n,x)=>n+x.stock,0)],snapshot);
});
test('cambio de SKU preserva referencia de imagen del catálogo',()=>{
 const b=empty();initialize(b,seed);const p=b.stock()[0];b.quickProduct({...p,sku:'CAMBIO-001'});
 assert.equal(b.stock().find(x=>x.id===p.id)!.imageKey,p.sku);
});
