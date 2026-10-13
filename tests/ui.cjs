const fs=require('fs'),Module=require('module'),ts=require('typescript'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
global.IS_REACT_ACT_ENVIRONMENT=true;global.__NOVA_NO_FOLLOW_ALERT=true;
for(const extension of ['.ts','.tsx']) require.extensions[extension]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,file);
require.extensions['.jpg']=(m,file)=>m.exports={asset:file};
const React=require('react'),renderer=require('react-test-renderer'),{act}=renderer;
const sql=new DatabaseSync(':memory:');
const db={execSync:s=>sql.exec(s),runSync:(s,...p)=>sql.prepare(s).run(...p),getAllSync:(s,...p)=>sql.prepare(s).all(...p),getFirstSync:(s,...p)=>sql.prepare(s).get(...p),withTransactionSync:f=>{sql.exec('BEGIN');try{f();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
const callbacks={},alerts=[];
const opened=[];
const rn={StyleSheet:{create:x=>x},Platform:{OS:'android'},Alert:{alert:(...a)=>alerts.push(a)},AppState:{addEventListener:(e,f)=>{callbacks.state=f;return{remove(){}}}},BackHandler:{addEventListener:(e,f)=>{callbacks.back=f;return{remove(){}}},exitApp(){}},
 Vibration:{vibrate(){}},Share:{share:async o=>{(global.__shared=global.__shared||[]).push(o)}},Linking:{openURL:async u=>{opened.push(u)}},useWindowDimensions:()=>({width:400,height:800})};
for(const c of ['Image','Modal','Pressable','ScrollView','Switch','Text','TextInput','View','StatusBar','KeyboardAvoidingView','ActivityIndicator'])rn[c]=c;
// FlatList simulada: dibuja encabezado, renglones y vacío como lo haría la lista virtualizada.
rn.FlatList=function FlatList(p){return React.createElement('View',null,p.ListHeaderComponent,(p.data||[]).map((item,index)=>React.createElement(React.Fragment,{key:p.keyExtractor?p.keyExtractor(item):index},p.renderItem({item,index}))),!(p.data||[]).length&&p.ListEmptyComponent)};
const original=Module._load;
Module._load=function(name,...args){
 if(name==='react-native')return rn;
 if(name==='react-native-safe-area-context')return {SafeAreaProvider:'SafeAreaProvider',SafeAreaView:'SafeAreaView'};
 if(name==='expo-sqlite')return {openDatabaseSync:()=>db};
 if(name==='expo-local-authentication')return {hasHardwareAsync:async()=>false,isEnrolledAsync:async()=>false};
 if(name.startsWith('expo-'))return {};
 return original.call(this,name,...args);
};
const App=require('../App.tsx').default;
let ui;
function text(node){if(typeof node==='string')return node;return (node.children||[]).map(text).join(' ')}
function buttons(label){return ui.root.findAll(n=>n.type==='Pressable'&&text(n).includes(label)&&typeof n.props.onPress==='function')}
async function press(label){const candidates=buttons(label);assert(candidates.length,label);await act(async()=>candidates[candidates.length-1].props.onPress());}
function exact(label){return ui.root.findAll(n=>n.type==='Pressable'&&text(n).trim()===label&&typeof n.props.onPress==='function'&&!n.props.disabled)}
async function pressExact(label,index=0){const c=exact(label);assert(c.length,label);await act(async()=>c[index].props.onPress());}
async function openCart(){const c=ui.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Abrir carrito'&&typeof n.props.onPress==='function');assert(c.length,'carrito');await act(async()=>c[0].props.onPress());}
async function emptyCart(){if(!ui.root.findAll(n=>n.props.accessibilityLabel==='Abrir carrito').length)return;await openCart();for(let i=0;i<50;i++){const q=ui.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Quitar una'&&typeof n.props.onPress==='function');if(!q.length)break;await act(async()=>q[0].props.onPress());}const c=ui.root.findAll(n=>n.type==='Pressable'&&(n.children||[]).length&&JSON.stringify(n.props.accessibilityLabel||'')==='""'&&false);await act(async()=>{});const cl=ui.root.findAll(n=>n.type==='Pressable'&&typeof n.props.onPress==='function'&&String((function t(x){return typeof x==='string'?x:(x.children||[]).map(t).join(' ')})(n)).trim()==='Cerrar');if(cl.length)await act(async()=>cl[0].props.onPress());}
async function sellFromStock(){await emptyCart();const b=ui.root.findAll(n=>n.type==='Pressable'&&typeof n.props.onPress==='function'&&!n.props.disabled&&String((function t(x){return typeof x==='string'?x:(x.children||[]).map(t).join(' ')})(n)).trim()==='🛒 Al carrito');assert(b.length,'🛒 Al carrito');await act(async()=>b[0].props.onPress());await openCart();}
async function type(label,value){const input=ui.root.findAll(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label)[0];assert(input,label);await act(async()=>input.props.onChangeText(value));}
const formOpen=()=>ui.root.findAll(n=>n.type==='Modal').some(m=>m.props.visible);
async function flush(ms=800){await act(async()=>{await new Promise(r=>setTimeout(r,ms))});}
(async()=>{
 global.__NOVA_SKIP_LOCK=true;require('./seed.cjs')(db).setSetting('appRole','owner');await act(async()=>{ui=renderer.create(React.createElement(App));});
 // 2.0: abre en Vender (categorías con fotos); el resumen está en Ventas → 📊 Resumen.
 assert(ui.root.findAll(n=>/^Categoría /.test(n.props.accessibilityLabel||'')).length>0,'abre en Vender');
 await press('Ventas');assert(text(ui.root).includes('Vendido hoy'));await press('📊 Resumen');await pressExact('Todo');
 const home=text(ui.root);
 for(const v of ['$5,409.00','$3,374.00','$1,116.00','$919.00','$37.30','$881.70','$5,371.70','$4,272.70'])assert(home.includes(v),'Resumen: '+v);
 assert(text(ui.root).includes('Ventas por forma de pago'));
 await press('Gastos operativos');assert(text(ui.root).includes('Publicidad'));
 await press('Volver');await press('Stock');
 await sellFromStock();assert(/1\s+×\s+\$/.test(text(ui.root)));
 const cash=sql.prepare("SELECT name FROM accounts WHERE kind='Efectivo'").get().name;
 const card=sql.prepare("SELECT name FROM accounts WHERE kind='Tarjeta'").get().name;
 {const transfer=sql.prepare("SELECT name FROM accounts WHERE kind='Banco'").get().name;
  require('../src/business.ts');new (require('../src/business.ts').Business)(db).setSetting('transferAccounts',[{id:'banamex',label:'Banamex',bank:'Banamex',holder:'Emmanuel M',clabe:'002180700000000000',account:'',card:'',note:''}]);
  await press(cash);assert(!text(ui.root).includes('Datos para transferencia'),'efectivo: sin datos de transferencia');
  await press(transfer);assert(text(ui.root).includes('Datos para transferencia')&&text(ui.root).includes('Banamex'),'transferencia: el dueño ve sus datos');}
 await press(cash);assert(text(ui.root).includes('Comisión que absorbe el cliente'),'2.0: en efectivo también la absorbe el cliente');
 await press(card);assert(text(ui.root).includes('Mercado Pago descuenta 4.06%'));
 assert(!text(ui.root).includes('Sumar comisión'),'2.0: sin interruptor, siempre la absorbe el cliente');assert(text(ui.root).includes('Solo lo ves tú')&&text(ui.root).includes('Recibes')&&text(ui.root).includes('Subtotal'),'desglose del dueño');
 await act(async()=>callbacks.state('background'));
 await act(async()=>ui.unmount());await act(async()=>{ui=renderer.create(React.createElement(App));});
 assert(/1\s+×\s+\$/.test(text(ui.root)));assert(text(ui.root).includes('Mercado Pago descuenta 4.06%'));
 const before=sql.prepare('SELECT count(*) n FROM sales').get().n;
 const action=buttons('Cobrar y confirmar venta')[0];
 await act(async()=>{action.props.onPress();action.props.onPress();});
 assert.equal(sql.prepare('SELECT count(*) n FROM sales').get().n,before+1);
 {const sale=sql.prepare("SELECT s.id,s.total,l.productId FROM sales s JOIN sale_lines l ON l.saleId=s.id ORDER BY s.created DESC").get();
  const price=sql.prepare('SELECT price FROM products WHERE id=?').get(sale.productId).price;
  const total=require('../src/business.ts').grossUp(price,406);
  assert.equal(sale.total,total,'2.0: el cliente absorbe la comisión');
  const net=sql.prepare("SELECT SUM(amount) n FROM ledger WHERE ref=?").get(sale.id).n;assert.equal(net,price,'2.0: después de Mercado Pago recibes tu precio exacto');}
 assert.equal(alerts.length,0,JSON.stringify(alerts));
 assert(text(ui.root).includes('Venta registrada'),'aviso de venta registrada');
 // 0.9: escribir en un formulario no relee la base en cada tecla.
 const {Business}=require('../src/business.ts');let reads=0;const origStock=Business.prototype.stock;Business.prototype.stock=function(){reads++;return origStock.call(this)};
 await press('Clientes');await pressExact('＋ Cliente');const before2=reads;
 for(const ch of ['A','An','Ana',' Ana P']) await type('Nombre *',ch);
 assert.equal(reads,before2,'stock() se volvió a leer al escribir');
 await type('Nombre *','Ana Prueba');await type('Teléfono (opcional)','55 1234 5678');
 await pressExact('Mañana');await pressExact('Guardar');
 assert(text(ui.root).includes('Ana Prueba'));assert(text(ui.root).includes('Cliente creado'));
 await pressExact('💬 WhatsApp');assert.equal(opened.at(-1),'https://wa.me/525512345678');
 // Importes flexibles y error dentro del formulario (sin ventana emergente).
 await press('Ventas');await pressExact('＋ Gasto');await type('Importe MXN *','1,250.50');assert(text(ui.root).includes('= $1,250.50'));
 await pressExact('Guardar');assert(text(ui.root).includes('Completa los campos obligatorios.'));
 await pressExact('Cerrar');
 // La sesión no guarda la autorización bajo costo ni la foto completa.
 await act(async()=>callbacks.state('background'));
 const session=JSON.parse(sql.prepare("SELECT value FROM settings WHERE key='uiSession'").get().value);assert.equal(session.allow,false);
 Business.prototype.stock=origStock;
 assert.equal(alerts.length,0,JSON.stringify(alerts));
 // 1.5: filtro de Ventas por forma de cobro (efectivo, cada cuenta de transferencia, terminal).
 {await press('Ventas');assert(text(ui.root).includes('Forma de cobro'));
  const groups=[['💵 Efectivo',"a.kind='Efectivo'"],['🏧 Terminal (tarjeta)',"a.kind='Tarjeta'"]];
  for(const a of sql.prepare("SELECT id,name FROM accounts WHERE kind IN ('Banco','Billetera')").all())groups.push(['🏦 '+a.name,`a.id='${a.id}'`]);
  let checked=0;for(const [label,cond] of groups){
   const exp=sql.prepare(`SELECT COUNT(*) n, COALESCE(SUM(t),0) amt FROM (SELECT l.ref, SUM(l.amount) t FROM ledger l JOIN accounts a ON a.id=l.accountId JOIN sales s ON s.id=l.ref WHERE l.kind IN ('sale','refund') AND s.status='confirmed' AND ${cond} GROUP BY l.ref HAVING SUM(l.amount)<>0)`).get();
   if(!exp.n)continue;
   await pressExact(label);const t=text(ui.root);
   assert(new RegExp(`(^|\\s)${exp.n}\\s+ventas?\\s+·`).test(t),label+': '+exp.n+' ventas');
   const {money}=require('../src/business.ts');assert(t.includes(`: ${money(exp.amt)}`),label+' cobrado '+money(exp.amt));checked++;
  }
  assert(checked>=3,'se revisaron efectivo, transferencia y terminal: '+checked);
  await pressExact('Todos los cobros');}
 // 0.9.3: las canceladas se ocultan y se pueden eliminar desde Ventas.
 const last=sql.prepare("SELECT id,total FROM sales WHERE channel!='Excel' ORDER BY created DESC").get();
 await press('Ventas');await press('Público general');await pressExact('Cancelar venta');
 const cancelDialog=alerts.pop();assert.equal(cancelDialog[0],'Cancelar y devolver');
 await act(async()=>cancelDialog[2].find(x=>x.text==='Confirmar devolución').onPress());
 assert.equal(sql.prepare('SELECT status FROM sales WHERE id=?').get(last.id).status,'cancelled');
 assert(text(ui.root).includes('🗑 Eliminar venta cancelada'));
 await press('Ventas');
 assert(text(ui.root).includes('1 cancelada oculta'),'cancelada oculta');
 await press('Canceladas (1)');await pressExact('🗑 Eliminar');
 const dialog=alerts.pop();assert.equal(dialog[0],'Eliminar venta cancelada');
 await act(async()=>dialog[2].find(x=>x.text==='Eliminar').onPress());
 assert.equal(sql.prepare('SELECT count(*) n FROM sales WHERE id=?').get(last.id).n,0);
 assert.equal(sql.prepare('SELECT count(*) n FROM ledger WHERE ref=?').get(last.id).n,0);
 assert(text(ui.root).includes('No hay ventas canceladas.'));
 assert.equal(alerts.length,0,JSON.stringify(alerts));
 // 0.9.6: terminal Mercado Pago (API simulada).
 global.__MP_POLL_MS=10;const mpCalls=[];let script={};
 global.fetch=async(url,init={})=>{mpCalls.push({url,method:init.method,body:init.body&&JSON.parse(init.body),headers:init.headers});
  const r=(()=>{if(url.endsWith('/users/me'))return {id:123,nickname:'NOVASUPPS'};
   if(url.includes('/terminals/v1/list')&&global.__mpPolicy)return {__status:403,code:'PA_UNAUTHORIZED_RESULT_FROM_POLICIES',message:'At least one policy returned UNAUTHORIZED.'};
   if(url.includes('/terminals/v1/list'))return {data:{terminals:[{id:'PAX_A910__SMART2',pos_id:1,operating_mode:global.__pdv&&!global.__forceStandalone?'PDV':'STANDALONE'}]}};
   if(url.includes('/terminals/v1/setup')){global.__pdv=true;return {};}
   if(url.includes('/v1/payments/search'))return {results:global.__manualPays||[]};
   if(url.endsWith('/v1/payments/9001'))return {...(global.__manualPays||[])[0],fee_details:[{type:'mercadopago_fee',amount:9.87,fee_payer:'collector'}]};
   if(url.endsWith('/v1/payments/777'))return {id:777,transaction_amount:1,authorization_code:'123456',card:{last_four_digits:'4242'},payment_method_id:'visa',payment_type_id:'credit_card',installments:1,date_approved:'2026-10-03T12:41:00.000-06:00',fee_details:[{type:'mercadopago_fee',amount:12.34,fee_payer:'collector'}]};
   if(/\/v1\/orders\/[^/]+\/refund$/.test(url))return {id:'ORDX',status:'processed',transactions:{refunds:[{id:'REF1',status:'processing'}]}};
   if(url.endsWith('/v1/orders')&&init.method==='POST')return {id:'ORD'+mpCalls.length,status:'created',transactions:{payments:[{id:'PAY1',status:'created'}]}};
   if(url.includes('/v1/orders/')&&init.method==='GET'){script.n=(script.n||0)+1;return script.n<2?{status:'at_terminal'}:script.final;}
   return {};})();
  const st=r.__status||200;return {ok:st<400,status:st,json:async()=>r};};
 await press('Parámetros');await press('Terminal Mercado Pago');
 global.__mpPolicy=true;await type('Access Token de Mercado Pago','APP_USR-prueba-123');await press('Guardar y probar conexión');
 assert(text(ui.root).includes('políticas de permisos'),'mensaje 403 políticas');assert(text(ui.root).includes('Sin configurar'));
 global.__mpPolicy=false;await type('Access Token de Mercado Pago','APP_USR-prueba-123');await press('Guardar y probar conexión');
 assert(text(ui.root).includes('NOVASUPPS'),'conexión');assert(text(ui.root).includes('1 terminal encontrada'));
 await pressExact('Activar modo Punto de Venta');
 assert.equal(mpCalls.find(c=>c.url.includes('/setup')).body.terminals[0].operating_mode,'PDV');
 await pressExact('Usar esta');assert(text(ui.root).includes('Conectada'));
 assert(!JSON.stringify(JSON.parse(new (require('../src/business.ts').Business)(db).backup())).includes('APP_USR-prueba-123'),'clave fuera del respaldo');
 // 1.0 / 2.0.3: terminal en modo normal → no se envía el cobro; se cobra directo en la terminal y la app
 // busca el pago y lo liga a la venta (o, sin datos del pago, se registra igual).
 {global.__forceStandalone=true;const n0=sql.prepare('SELECT count(*) n FROM sales').get().n;const o0=mpCalls.filter(c=>c.url.endsWith('/v1/orders')).length;
  const cobrar=async()=>{await press('Stock');await sellFromStock();await press(card);
   const tb=ui.root.findAll(n=>n.type==='Pressable'&&/Cobrar \$.* en la terminal/.test(text(n))&&typeof n.props.onPress==='function');await act(async()=>tb[0].props.onPress());for(let i=0;i<4;i++)await flush(15);};
  await cobrar();
  assert(text(ui.root).includes('está en modo normal'),'aviso modo normal');assert.equal(mpCalls.filter(c=>c.url.endsWith('/v1/orders')).length,o0,'no debe crear order');
  const amt=Math.round(Number(/Cobra \$([\d,]+\.\d{2}) directamente/.exec(text(ui.root))[1].replace(/,/g,''))*100);
  global.__manualPays=[];await pressExact('✅ Ya cobré en la terminal · buscar el pago');for(let i=0;i<8;i++)await flush(15);
  assert(text(ui.root).includes('Todavía no aparece un pago aprobado'),'sin pago aún');assert.equal(sql.prepare('SELECT count(*) n FROM sales').get().n,n0);
  global.__manualPays=[{id:9002,status:'approved',operation_type:'regular_payment',transaction_amount:amt/100,date_created:new Date().toISOString()},{id:9001,status:'approved',operation_type:'pos_payment',transaction_amount:amt/100,date_created:new Date().toISOString(),card:{last_four_digits:'5555'},payment_method_id:'master',payment_type_id:'debit_card',installments:1,authorization_code:'654321'}];
  await pressExact('✅ Ya cobré en la terminal · buscar el pago');for(let i=0;i<8;i++)await flush(15);
  assert.equal(sql.prepare('SELECT count(*) n FROM sales').get().n,n0+1,'venta ligada al pago de la terminal');
  const linked=sql.prepare("SELECT value FROM settings WHERE key LIKE 'sale:%' AND value LIKE '%PAY-9001%'").get();assert(linked,'guarda el cobro PAY-9001');
  const entry=JSON.parse(linked.value).mpPayments[0];assert.equal(entry.referenceId,'9001');assert.equal(entry.card.last4,'5555');
  for(let i=0;i<4;i++)await flush(15);assert.equal(JSON.parse(sql.prepare("SELECT value FROM settings WHERE key LIKE 'sale:%' AND value LIKE '%PAY-9001%'").get().value).mpPayments[0].realFee,987,'comisión real del pago');
  assert(text(ui.root).includes('Pago aprobado ✓'),'aprobado');await pressExact('Listo');
  // El mismo pago no se puede ligar dos veces; sin datos del pago se registra igual.
  await cobrar();await pressExact('✅ Ya cobré en la terminal · buscar el pago');for(let i=0;i<8;i++)await flush(15);
  assert(text(ui.root).includes('Todavía no aparece'),'el pago ya usado no vuelve a aparecer');assert(text(ui.root).includes('un pago por ese monto que no viene de la terminal'),'avisa del pago que no es de terminal');
  await pressExact('Registrar sin datos del pago');assert.equal(sql.prepare('SELECT count(*) n FROM sales').get().n,n0+2,'registro sin terminal');global.__forceStandalone=false;global.__manualPays=[];}
 const salesBefore=sql.prepare('SELECT count(*) n FROM sales').get().n;
 // Pago aprobado: se registra la venta con la order.
 script={final:{status:'processed',transactions:{payments:[{id:'PAY9',reference_id:'777',amount:'1.00',status:'processed',status_detail:'accredited',card:{last_digits:'4242'},payment_method:{id:'visa',type:'credit_card',installments:1}}]}}};
 await press('Stock');await sellFromStock();await press(card);
 const termBtn=ui.root.findAll(n=>n.type==='Pressable'&&/Cobrar \$.* en la terminal/.test(text(n))&&typeof n.props.onPress==='function');assert(termBtn.length,'botón terminal');
 await act(async()=>termBtn[0].props.onPress());for(let i=0;i<10;i++)await flush(15);
 const order=mpCalls.find(c=>c.url.endsWith('/v1/orders'));assert.equal(order.body.type,'point');assert.equal(order.body.config.point.terminal_id,'PAX_A910__SMART2');
 assert.equal(sql.prepare('SELECT count(*) n FROM sales').get().n,salesBefore+1,'venta aprobada registrada');
 const last2=sql.prepare("SELECT id,total FROM sales ORDER BY created DESC").get();
 assert.equal(JSON.parse(sql.prepare("SELECT value FROM settings WHERE key=?").get('sale:'+last2.id).value).mpPaymentId,'PAY9');
 assert.equal(order.body.transactions.payments[0].amount,(last2.total/100).toFixed(2));
 assert(text(ui.root).includes('Pago aprobado'));
 // 1.0.1: la comisión estimada se reemplaza por la real que reporta Mercado Pago.
 for(let i=0;i<4;i++)await flush(15);
 {const fee=sql.prepare("SELECT amount,note FROM ledger WHERE ref=? AND kind='expense'").get(last2.id);assert.equal(fee.amount,-1234,'comisión real');assert.match(fee.note,/real/);}
 // 1.0.3: al aprobarse, ofrece el comprobante de tarjeta por WhatsApp.
 {assert(text(ui.root).includes('Enviar comprobante por WhatsApp'),'oferta de comprobante');await pressExact('📲 Enviar comprobante por WhatsApp');for(let i=0;i<4;i++)await flush(15);
  assert(formOpen(),'sin teléfono pide el número');assert(text(ui.root).includes('Visa crédito •••• 4242'));assert(text(ui.root).includes('Autorización: 123456'));assert(text(ui.root).includes('Operación Mercado Pago: 777'));
  await type('WhatsApp del cliente (10 dígitos)','55 9876 5432');await pressExact('💬 Enviar por WhatsApp');for(let i=0;i<3;i++)await flush(15);
  const url=opened.at(-1);assert.match(url,/^https:\/\/wa\.me\/525598765432\?text=/);const msg=decodeURIComponent(url.split('text=')[1]);
  assert.match(msg,/Comprobante de pago con tarjeta/);assert.match(msg,/Autorización: 123456/);assert.match(msg,/•••• 4242/);assert(!formOpen(),'formulario cerrado');}
 // 1.0.1: devolución parcial desde la venta, también en Mercado Pago.
 {const v=sql.prepare("SELECT * FROM sales WHERE id=?").get(last2.id);
  await press('Ventas');await pressExact('Activas');const c=ui.root.findAll(n=>n.type==='Pressable'&&typeof n.props.onPress==='function'&&text(n).includes(v.id.slice(-8).toUpperCase()));await act(async()=>c[0].props.onPress());
  await pressExact('↩️ Devolver productos / modificar venta');await type('Nuevo total MXN',((v.total-5000)/100).toFixed(2));
  assert(text(ui.root).includes('Devolver al cliente'));assert(text(ui.root).includes('también en Mercado Pago'));
  await pressExact('Devolver y guardar cambios');for(let i=0;i<4;i++)await flush(15);
  const ref=mpCalls.find(c=>/\/refund$/.test(c.url));assert(ref,'devolución enviada');assert.equal(ref.body.transactions[0].amount,'50.00');assert.equal(ref.body.transactions[0].id,'PAY9');
  assert.equal(sql.prepare("SELECT total FROM sales WHERE id=?").get(v.id).total,v.total-5000);
  assert.equal(sql.prepare("SELECT SUM(amount) n FROM ledger WHERE ref=? AND kind='sale'").get(v.id).n,v.total-5000);
  assert(text(ui.root).includes('devueltos en Mercado Pago'));}
 // Pago rechazado: no se registra nada.
 script={final:{status:'failed',transactions:{payments:[{status:'failed',status_detail:'rejected_by_issuer'}]}}};
 await press('Stock');await sellFromStock();await press(card);
 const termBtn2=ui.root.findAll(n=>n.type==='Pressable'&&/Cobrar \$.* en la terminal/.test(text(n))&&typeof n.props.onPress==='function');
 await act(async()=>termBtn2[0].props.onPress());for(let i=0;i<10;i++)await flush(15);
 assert(text(ui.root).includes('el banco rechazó la tarjeta'));assert.equal(sql.prepare('SELECT count(*) n FROM sales').get().n,salesBefore+1,'rechazado no registra');
 // 1.0.1: abono con tarjeta cobrado en la terminal.
 const bb=new (require('../src/business.ts').Business)(db);
 const credit=bb.sell([{productId:sql.prepare("SELECT p.id FROM products p JOIN lots l ON l.productId=p.id WHERE l.qty>0").get().id,qty:1}],20000,0,null,sql.prepare('SELECT id FROM customers').get().id,null,'Mostrador',true);
 await pressExact('Cerrar');await pressExact('Cerrar');
 script={final:{status:'processed',transactions:{payments:[{id:'PAY10',reference_id:'777',status:'processed',status_detail:'accredited'}]}}};
 await press('Ventas');await pressExact('Por cobrar');const ab=exact('Abonar');await act(async()=>ab[0].props.onPress());await pressExact(card);
 const abBtn=ui.root.findAll(n=>n.type==='Pressable'&&/Cobrar abono de \$200\.00 en la terminal/.test(text(n))&&typeof n.props.onPress==='function');assert(abBtn.length,'botón abono en terminal');
 await act(async()=>abBtn[0].props.onPress());for(let i=0;i<12;i++)await flush(15);
 assert.equal(sql.prepare("SELECT SUM(amount) n FROM ledger WHERE ref=? AND kind='sale'").get(credit).n,20000,'abono aprobado registrado');
 assert.equal(JSON.parse(sql.prepare("SELECT value FROM settings WHERE key=?").get('sale:'+credit).value).mpPayments[0].paymentId,'PAY10');
 assert(!formOpen(),'formulario de abono cerrado');
 assert.equal(alerts.length,0,JSON.stringify(alerts));
 await act(async()=>ui.unmount());
 console.log('UI PASS: resumen neto, Control Operativo, Stock → carrito, comisión visible, borrador al reiniciar, doble cobro, sin relecturas al escribir, fechas rápidas, WhatsApp, importes flexibles, error en formulario, canceladas y terminal Mercado Pago (modo PDV, aprobado/rechazado, comisión real, devolución parcial, abono en terminal).');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
