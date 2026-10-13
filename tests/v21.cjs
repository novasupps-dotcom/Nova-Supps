// 2.1 · Promociones (dueño, vendedor y servidor iguales), reportes por producto y vendedor,
// catálogo para clientes (WhatsApp y PDF) y respaldo automático en la nube.
const fs=require('fs'),Module=require('module'),ts=require('typescript'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
global.IS_REACT_ACT_ENVIRONMENT=true;global.__NOVA_NO_FOLLOW_ALERT=true;
for(const extension of ['.ts','.tsx']) require.extensions[extension]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,file);
require.extensions['.jpg']=(m,file)=>m.exports={asset:file};
const React=require('react'),renderer=require('react-test-renderer'),{act}=renderer;
const mk=()=>{const sql=new DatabaseSync(':memory:');return {sql,db:{execSync:s=>sql.exec(s),runSync:(s,...p)=>sql.prepare(s).run(...p),getAllSync:(s,...p)=>sql.prepare(s).all(...p),getFirstSync:(s,...p)=>sql.prepare(s).get(...p),withTransactionSync:f=>{sql.exec('BEGIN');try{f();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}}}};
const O=mk(),S=mk();let current=O.db;
const alerts=[],opened=[],shared=[];
const rn={StyleSheet:{create:x=>x},Platform:{OS:'android'},Alert:{alert:(...a)=>alerts.push(a)},AppState:{addEventListener:()=>({remove(){}})},BackHandler:{addEventListener:()=>({remove(){}}),exitApp(){}},
 Vibration:{vibrate(){}},Share:{share:async o=>{shared.push(o)}},Linking:{openURL:async u=>{opened.push(u)}},useWindowDimensions:()=>({width:400,height:800})};
for(const c of ['Image','Modal','Pressable','ScrollView','Switch','Text','TextInput','View','StatusBar','KeyboardAvoidingView','ActivityIndicator'])rn[c]=c;
rn.FlatList=function FlatList(p){return React.createElement('View',null,p.ListHeaderComponent,(p.data||[]).map((item,index)=>React.createElement(React.Fragment,{key:p.keyExtractor?p.keyExtractor(item):index},p.renderItem({item,index}))),!(p.data||[]).length&&p.ListEmptyComponent)};
const written={},sharedFiles=[];
const fsMock={documentDirectory:'file:///doc/',cacheDirectory:'file:///cache/',EncodingType:{Base64:'base64'},writeAsStringAsync:async(u,v,o)=>{written[u]={v,o}},readAsStringAsync:async(u,o)=>{if(!written[u])throw new Error('no existe '+u);return written[u].v},readDirectoryAsync:async()=>Object.keys(written).filter(u=>u.startsWith('file:///doc/')).map(u=>u.replace('file:///doc/','')),deleteAsync:async u=>{delete written[u]},makeDirectoryAsync:async()=>{}};
const original=Module._load;
Module._load=function(name,...args){
 if(name==='react-native')return rn;
 if(name==='react-native-safe-area-context')return {SafeAreaProvider:'SafeAreaProvider',SafeAreaView:'SafeAreaView'};
 if(name==='expo-sqlite')return {openDatabaseSync:()=>current};
 if(name==='expo-local-authentication')return {hasHardwareAsync:async()=>false,isEnrolledAsync:async()=>false};
 if(name==='expo-file-system/legacy')return fsMock;
 if(name==='expo-sharing')return {isAvailableAsync:async()=>true,shareAsync:async(u,o)=>sharedFiles.push({u,o})};
 if(name.startsWith('expo-'))return {};
 return original.call(this,name,...args);
};
const {screenIssues}=require('./screenCheck.cjs');const okScreen=(ui,where)=>{const bad=screenIssues(ui,where);assert.deepEqual(bad,[],bad.join('\n'))};
const {createFake}=require('./fakeSupabase.cjs');const fake=createFake();global.fetch=fake.fetch;global.__STORE_CLOUD={url:fake.BASE,anonKey:fake.ANON};
global.__NOVA_SKIP_LOCK=true;global.__SEARCH_MS=1;global.__MP_POLL_MS=10;global.__SELLER_SYNC_MS=10**8;global.__OWNER_SYNC_MS=10**8;
const App=require('../App.tsx').default;const {Business,money}=require('../src/business.ts');
function text(node){if(typeof node==='string')return node;return (node.children||[]).map(text).join(' ')}
const H=(ui)=>({
 all:()=>text(ui.root),
 btn:(label)=>ui.root.findAll(n=>n.type==='Pressable'&&text(n).trim()===label&&typeof n.props.onPress==='function'),
 async press(label,i=0){let c=this.btn(label);if(!c.length)c=ui.root.findAll(n=>n.type==='Pressable'&&text(n).includes(label)&&typeof n.props.onPress==='function').slice(-1);assert(c.length,'botón '+label);await act(async()=>c[i].props.onPress());},
 async pressLike(re){const c=ui.root.findAll(n=>n.type==='Pressable'&&re.test(text(n))&&typeof n.props.onPress==='function');assert(c.length,'botón '+re);await act(async()=>c[c.length-1].props.onPress());},
 async code(label,raw){for(const ch of raw){const i=ui.root.findAll(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label);assert(i.length,'campo '+label);await act(async()=>i[0].props.onChangeText(String(i[0].props.value||'')+ch));}},
 // 2.0.1: Vender tiene dos pantallas: productos (fotos) y carrito. add() elige el producto y abre el carrito.
 async add(name){const back=this.btn('‹ Agregar más productos');if(back.length)await act(async()=>back[0].props.onPress());
  assert(!ui.root.findAll(n=>n.props.accessibilityLabel==='Quitar una').length,'la pantalla de productos no muestra el carrito');
  await this.type('Buscar producto',name);const t=ui.root.findAll(n=>n.props.accessibilityLabel==='Agregar '+name&&typeof n.props.onPress==='function');assert(t.length,'foto de '+name);await act(async()=>t[0].props.onPress());
  const bar=ui.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Ver carrito'&&typeof n.props.onPress==='function');assert(bar.length,'barra Ver carrito');await act(async()=>bar[0].props.onPress());
  assert(!ui.root.findAll(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Buscar producto').length&&!ui.root.findAll(n=>/^Agregar (?!una|otra)/.test(n.props.accessibilityLabel||'')).length,'el carrito es otra pantalla: sin la cuadrícula de productos');},
 async type(label,v){const i=ui.root.findAll(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label);assert(i.length,'campo '+label);await act(async()=>i[0].props.onChangeText(v));},
 async sw(){const s=ui.root.findAll(n=>n.type==='Switch'&&!n.props.disabled);await act(async()=>s[s.length-1].props.onValueChange(true));},
});
const flush=async(n=6,ms=15)=>{for(let i=0;i<n;i++)await act(async()=>{await new Promise(r=>setTimeout(r,ms))})};
(async()=>{
 // ---------- Dueño ----------
 const ob=require('./seed.cjs')(O.db);ob.setSetting('appRole','owner');
 let owner;current=O.db;await act(async()=>{owner=renderer.create(React.createElement(App))});await flush();const o=H(owner);
 ob.setSetting('mpConfig',{token:'APP_USR-owner',terminalId:'NEWLAND_N950__X',terminalLabel:'N950',enabled:true});
 await o.press('Parámetros');await o.press('Invitar, formas de pago y sincronizar');assert(o.all().includes('Vende con varios teléfonos'));
 await o.type('Tu nombre','Emmanuel');await o.type('Tu correo *','dueno@gns.mx');await o.type('Contraseña (mínimo 6) *','secreto1');
 await o.press('Crear cuenta de dueño');await flush(10);
 assert(o.all().includes('Base en línea'),'conectado');assert(fake.T.members.some(m=>m.role==='owner'&&m.name==='Emmanuel'));assert(fake.T.catalog.length>30,'catálogo publicado');
 await o.sw();await flush(8);assert.equal(fake.T.config.find(c=>c.key==='terminal').value.enabled,true,'terminal habilitada para vendedores');
 fake.state.signupDisabled=true;await o.type('Nombre del vendedor *','Luis');await o.press('🎟️ Crear código de invitación');await flush(4);const code=fake.T.invites[0].code;const pretty=`GNS-${code.slice(3,7)}-${code.slice(7)}`;assert(o.all().includes(pretty),'muestra el código');await o.press('📨 Enviar por WhatsApp');const invite=shared.at(-1).message;assert(invite.includes(pretty)&&!invite.includes('supabase'),'mensaje con código corto');
 console.log('  ✓ dueño conecta, publica catálogo, habilita terminal e invita');
 // ---------- Vendedor ----------
 let seller;current=S.db;await act(async()=>{seller=renderer.create(React.createElement(App))});await flush();const s=H(seller);
 assert(s.all().includes('Inicia sesión'));await s.press('Tengo un código de invitación');
 await s.type('Código de invitación (solo para cuenta nueva)','x');await s.type('Código de invitación (solo para cuenta nueva)',pretty);assert(s.all().includes('no se puede pegar'),'no deja pegar el código');
 await s.type('Código de invitación (solo para cuenta nueva)','');await s.code('Código de invitación (solo para cuenta nueva)',code.slice(3).toLowerCase());assert.equal(seller.root.findAll(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Código de invitación (solo para cuenta nueva)')[0].props.value,`${code.slice(3,7)}-${code.slice(7)}`,'pone el guion solo');await s.type('Tu nombre *','Luis');await s.type('Tu correo *','luis@gns.mx');await s.type('Contraseña *','secreto22');
 await s.press('Crear mi cuenta');await flush(10);assert(!s.all().includes('Soy vendedor nuevo'),'entra con el código');assert.equal(fake.T.invites[0].used_by!==null,true,'código usado');

 await o.press('Actualizar lista');await flush();
 const {grossUp,saleSegment}=require('../src/business.ts');const client=(x)=>grossUp(x,406);
 // ---------- 1. Promoción 2x1 en Creatinas (dueño) ----------
 await o.press('Parámetros');await o.press('Promociones');assert(o.all().includes('Aún no tienes promociones'));
 await o.press('＋ Nueva promoción');await o.type('Nombre que verá el cliente *','2x1 Creatinas');
 await o.press('Una categoría');await o.press('Creatinas');
 assert(o.all().includes('lleva 2 y paga 1'),'ejemplo de la promoción');assert(o.all().includes('debajo de su costo'),'avisa que el 2x1 queda debajo del costo');okScreen(owner,'dueño · editor de promoción');
 await o.press('Guardar promoción');await flush(8);
 assert.equal(ob.promos().length,1);const promo=ob.promos()[0];assert.deepEqual([promo.kind,promo.n,promo.m,promo.target,promo.ref],['nxm',2,1,'segment','Creatinas']);
 assert(o.all().includes('🏷️ 2x1 Creatinas')&&o.all().includes('2x1'),'lista de promociones');
 await o.press('🔄 Sincronizar ahora').catch(()=>{});
 await o.press('Parámetros');await o.press('Invitar, formas de pago y sincronizar');await o.press('🔄 Sincronizar ahora');await flush(10);
 assert.equal(fake.T.config.find(c=>c.key==='promos').value.list.length,1,'promociones publicadas al servidor');
 const cre=ob.stock().filter(p=>!p.archived&&saleSegment(p)==='Creatinas'&&p.available>=4).sort((a,b)=>a.name<b.name?-1:1)[0];assert(cre,'creatina con existencias');
 assert.equal(fake.T.catalog.find(c=>c.product_id===cre.id).segment,'Creatinas','categoría publicada');
 console.log('  ✓ el dueño crea la promoción 2x1 por categoría y se publica');
 // ---------- 2. El dueño vende 2 → paga 1 ----------
 await o.press('Vender');await o.type('Buscar producto',cre.name);
 assert(owner.root.findAll(n=>n.type==='Text'&&String(text(n)).includes('🏷️ 2x1')).length,'la foto muestra la promoción');
 {const add=owner.root.findAll(n=>n.props.accessibilityLabel==='Agregar '+cre.name&&typeof n.props.onPress==='function');await act(async()=>add[0].props.onPress());}
 {const more=owner.root.findAll(n=>n.props.accessibilityLabel==='Agregar otra de '+cre.name&&typeof n.props.onPress==='function');await act(async()=>more[0].props.onPress());}
 {const cart=owner.root.findAll(n=>n.props.accessibilityLabel==='Abrir carrito'&&typeof n.props.onPress==='function');await act(async()=>cart[0].props.onPress());}
 const cash=ob.all("SELECT name FROM accounts WHERE kind='Efectivo'")[0].name;await o.press(cash);
 assert(o.all().includes('Descuento · 2x1 Creatinas'),'el cobro muestra la promoción');assert(o.all().includes('Se permite porque tú la configuraste'),'aviso de venta debajo del costo por promoción');okScreen(owner,'dueño · carrito con promoción');
 const n0=ob.sales().length;await o.press('Cobrar y confirmar venta');await flush(10);
 assert.equal(ob.sales().length,n0+1,'venta del dueño con promoción');
 {const v=ob.saleDetail(ob.sales()[0].id);assert.equal(v.total,client(cre.price),'2x1: paga una (con la comisión)');assert.equal(v.lines[0].discount,cre.price,'el renglón guarda el descuento');assert.deepEqual(v.promos,[{name:'2x1 Creatinas',amount:cre.price}]);
  const receipt=require('../src/receipt.ts').saleReceiptText(v);assert(receipt.includes('Descuento')&&!/Comisi[oó]n/.test(receipt),'comprobante con descuento: '+receipt);}
 console.log('  ✓ dueño: 2 piezas de creatina → paga 1 (más la comisión), comprobante con descuento');
 // ---------- 3. El vendedor ve y cobra lo mismo que el servidor ----------
 await s.press('Cuenta');await s.press('🔄 Actualizar ahora');await flush(8);await s.press('Vender');
 await s.add(cre.name);{const plus=seller.root.findAll(n=>n.props.accessibilityLabel==='Agregar una');await act(async()=>plus[0].props.onPress());}
 assert(s.all().includes('Descuento · 2x1 Creatinas'),'el vendedor ve la promoción');assert(s.all().includes(money(client(cre.price))),'total con la promoción');okScreen(seller,'vendedor · carrito con promoción');
 fake.T.legacy20=true;const nSales=fake.T.sales.length;await s.press('Efectivo');await s.press('Registrar venta');await flush(8);
 assert(s.all().includes('El servidor aún no tiene las promociones'),'servidor sin schema 2.1: no cobra con promoción');assert.equal(fake.T.sales.length,nSales);fake.T.legacy20=false;
 await s.press('Efectivo');await s.press('Registrar venta');await flush(8);
 const sv=fake.T.sales.at(-1);assert.equal(sv.status,'pendiente','el total del vendedor cuadra con el servidor: '+sv.error);assert.equal(sv.total,client(cre.price));assert.equal(sv.promo,cre.price);assert.equal(sv.items[0].promo,'2x1 Creatinas');
 {const r=require('../src/sellerCore.ts').receiptSale((new Business(S.db).setting('sellerToday',null)?.rows||[]).find(x=>x.id===sv.id)||{...sv,promo:cre.price});const cv=require('../src/business.ts').customerView(r);assert.equal(cv.total,client(cre.price));assert(cv.discount>0,'el comprobante del vendedor muestra el descuento');}
 await o.press('Parámetros');await o.press('Invitar, formas de pago y sincronizar');await o.press('🔄 Sincronizar ahora');await flush(12);
 {const v=ob.sales().find(x=>x.seller==='Luis');assert(v,'el dueño registra la venta del vendedor');const d=ob.saleDetail(v.id);assert.equal(d.total,client(cre.price));assert.equal(d.lines[0].discount,cre.price);}
 console.log('  ✓ vendedor: la misma promoción, el servidor confirma el total y el dueño la registra');
 // ---------- 3b. Lector de códigos (USB/Bluetooth: escribe el código y manda Enter) ----------
 const scan=async(ui,code)=>{const i=ui.root.findAll(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Buscar producto');assert(i.length,'buscador');await act(async()=>i[0].props.onChangeText(code));
  const j=ui.root.findAll(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Buscar producto');await act(async()=>j[0].props.onSubmitEditing());};
 {const other=ob.stock().find(p=>!p.archived&&p.available>=2&&p.id!==cre.id&&p.sku);
  await o.press('Vender');await scan(owner,'  '+other.sku.toLowerCase()+' ');
  assert.equal(owner.root.findAll(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Buscar producto')[0].props.value,'','limpia el buscador para el siguiente código');
  assert(o.all().includes('Carrito · 1 pieza'),'el dueño agrega con el lector (SKU): '+o.all().slice(-400));
  await scan(owner,'NO-EXISTE-123');assert(o.all().includes('Carrito · 1 pieza'),'código desconocido no agrega nada');
  // Vendedor: código de barras publicado por el dueño.
  fake.T.catalog.find(c=>c.product_id===other.id).barcode='7501234567890';
  await s.press('Cuenta');await s.press('🔄 Actualizar ahora');await flush(8);await s.press('Vender');
  {const back=s.btn('‹ Agregar más productos');if(back.length)await act(async()=>back[0].props.onPress());}
  await scan(seller,'7501234567890');
  assert(seller.root.findAll(n=>n.props.accessibilityLabel==='Ver carrito').length&&s.all().includes('Ver carrito · 1 pieza'),'el vendedor agrega con el lector (código de barras): '+s.all().slice(-300));}
 console.log('  ✓ lector de códigos: SKU o código de barras + Enter agrega al carrito (dueño y vendedor)');
 // ---------- 4. Reportes ----------
 await o.press('Parámetros');await o.press('Reportes');
 {const t=o.all();assert(t.includes('Por producto')&&t.includes(cre.name)&&t.includes('Por vendedor')&&t.includes('Luis')&&t.includes('Tú (dueño)')&&t.includes('Promociones')&&t.includes('2x1 Creatinas'),'reporte: '+t.slice(0,600));}
 {const {salesReport}=require('../src/reports.ts');const {exportRange}=require('../src/salesExcel.ts');const r=salesReport(ob,exportRange('Este mes'));
  const p=r.products.find(x=>x.productId===cre.id);assert.equal(p.units,4);assert.equal(p.revenue,2*cre.price,'importe en tu precio (con 2x1)');assert.equal(p.discount,2*cre.price);
  assert.equal(r.promos[0].amount,2*cre.price);assert.equal(r.sellers.find(x=>x.seller==='Luis').sales,1);
  const sheets=require('../src/salesExcel.ts').salesSheets(ob,exportRange('Este mes')).sheets.map(x=>x.name);assert(sheets.includes('Por producto')&&sheets.includes('Por vendedor'),'Excel con hojas nuevas: '+sheets);}
 okScreen(owner,'dueño · Reportes');
 console.log('  ✓ reportes por producto, por vendedor y de promociones (pantalla y Excel)');
 // ---------- 5. Catálogo para clientes ----------
 await o.press('Parámetros');await o.press('Catálogo para clientes');
 await o.type('WhatsApp de la tienda para pedidos (10 dígitos)','55 1234 5678');
 await o.press('Creatinas');
 await o.press('💬 Compartir mensaje de WhatsApp');await flush(2);
 assert(!shared.at(-1).message.includes(cre.name+' —'),'sin existencias no sale en el catálogo');
 {const sw=owner.root.findAll(n=>n.type==='Switch'&&n.props.accessibilityLabel==='Incluir productos sin existencias');await act(async()=>sw[0].props.onValueChange(true));}
 await o.press('💬 Compartir mensaje de WhatsApp');await flush(2);
 {const msg=shared.at(-1).message;assert(msg.includes('*Creatinas*')&&msg.includes(cre.name)&&msg.includes(money(client(cre.price)))&&msg.includes('🏷️ 2x1')&&msg.includes('Pedidos por WhatsApp: 55 1234 5678'),'mensaje: '+msg);assert(!msg.includes('*Proteínas*'),'solo la categoría elegida');}
 assert.equal(ob.setting('storeWhatsapp',''),'5512345678');okScreen(owner,'dueño · Catálogo para clientes');
 await o.press('📄 Crear PDF con fotos');for(let i=0;i<6;i++)await flush(6);
 {const f=Object.keys(written).find(u=>/Catalogo_Nova_.*\.pdf$/.test(u));assert(f,'PDF guardado');const pdf=Buffer.from(written[f].v,'base64');assert.equal(pdf.slice(0,5).toString(),'%PDF-');
  const dir=fs.mkdtempSync(require('path').join(require('os').tmpdir(),'cat-'));fs.writeFileSync(dir+'/c.pdf',pdf);
  try{const info=require('child_process').execFileSync('pdfinfo',[dir+'/c.pdf']).toString();assert(/Pages:\s+\d+/.test(info),'pdf válido');}catch(e){if(e.code!=='ENOENT')throw e}
  assert(pdf.includes('/DCTDecode'),'con fotos');assert.equal(sharedFiles.at(-1).o.mimeType,'application/pdf');}
 console.log('  ✓ catálogo para clientes: mensaje de WhatsApp por categoría y PDF con fotos y promociones');
 // ---------- 6. Respaldo en la nube ----------
 assert.ok(fake.T.owner_backups.some(x=>x.complete),'la sincronización ya hizo el respaldo automático del día');
 const auto=fake.T.owner_backups.find(x=>x.complete);assert(auto.parts>=1&&fake.T.owner_backup_parts.filter(p=>p.backup_id===auto.id).length===auto.parts);
 await o.press('Parámetros');await o.press('Respaldo y Excel');await flush(6);
 assert(o.all().includes('Respaldo automático en la nube')&&o.all().includes('Último respaldo'),'tarjeta de respaldo en la nube');
 const sales1=ob.sales().length;
 await o.press('☁️ Respaldar ahora');for(let i=0;i<4;i++)await flush(6);
 assert(o.all().includes('Respaldo guardado en la nube'));okScreen(owner,'dueño · Respaldo en la nube');assert.equal(fake.T.owner_backups.filter(x=>x.complete).length,2);
 // Algo cambia en el teléfono… y se restaura el respaldo más reciente.
 ob.saveCustomer({name:'Cliente borrable',phone:'5599999999'});const cust1=ob.customers().length;
 await o.press('Parámetros');await o.press('Respaldo y Excel');await flush(4);
 {const r=owner.root.findAll(n=>n.type==='Pressable'&&text(n).trim()==='Restaurar'&&typeof n.props.onPress==='function');assert(r.length>=2,'lista de respaldos');await act(async()=>r[0].props.onPress());
  const dlg=alerts.at(-1);assert.equal(dlg[0],'Restaurar respaldo');await act(async()=>dlg[2].find(x=>x.text==='Restaurar').onPress());for(let i=0;i<6;i++)await flush(6);}
 const ob2=new Business(O.db);assert.equal(ob2.customers().length,cust1-1,'restaurado: sin el cliente nuevo');assert.equal(ob2.sales().length,sales1,'mismas ventas');
 assert(Object.keys(written).some(u=>u.includes('Nova-antes-de-restaurar')),'copia previa local');
 // Un respaldo dañado no se restaura.
 {const {listBackups,downloadBackup}=require('../src/cloudBackup.ts');const {Cloud}=require('../src/cloud.ts');
  const c=new Cloud(ob2.setting('cloudConfig',null),ob2.setting('cloudSession',null),()=>{},fake.fetch);c.device=require('../src/device.ts').deviceId(ob2);
  const list=await listBackups(c);assert.equal(list.length,2);
  const raw=await downloadBackup(c,list[1]);const fresh=mk();const nb=new Business(fresh.db);nb.restore(raw);assert.ok(nb.sales().length>0,'otro teléfono restaura desde la nube');
  const part=fake.T.owner_backup_parts.find(p=>p.backup_id===list[0].id);part.data='AAAA'+part.data.slice(4);
  await assert.rejects(downloadBackup(c,list[0]),/no pasó la verificación|incompleto/);}
 // Se conservan solo los últimos 10.
 {const {uploadBackup,KEEP_BACKUPS}=require('../src/cloudBackup.ts');const {Cloud}=require('../src/cloud.ts');const c=new Cloud(ob2.setting('cloudConfig',null),ob2.setting('cloudSession',null),()=>{},fake.fetch);c.device=require('../src/device.ts').deviceId(ob2);
  for(let i=0;i<10;i++)await uploadBackup(ob2,c,'test');assert.equal(fake.T.owner_backups.filter(x=>x.complete).length,KEEP_BACKUPS,'conserva los últimos '+KEEP_BACKUPS);
  assert.ok(fake.T.owner_backup_parts.every(p=>fake.T.owner_backups.some(b=>b.id===p.backup_id)),'sin pedazos huérfanos');}
 // Un vendedor no puede ver los respaldos del dueño.
 {const {Cloud}=require('../src/cloud.ts');const sb=new Business(S.db);const c=new Cloud(sb.setting('cloudConfig',null)||ob2.setting('cloudConfig',null),sb.setting('cloudSession',null),()=>{},fake.fetch);assert(c.session,'sesión del vendedor');
  const seen=await c.select('owner_backups','select=id').catch(()=>[]);assert.equal(seen.length,0,'el vendedor no ve respaldos');
  const parts=await c.select('owner_backup_parts','select=part').catch(()=>[]);assert.equal(parts.length,0,'ni sus pedazos');
  await assert.rejects(c.insert('owner_backups',{id:'00000000-0000-4000-8000-000000000000',bytes:1,parts:1,sha256:'x',app_version:'x',device:'x',complete:true}),'el vendedor no puede subir respaldos');}
 // Servidor sin el schema 2.1: mensaje claro y no se reintenta en cada sincronización.
 {const {uploadBackup,listBackups,backupDue,NEEDS_SCHEMA}=require('../src/cloudBackup.ts');const {Cloud}=require('../src/cloud.ts');const c=new Cloud(ob2.setting('cloudConfig',null),ob2.setting('cloudSession',null),()=>{},fake.fetch);c.device=require('../src/device.ts').deviceId(ob2);
  fake.T.legacyBackups=true;
  await assert.rejects(uploadBackup(ob2,c,'test'),e=>e.message===NEEDS_SCHEMA);await assert.rejects(listBackups(c),e=>e.message===NEEDS_SCHEMA);
  const fresh2=mk();const nb=new Business(fresh2.db);assert.equal(backupDue(nb),true,'sin respaldo: toca');
  nb.setSetting('cloudBackupError',{at:new Date().toISOString(),text:NEEDS_SCHEMA});assert.equal(backupDue(nb),false,'recién falló: espera');assert.equal(backupDue(nb,Date.now()+4*3600e3),true,'reintenta horas después');
  assert(!nb.backup().includes('cloudBackupError'),'el error no viaja en el respaldo');
  fake.T.legacyBackups=false;}
 console.log('  ✓ respaldo en la nube: automático al sincronizar, manual, restaurar con copia previa, verificación y últimos 10');
 // ---------- 7. Base en línea sin el schema 2.1: la sincronización no se detiene ----------
 {const ob3=new Business(O.db);ob3.setSetting('cloudPub',null);fake.T.legacyCatalog=true;for(const c of fake.T.catalog){delete c.segment;delete c.barcode;}
  await o.press('Parámetros');await o.press('Invitar, formas de pago y sincronizar');await o.press('🔄 Sincronizar ahora');await flush(10);
  assert(!o.all().includes('Con error'),'sincroniza con la base anterior: '+o.all().slice(0,400));assert.equal(ob3.setting('cloudNeedsSchema21',null),true);assert(o.all().includes('supabase/schema.sql (2.1)'),'avisa que actualice la base');
  assert(fake.T.catalog.every(c=>!('segment' in c)),'publicado sin las columnas nuevas');
  fake.T.legacyCatalog=false;await o.press('🔄 Sincronizar ahora');await flush(10);
  assert.equal(ob3.setting('cloudNeedsSchema21',null),null,'base actualizada: quita el aviso');assert(!o.all().includes('supabase/schema.sql (2.1)'));
  assert.equal(fake.T.catalog.find(c=>c.product_id===cre.id).segment,'Creatinas','vuelve a publicar todo con categoría');okScreen(owner,'dueño · Base en línea');}
 console.log('  ✓ base en línea anterior a 2.1: sincroniza sin las columnas nuevas, avisa y se corrige sola al actualizar');
 process.exit(0);

})().catch(e=>{console.error(e);process.exit(1)});
