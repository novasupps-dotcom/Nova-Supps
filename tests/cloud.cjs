// Multiusuario de punta a punta con Supabase y Mercado Pago simulados.
const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
for(const extension of ['.ts','.tsx']) require.extensions[extension]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022,resolveJsonModule:true}}).outputText,file);
const {Business}=require('../src/business.ts');const {applyRelease08}=require('./fixtures/releaseUpdate.ts');
const {Cloud,parseInvite,terminalFetcher,CloudError,publicInvoke,normalizeShortCode,formatShortCode}=require('../src/cloud.ts');const sync=require('../src/sync.ts');const {MercadoPago,orderOutcome,orderPayment}=require('../src/mercadopago.ts');
const {createFake}=require('./fakeSupabase.cjs');
const mkdb=()=>{const sql=new DatabaseSync(':memory:');return {execSync:s=>sql.exec(s),runSync:(s,...p)=>sql.prepare(s).run(...p),getAllSync:(s,...p)=>sql.prepare(s).all(...p),getFirstSync:(s,...p)=>sql.prepare(s).get(...p),withTransactionSync:f=>{sql.exec('BEGIN');try{f();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}}};
(async()=>{
 const fake=createFake();const cfg=parseInvite('Te invito: '+fake.invite);assert.deepEqual(cfg,{url:fake.BASE,anonKey:fake.ANON});
 // Dueño
 const b=new Business(mkdb());require('./fixtures/legacyImport.ts').initialize(b,fs.readFileSync('tests/fixtures/initialData.json','utf8'));applyRelease08(b,JSON.parse(fs.readFileSync('tests/fixtures/release08.json','utf8')));
 const owner=new Cloud(cfg,null,()=>{},fake.fetch);owner.device='dev-owner-0123456789';await owner.signUp('dueno@gns.mx','secreto1');assert.equal(await owner.rpc('claim_owner',{p_name:'Emmanuel'}),'owner');
 const terminal={terminalId:'NEWLAND_N950__X',enabled:true};
 const n=await sync.publish(b,owner,terminal);assert.ok(n>40,'publica catálogo');assert.equal(await sync.publish(b,owner,terminal),0,'no repite lo publicado');
 // Vendedor: solo con código de un solo uso (registro abierto apagado)
 fake.state.signupDisabled=true;
 const intruder=new Cloud(cfg,null,()=>{},fake.fetch);await assert.rejects(intruder.signUp('x@x.mx','secreto99'),/422|Signups/);
 const code=await owner.rpc('create_invite',{p_name:'Luis',p_days:7});assert.match(code,/^GNS[A-Z0-9]{8}$/);
 assert.equal(normalizeShortCode(' gns-'+code.slice(3,7).toLowerCase()+' '+code.slice(7)),code);assert.equal(formatShortCode(code),`GNS-${code.slice(3,7)}-${code.slice(7)}`);
 assert.equal((await intruder.select('invites').catch(()=>[])).length,0,'sin sesión no ve códigos');
 const alta=(c,email,device)=>publicInvoke(cfg,'cobro-terminal',{action:'alta',code:c,name:'Luis',email,password:'secreto22',device},fake.fetch);
 assert.equal((await alta('GNS-ZZZZ-ZZZZ','luis@gns.mx','dev-luis-0123456789')).data.code,'invalid');
 assert.equal((await alta(code,'luis@gns.mx','dev-luis-0123456789')).ok,true,'alta con código');
 assert.equal((await alta(code,'pepe@gns.mx','dev-pepe-0123456789')).data.code,'used','el código sirve una sola vez');
 assert.equal(fake.T.invites.find(i=>i.code===code).used_by!==null,true);
 const seller=new Cloud(cfg,null,()=>{},fake.fetch);seller.device='dev-luis-0123456789';await seller.signIn('luis@gns.mx','secreto22');assert.equal(await seller.rpc('request_join',{p_name:''}),'active');
 // Misma cuenta en otro teléfono: sin acceso
 const thief=new Cloud(cfg,null,()=>{},fake.fetch);thief.device='dev-otro-0123456789';await thief.signIn('luis@gns.mx','secreto22');
 assert.equal(await thief.rpc('request_join',{p_name:''}),'other_device');assert.equal((await thief.select('catalog')).length,0,'otro teléfono no ve catálogo');
 await assert.rejects(thief.insert('sales',[{id:'v-x',items:[],total:1,method:'Efectivo'}]),/permiso/);
 const tm=new MercadoPago('',terminalFetcher(thief));await assert.rejects(tm.getOrder('ORD1'),/no está autorizado/);
 const ownerOther=new Cloud(cfg,null,()=>{},fake.fetch);ownerOther.device='dev-otro-0123456789';await ownerOther.signIn('dueno@gns.mx','secreto1');
 await assert.rejects(ownerOther.rpc('claim_owner',{p_name:'X'}),/otro teléfono/);assert.equal(await ownerOther.rpc('request_join',{p_name:''}),'other_device');
 assert.equal((await ownerOther.select('sales')).length,0,'dueño desde otro teléfono no ve ventas');
 await assert.rejects(seller.rpc('claim_owner',{p_name:'Luis'}),/dueño/);
 await assert.rejects(seller.update('members',`user_id=eq.${seller.userId}`,{device_id:null}).then(r=>{if(!r.length)throw new Error('permiso')}),/permiso/);
 const catalog=await seller.rpc('seller_catalog',{});const prod=catalog.find(p=>p.available>=3);assert.ok(prod);assert.equal(prod.cost,undefined,'sin costos');
 await assert.rejects(seller.update('catalog',`product_id=eq.${prod.product_id}`,{price:1}).then(r=>{if(!r.length)throw new Error('permiso');}),/permiso/);
 // 1.2: el vendedor ya no inserta ventas directo; solo submit_sale (el servidor pone precio, total y hora)
 await assert.rejects(seller.insert('sales',[{id:'v-x1',items:[{productId:prod.product_id,qty:1,price:1}],total:1,method:'Efectivo'}]),/permiso/);
 const items=(q=1,price=1)=>[{productId:prod.product_id,qty:q,price}];
 // 2.0: el cliente absorbe la comisión con cualquier forma de pago: después de Mercado Pago queda tu precio.
 const withFee=require('../src/business.ts').grossUp(prod.price,406),fee=withFee-prod.price;
 const r1=await seller.rpc('submit_sale',{p_id:'v-000001',p_items:items(1,1),p_method:'Efectivo',p_new_customer:{id:'c-luis-1',name:'Cliente de Luis',phone:'55 1111 2222'},p_client_time:new Date(Date.now()-40*86400000).toISOString(),p_client_total:withFee});
 assert.equal(r1.status,'pendiente');const v1=fake.T.sales.find(v=>v.id==='v-000001');assert.equal(v1.total,withFee,'precio del servidor + comisión (no el del teléfono)');assert.equal(v1.commission,fee);assert.equal(v1.subtotal,prod.price);assert.equal(v1.items[0].price,prod.price);assert.equal(v1.client_time,null,'hora del teléfono fuera de rango ignorada');
 assert.equal((await seller.rpc('submit_sale',{p_id:'v-000001',p_items:items(),p_method:'Efectivo'})).duplicate,true,'reintento idempotente');
 assert.equal((await seller.rpc('seller_catalog',{})).find(p=>p.product_id===prod.product_id).available,prod.available-1,'lo vendido queda apartado para todos');
 // Privacidad de clientes: el vendedor no lee la tabla; busca con teléfono enmascarado
 assert.equal((await seller.select('customers')).length,0,'el vendedor no descarga los clientes');
 const found=await seller.rpc('seller_customers',{p_query:'luis'});assert.equal(found[0].phone_hint,'•••2222');assert.equal(found[0].phone,undefined);
 assert.equal(await seller.rpc('receipt_phone',{p_sale_id:'v-000001'}),'5511112222','teléfono solo para el comprobante de su venta');
 // Precio distinto al cobrado (venta sin internet con precio viejo) → revisión del dueño
 const r5=await seller.rpc('submit_sale',{p_id:'v-000005',p_items:items(),p_method:'Efectivo',p_client_total:prod.price});assert.equal(r5.status,'conflicto','un teléfono anterior cobró sin comisión');assert.match(r5.error,/cobró/);
 // Venta con tarjeta por la función (el vendedor nunca tiene la clave)
 const remoteMp=new MercadoPago('',terminalFetcher(seller));
 const check=await seller.rpc('check_sale',{p_items:items()});assert.equal(check.ok,true);assert.equal(check.total,withFee);assert.equal(check.subtotal,prod.price);assert.equal(check.commission,fee);assert.equal(check.fee_bps,406);
 // Con tarjeta, el mismo total que en efectivo.
 const cardTotal=withFee;assert.equal(check.card_total,cardTotal,'con tarjeta, el mismo total');assert.equal(check.pricing,'grossup');
 const order=await remoteMp.createOrder({terminalId:'ignorado',amount:cardTotal,reference:'NOVA-test-1234'});
 assert.equal(fake.mp.calls.at(-1).body.config.point.terminal_id,'NEWLAND_N950__X','la función usa la terminal del dueño');
 await assert.rejects(seller.rpc('submit_sale',{p_id:'v-000002',p_items:items(),p_method:'Tarjeta',p_order_id:order.id}),/no está aprobado/,'sin aprobar no se registra');
 fake.mp.approve(order.id,{last4:'9876',authorization:'778899'});
 const got=await remoteMp.getOrder(order.id);assert.equal(orderOutcome(got),'approved');assert.equal(fake.T.terminal_orders.find(o=>o.order_id===order.id).status,'aprobada');
 const pay=await remoteMp.payment(orderPayment(got).referenceId);assert.equal(pay.authorization_code,'778899');assert.equal(pay.fee_details,undefined,'al vendedor no se le muestra la comisión');
 assert.equal((await seller.rpc('submit_sale',{p_id:'v-000002',p_items:items(),p_method:'Tarjeta',p_order_id:order.id,p_client_total:cardTotal})).status,'pendiente');assert.equal(fake.T.sales.find(v=>v.id==='v-000002').total,cardTotal,'total = precio de catálogo + comisión');
 await assert.rejects(seller.rpc('submit_sale',{p_id:'v-000006',p_items:items(),p_method:'Tarjeta',p_order_id:order.id}),/ya se usó/,'un cobro no paga dos ventas');
 // Otro vendedor no puede consultar, cancelar ni usar el cobro de Luis
 const c3=await owner.rpc('create_invite',{p_name:'Mar',p_days:7});assert.equal((await alta(c3,'mar@gns.mx','dev-mar-0123456789')).ok,true);
 const mar=new Cloud(cfg,null,()=>{},fake.fetch);mar.device='dev-mar-0123456789';await mar.signIn('mar@gns.mx','secreto22');
 const marMp=new MercadoPago('',terminalFetcher(mar));await assert.rejects(marMp.getOrder(order.id),/no es tuyo/);await assert.rejects(marMp.cancelOrder(order.id),/no es tuyo/);
 const o9=await remoteMp.createOrder({terminalId:'x',amount:cardTotal,reference:'NOVA-test-4321'});fake.mp.approve(o9.id);await remoteMp.getOrder(o9.id);
 await assert.rejects(mar.rpc('submit_sale',{p_id:'v-mar-0001',p_items:items(),p_method:'Tarjeta',p_order_id:o9.id}),/no es tuyo/);
 assert.equal((await mar.rpc('seller_customers',{p_query:''})).length,0,'sin búsqueda solo ve sus propios clientes');
 assert.equal(await mar.rpc('receipt_phone',{p_sale_id:'v-000001'}),null,'no saca teléfonos de ventas ajenas');
 assert.equal((await mar.select('sales')).length,0,'no ve ventas de otros');
 // Venta imposible (sin existencias) → conflicto en el servidor
 const r3=await seller.rpc('submit_sale',{p_id:'v-000003',p_items:items(999),p_method:'Efectivo'});assert.equal(r3.status,'conflicto');assert.match(r3.error,/existencias suficientes/);
 // Dueño sincroniza
 const accounts=Object.fromEntries(b.accounts().map(a=>[a.kind==='Banco'?'Transferencia':a.kind,a.id]));
 const ownerMp=new MercadoPago('APP_USR-owner',fake.fetch);
 const verify=async id=>{const o=await ownerMp.getOrder(id);return {approved:orderOutcome(o)==='approved',amount:orderPayment(o).amount}};
 const stock0=b.stock().find(p=>p.id===prod.product_id).available;
 const r=await sync.syncOwner(b,owner,{accounts,terminal,verifyCard:verify});
 assert.equal(r.applied,2);assert.equal(r.customers,1);
 assert.equal(b.stock().find(p=>p.id===prod.product_id).available,stock0-2);
 const local=b.sales().filter(s=>s.seller==='Luis');assert.equal(local.length,2);assert.ok(local.every(s=>s.folio.startsWith('V-')));
 const cardSale=local.find(s=>s.remoteId==='v-000002');const det=b.saleDetail(cardSale.id);assert.ok(det.fees>0,'comisión de tarjeta');assert.equal(det.mpOrderId,order.id);assert.equal(det.cardFeePassed,undefined);assert.equal(det.commission,fee,'comisión absorbida por el cliente');assert.equal(det.basePrice,prod.price);assert.equal(det.total,cardTotal);
 assert.equal(b.customers().find(c=>c.id==='c-luis-1').phone,'5511112222');
 const remote=Object.fromEntries((await owner.select('sales')).map(s=>[s.id,s]));
 assert.equal(remote['v-000001'].status,'aplicada');assert.equal(remote['v-000002'].status,'aplicada');assert.equal(remote['v-000003'].status,'conflicto');assert.equal(remote['v-000005'].status,'conflicto');
 // 2.1: las ventas en revisión (conflicto) siguen apartando sus piezas hasta que el dueño las resuelva.
 const held=Object.values(remote).filter(v=>v.status==='conflicto').reduce((n,v)=>n+v.items.filter(i=>i.productId===prod.product_id).reduce((k,i)=>k+Number(i.qty),0),0);
 assert.equal((await seller.rpc('seller_catalog',{})).find(p=>p.product_id===prod.product_id).available,Math.max(0,stock0-2-held),'existencias publicadas (sin lo apartado en revisión)');
 // El mismo cobro no se registra dos veces aunque llegue en otra venta (defensa en el teléfono del dueño)
 assert.throws(()=>b.applyRemoteSale({id:'v-dup-0001',items:[{productId:prod.product_id,qty:1}],total:prod.price,method:'Tarjeta',mp:{orderId:order.id},seller_name:'X',created_at:new Date().toISOString()},accounts.Tarjeta),/ya está registrado/);
 // Idempotente
 const r2=await sync.syncOwner(b,owner,{accounts,terminal,verifyCard:verify});assert.equal(r2.applied,0);assert.equal(b.sales().filter(s=>s.seller==='Luis').length,2);
 // Descartar conflictos
 await owner.update('sales','id=eq.v-000003',{status:'rechazada'});const r3b=await sync.syncOwner(b,owner,{accounts,terminal});assert.equal(r3b.conflicts,0);
 // Cobro con tarjeta rechazado → no se puede registrar la venta
 const o2=await remoteMp.createOrder({terminalId:'x',amount:prod.price,reference:'NOVA-test-5678'});fake.mp.reject(o2.id);await remoteMp.getOrder(o2.id);
 await assert.rejects(seller.rpc('submit_sale',{p_id:'v-000004',p_items:items(),p_method:'Tarjeta',p_order_id:o2.id}),/no está aprobado/);
 // Monto pagado distinto al cobro → "revisar", no se acepta
 const o3=await remoteMp.createOrder({terminalId:'x',amount:prod.price,reference:'NOVA-test-6789'});fake.mp.approve(o3.id);fake.mp.orders.get(o3.id).transactions.payments[0].paid_amount='1.00';await remoteMp.getOrder(o3.id);
 assert.equal(fake.T.terminal_orders.find(o=>o.order_id===o3.id).status,'revisar');
 // Terminal deshabilitada para vendedores
 await sync.publish(b,owner,{terminalId:'NEWLAND_N950__X',enabled:false});
 await assert.rejects(remoteMp.createOrder({terminalId:'x',amount:500,reference:'NOVA-test-9999'}),/no ha habilitado la terminal/);
 // Sin secreto en el servidor
 fake.state.mpToken='';await assert.rejects(remoteMp.getOrder(order.id),/MP_ACCESS_TOKEN/);fake.state.mpToken='APP_USR-secret';
 // Sesión renovada sola
 owner.session.expires_at=1;const before=owner.session.access_token;await owner.select('members');assert.notEqual(owner.session.access_token,before,'renueva la sesión');
 // Sin internet
 fake.state.offline=true;await assert.rejects(seller.select('catalog'),e=>e instanceof CloudError&&/internet/.test(e.message));fake.state.offline=false;
 // El respaldo no lleva la sesión
 b.setSetting('cloudSession',owner.session);b.setSetting('cloudConfig',cfg);assert.ok(!b.backup().includes(owner.session.access_token));
 // Cambio de teléfono: código de un solo uso SOLO para esa cuenta (sin ventana abierta)
 const cam=await owner.rpc('create_device_code',{p_user:seller.userId});assert.match(cam,/^CAM[A-Z0-9]{8}$/);
 await assert.rejects(seller.rpc('create_device_code',{p_user:seller.userId}),/Solo el dueño/);
 const nuevo=new Cloud(cfg,null,()=>{},fake.fetch);nuevo.device='dev-nuevo-0123456789';await nuevo.signIn('luis@gns.mx','secreto22');
 assert.equal(await nuevo.rpc('request_join',{p_name:''}),'other_device','sin código no entra');
 const marNew=new Cloud(cfg,null,()=>{},fake.fetch);marNew.device='dev-mar2-0123456789';await marNew.signIn('mar@gns.mx','secreto22');
 assert.equal(await marNew.rpc('redeem_device_code',{p_code:cam}),'invalid','el código de Luis no sirve para otra cuenta');
 assert.equal(await nuevo.rpc('redeem_device_code',{p_code:formatShortCode(cam).toLowerCase()}),'ok');
 assert.equal(await nuevo.rpc('request_join',{p_name:''}),'active');assert.ok((await nuevo.rpc('seller_catalog',{})).length>0);
 assert.equal(await seller.rpc('request_join',{p_name:''}),'other_device','el teléfono anterior deja de funcionar');
 assert.equal(await seller.rpc('redeem_device_code',{p_code:cam}),'invalid','el código no sirve dos veces');
 // Dueño cambia de teléfono con su código de recuperación
 const rec=await owner.rpc('create_owner_recovery',{});assert.match(rec,/^REC[A-Z0-9]{8}$/);
 const ownerNew=new Cloud(cfg,null,()=>{},fake.fetch);ownerNew.device='dev-owner2-0123456789';await ownerNew.signIn('dueno@gns.mx','secreto1');
 await assert.rejects(ownerNew.rpc('claim_owner',{p_name:'X'}),/otro teléfono/);
 assert.equal(await ownerNew.rpc('redeem_device_code',{p_code:rec}),'ok');assert.equal(await ownerNew.rpc('claim_owner',{p_name:'Emmanuel'}),'owner');
 assert.equal(await owner.rpc('request_join',{p_name:''}),'other_device','el teléfono anterior del dueño ya no es dueño');
 assert.equal((await owner.select('sales')).length,0);
 // Intentos con códigos falsos: se bloquea por cuenta
 for(let i=0;i<10;i++)await marNew.rpc('redeem_device_code',{p_code:'CAM-ZZZZ-ZZZ'+i});assert.equal(await marNew.rpc('redeem_device_code',{p_code:'CAM-ZZZZ-ZZZZ'}),'locked');
 // Bloqueo por intentos
 fake.state.ip='9.9.9.9';for(let i=0;i<20;i++)await alta('GNS-AAAA-AAA'+'ABCDEFGHJKLMNPQRSTUVWX'[i],'z'+i+'@x.mx','dev-z-0123456789abc');
 const c2=await ownerNew.rpc('create_invite',{p_name:'Ana',p_days:7});assert.equal((await alta(c2,'ana@x.mx','dev-ana-0123456789')).data.code,'locked');
 // Sin dirección conocida no hay contador compartido: nadie bloquea el alta de todos
 fake.state.ip='';for(let i=0;i<25;i++)await alta('GNS-BBBB-BBB'+'ABCDEFGHJKLMNPQRSTUVWXYZ'[i%24],'y'+i+'@x.mx','dev-y-0123456789abc');
 assert.equal(fake.failures.filter(f=>!f.key).length,0);assert.equal((await alta(c2,'ana@x.mx','dev-ana-0123456789')).ok,true,'el alta sigue funcionando');
 // Copia del vendedor de la 1.1 (con teléfonos completos): se limpia al abrir
 {const {cachedData}=require('../src/sellerCore.ts');const sb=new Business(mkdb());sb.setSetting('sellerCache',{catalog:[],customers:[{id:'c1',name:'Ana',phone:'5512345678'}],config:{},at:'x'});
  const c=cachedData(sb);assert.equal(c.customers[0].phone,undefined);assert.equal(c.customers[0].phone_hint,'•••5678');assert.ok(!JSON.stringify(sb.setting('sellerCache',null)).includes('5512345678'));}
 console.log('Multiusuario 1.2: OK (venta con precio/total/hora del servidor, apartado de existencias, cobro de tarjeta propio/aprobado/sin reuso, clientes enmascarados, código de cambio de teléfono, recuperación del dueño, bloqueo por intentos sin contador compartido)');
})().catch(e=>{console.error(e);process.exit(1)});
