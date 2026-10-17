// Multiusuario en pantalla: el dueño conecta y aprueba, el vendedor vende (efectivo, tarjeta y sin internet).
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
const original=Module._load;
Module._load=function(name,...args){
 if(name==='react-native')return rn;
 if(name==='react-native-safe-area-context')return {SafeAreaProvider:'SafeAreaProvider',SafeAreaView:'SafeAreaView'};
 if(name==='expo-sqlite')return {openDatabaseSync:()=>current};
 if(name==='expo-local-authentication')return {hasHardwareAsync:async()=>false,isEnrolledAsync:async()=>false};
 if(name.startsWith('expo-'))return {};
 return original.call(this,name,...args);
};
const {createFake}=require('./fakeSupabase.cjs');const fake=createFake();global.fetch=fake.fetch;global.__STORE_CLOUD={url:fake.BASE,anonKey:fake.ANON};
global.__NOVA_SKIP_LOCK=true;global.__SEARCH_MS=1;global.__MP_POLL_MS=10;global.__SELLER_SYNC_MS=10**8;global.__OWNER_SYNC_MS=10**8;
const App=require('../App.tsx').default;const {Business,money}=require('../src/business.ts');
function text(node){if(typeof node==='string')return node;return (node.children||[]).map(text).join(' ')}
const H=(ui)=>({
 all:()=>text(ui.root),
 btn:(label)=>ui.root.findAll(n=>n.type==='Pressable'&&text(n).trim()===label&&typeof n.props.onPress==='function'),
 async press(label,i=0){if(label==='Ajustes'&&!ui.root.findAll(n=>n.type==='Pressable'&&(n.props.accessibilityLabel==='Ajustes'||text(n).trim()==='Ajustes')).length){const v=ui.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityState&&'selected' in n.props.accessibilityState&&text(n).trim()==='Vender');if(v.length)await act(async()=>v[v.length-1].props.onPress());}if(label==='Cuenta'&&!ui.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Cuenta').length&&text(ui.root).includes('Cerrar sesión'))return;let c=this.btn(label);if(!c.length)c=ui.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel===label&&typeof n.props.onPress==='function');if(!c.length)c=ui.root.findAll(n=>n.type==='Pressable'&&text(n).includes(label)&&typeof n.props.onPress==='function').slice(-1);assert(c.length,'botón '+label);await act(async()=>c[i].props.onPress());},
 async pressLike(re){const c=ui.root.findAll(n=>n.type==='Pressable'&&re.test(text(n))&&typeof n.props.onPress==='function');assert(c.length,'botón '+re);await act(async()=>c[c.length-1].props.onPress());},
 async code(label,raw){for(const ch of raw){const i=ui.root.findAll(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label);assert(i.length,'campo '+label);await act(async()=>i[0].props.onChangeText(String(i[0].props.value||'')+ch));}},
 // 2.0.1: Vender tiene dos pantallas: productos (fotos) y carrito. add() elige el producto y abre el carrito.
 async add(name){const back=this.btn('Agregar más productos');if(back.length)await act(async()=>back[0].props.onPress());
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
 await o.press('Ajustes');await o.press('Invitar, formas de pago y sincronizar');assert(o.all().includes('Vende con varios teléfonos'));
 await o.type('Tu nombre','Emmanuel');await o.type('Tu correo *','dueno@gns.mx');await o.type('Contraseña (mínimo 6) *','secreto1');
 await o.press('Crear cuenta de dueño');await flush(10);
 assert(o.all().includes('Base en línea'),'conectado');assert(fake.T.members.some(m=>m.role==='owner'&&m.name==='Emmanuel'));assert(fake.T.catalog.length>30,'catálogo publicado');
 await o.sw();await flush(8);assert.equal(fake.T.config.find(c=>c.key==='terminal').value.enabled,true,'terminal habilitada para vendedores');
 fake.state.signupDisabled=true;await o.type('Nombre del vendedor *','Luis');await o.press('Crear código de invitación');await flush(4);const code=fake.T.invites[0].code;const pretty=`GNS-${code.slice(3,7)}-${code.slice(7)}`;assert(o.all().includes(pretty),'muestra el código');await o.press('Enviar por WhatsApp');const invite=shared.at(-1).message;assert(invite.includes(pretty)&&!invite.includes('supabase'),'mensaje con código corto');
 console.log('  ✓ dueño conecta, publica catálogo, habilita terminal e invita');
 // ---------- Vendedor ----------
 let seller;current=S.db;await act(async()=>{seller=renderer.create(React.createElement(App))});await flush();const s=H(seller);
 assert(s.all().includes('Inicia sesión'));await s.press('Tengo un código de invitación');
 await s.type('Código de invitación (solo para cuenta nueva)','x');await s.type('Código de invitación (solo para cuenta nueva)',pretty);assert(s.all().includes('no se puede pegar'),'no deja pegar el código');
 await s.type('Código de invitación (solo para cuenta nueva)','');await s.code('Código de invitación (solo para cuenta nueva)',code.slice(3).toLowerCase());assert.equal(seller.root.findAll(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Código de invitación (solo para cuenta nueva)')[0].props.value,`${code.slice(3,7)}-${code.slice(7)}`,'pone el guion solo');await s.type('Tu nombre *','Luis');await s.type('Tu correo *','luis@gns.mx');await s.type('Contraseña *','secreto22');
 await s.press('Crear mi cuenta');await flush(10);assert(!s.all().includes('Soy vendedor nuevo'),'entra con el código');assert.equal(fake.T.invites[0].used_by!==null,true,'código usado');
 assert.equal(new Business(S.db).one('SELECT COUNT(*) n FROM products').n,0,'el teléfono del vendedor no guarda el negocio');
 await o.press('Actualizar lista');await flush();assert(o.all().includes('Usado por Luis'),'el dueño ve el código usado');assert(o.all().includes('Teléfono registrado'));
 assert(s.all().includes('Venta actual')===false);assert(s.all().includes('disponibles'),'ve existencias');
 const t=s.all();for(const banned of ['Corte de caja','Gastos operativos','Cuentas y movimientos','Eliminar','Costo'])assert(!t.includes(banned),'el vendedor no debe ver: '+banned);
 {const {screenIssues}=require('./screenCheck.cjs');const bad=[];
  for(const t of ['Vender','Stock','Mis ventas','Caja','Cuenta','Vender']){await s.press(t);await flush(2);bad.push(...screenIssues(seller,'vendedor · '+t));}
  assert(seller.root.findAll(n=>/^Categoría /.test(n.props.accessibilityLabel||'')).length>0,'el vendedor vende por categoría');
  assert.deepEqual(bad,[],bad.join('\n'));}
 console.log('  ✓ vendedor entra con su código de un solo uso y solo ve vender, stock, sus ventas y cuenta (pantallas sin errores, venta por categoría)');
 // Venta en efectivo con cliente nuevo y límite de existencias
 const prod={...fake.T.catalog.filter(p=>p.available>=2&&!p.archived).sort((a,b)=>a.name<b.name?-1:1)[0]};
 await s.add(prod.name);
 for(let i=0;i<prod.available+1;i++){const plus=seller.root.findAll(n=>n.props.accessibilityLabel==='Agregar una');await act(async()=>plus[0].props.onPress());}
 assert(s.all().includes(`Solo hay ${prod.available} unidades disponibles`),'límite de existencias');
 while(seller.root.findAll(n=>n.type==='Text'&&n.props.testID==='qty')[0].props.children>1){const minus=seller.root.findAll(n=>n.props.accessibilityLabel==='Quitar una');await act(async()=>minus[0].props.onPress());}
 await s.press('＋ Cliente nuevo');await s.type('Nombre del cliente nuevo','Ana Pérez');await s.type('WhatsApp del cliente nuevo','5512345678');
 assert(s.btn('Tarjeta (terminal)').length,'tarjeta disponible');assert(s.all().includes('Cobrar'),'tarjeta elegida por defecto');
 await s.press('Efectivo');await s.press('Registrar venta');await flush();
 const {grossUp}=require('../src/business.ts');const client=(x)=>grossUp(x,406);const fee=(x)=>client(x)-x;// 2.0: el cliente absorbe la comisión
 assert.equal(fake.T.sales.length,1);assert.equal(fake.T.sales[0].total,client(prod.price),'efectivo: el cliente absorbe la comisión');assert.equal(fake.T.sales[0].commission,fee(prod.price));assert.equal(fake.T.sales[0].customer_name,'Ana Pérez');assert.ok(fake.T.customers.some(c=>c.name==='Ana Pérez'&&c.phone==='5512345678'));
 assert.equal(new Business(S.db).setting('sellerCache',null).customers.some(c=>c.phone),false,'el vendedor no guarda teléfonos completos');
 console.log('  ✓ venta en efectivo: el cliente absorbe la comisión (el vendedor no la ve), con cliente nuevo y tope de existencias');
 // 2.0.1: productos y carrito son pantallas distintas (el carrito no repite la cuadrícula).
 {const has=(label)=>seller.root.findAll(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label).length>0;
  await s.add(prod.name);assert(s.all().includes('Forma de pago')&&!has('Buscar producto'),'pantalla del carrito');
  {const bad=require('./screenCheck.cjs').screenIssues(seller,'vendedor · carrito');assert.deepEqual(bad,[],bad.join('\n'));}
  await s.press('Agregar más productos');assert(has('Buscar producto')&&!s.all().includes('Forma de pago'),'pantalla de productos sin el carrito');
  assert(s.all().includes('Ver carrito · 1 pieza'),'barra para ver el carrito');
  await s.press('Ver carrito');assert(s.all().includes('Forma de pago'));
  await s.press('Vaciar');assert(has('Buscar producto')&&!s.all().includes('Forma de pago')&&!s.all().includes('Ver carrito'),'vaciar regresa a los productos');}
 console.log('  ✓ Vender: productos y carrito en pantallas separadas (ver carrito, agregar más, vaciar)');
 // Venta con tarjeta en la terminal (vía servidor)
 await s.add(prod.name);
 // Cliente existente: búsqueda en la tienda con teléfono enmascarado
 await s.press('Elegir cliente (opcional)');await s.type('Buscar cliente por nombre o últimos 4 dígitos','ana');await flush(4);
 assert(s.all().includes('•••5678'),'teléfono enmascarado');assert(!s.all().includes('5512345678'),'sin teléfono completo');await s.press('Ana Pérez');assert(s.all().includes('Ana Pérez'));
 await s.press('Tarjeta (terminal)');
 const withFee=client(prod.price);// 2.0: precio al cliente (absorbe la comisión)
 assert(s.all().includes(money(withFee))&&s.all().includes('Subtotal')&&!/Comisi[oó]n/.test(s.all()),'el vendedor ve subtotal y total, nunca la comisión');
 await s.pressLike(/Cobrar .* en la terminal/);await flush(4);
 const order=[...fake.mp.orders.values()].at(-1);assert(order,'cobro creado');assert.equal(order.transactions.payments[0].amount,(withFee/100).toFixed(2),'la terminal cobra con comisión');assert.equal(order.config.point.terminal_id,'NEWLAND_N950__X');
 fake.mp.approve(order.id,{last4:'1111',authorization:'654321'});await flush(10);
 assert(s.all().includes('Pago aprobado'),'aprobado');assert.equal(fake.T.sales.length,2);assert.equal(fake.T.sales[1].mp.orderId,order.id);assert.equal(fake.T.sales[1].total,withFee);assert.equal(fake.T.terminal_orders.find(x=>x.order_id===order.id).sale_id,fake.T.sales[1].id,'el cobro queda usado por esa venta');
 await s.press('Enviar comprobante por WhatsApp');await flush(4);
 assert.match(decodeURIComponent(opened.at(-1)),/Autorización: 654321/);assert.doesNotMatch(decodeURIComponent(opened.at(-1)),/Comisi[oó]n/,'2.0: el comprobante no muestra la comisión');assert.match(decodeURIComponent(opened.at(-1)),new RegExp('Subtotal: '+money(withFee).replace(/[$.]/g,'\\$&')));assert.match(opened.at(-1),/wa\.me\/525512345678/,'el servidor da el teléfono solo para este comprobante');
 console.log('  ✓ cobro con tarjeta en la terminal sin la clave en el teléfono, cliente buscado con teléfono oculto, comprobante por WhatsApp');
 // Precio cambiado por el dueño mientras el vendedor tenía el catálogo viejo: no se cobra a ciegas
 const cat=fake.T.catalog.filter(p=>p.available>=2&&!p.archived&&p.product_id!==prod.product_id).sort((a,b)=>a.name<b.name?-1:1)[0];const oldPrice=cat.price;cat.price=oldPrice+1000;
 await s.press('Vender');await s.add(cat.name);await s.press('Efectivo');await s.press('Registrar venta');await flush(6);
 assert(s.all().includes('El total cambió'),'avisa del precio nuevo');assert.equal(fake.T.sales.length,2,'no se registró');cat.price=oldPrice;await s.press('Vaciar');
 // Servidor sin el schema 1.9 (no suma la comisión): no se cobra y se avisa qué hacer.
 fake.T.legacy18=true;await s.add(cat.name);await s.press('Efectivo');await s.press('Registrar venta');await flush(6);
 assert(s.all().includes('aún no tiene la comisión 2.0'),'avisa que falta actualizar el servidor');assert.equal(fake.T.sales.length,2,'no se registró');fake.T.legacy18=false;await s.press('Vaciar');
 await s.press('Cuenta');await s.press('Actualizar ahora');await flush(6);
 // Mis ventas
 await s.press('Mis ventas');await flush();assert(s.all().includes('Tus ventas de hoy'));assert(s.all().includes(`2 ventas`));
 // ---------- El dueño recibe ----------
 const before=ob.sales().length;await o.press('Sincronizar ahora');await flush(10);
 assert.equal(ob.sales().length,11+2,'ventas registradas en el teléfono del dueño (11 importadas + 2 del vendedor)');
 const mine=ob.sales().filter(v=>v.seller==='Luis');assert.equal(mine.length,2);
 for(const v of mine){assert.equal(v.commission,fee(prod.price),'el dueño registra la comisión del vendedor');assert.equal(v.basePrice,prod.price);assert.equal(ob.saleDetail(v.id).lines.reduce((n,l)=>n+l.total,0),prod.price,'renglones sin comisión');}assert.ok(fake.T.sales.every(v=>v.status==='aplicada'));
 assert.equal(ob.stock().find(p=>p.id===prod.product_id).available,prod.available-2);
 await s.press('Cuenta');await s.press('Actualizar ahora');await flush(8);await s.press('Mis ventas');assert(s.all().includes('Registrada'),'el vendedor ve su venta registrada');
 {const btns=seller.root.findAll(n=>n.type==='Pressable'&&text(n).trim()==='Enviar comprobante');const n0=opened.length;for(const x of btns)await act(async()=>x.props.onPress());await flush(4);
  assert(opened.slice(n0).some(u=>/Autorización: 654321/.test(decodeURIComponent(u))),'reenvía el comprobante de tarjeta con autorización');}
 console.log('  ✓ el dueño registra las ventas del vendedor (inventario, cobro, comisión) y el vendedor lo ve');
 // ---------- Sin internet ----------
 fake.state.offline=true;await s.press('Vender');await s.add(prod.name);await s.press('Efectivo');await s.press('Registrar venta');await flush(3);
 assert.equal(fake.T.sales.length,2);assert.equal(new Business(S.db).setting('sellerQueue',[]).length,1,'queda en cola');
 fake.state.offline=false;await s.press('Cuenta');await s.press('Actualizar ahora');await flush(8);
 assert.equal(fake.T.sales.length,3,'se envió al volver internet');assert.equal(new Business(S.db).setting('sellerQueue',[]).length,0);
 console.log('  ✓ sin internet la venta se guarda y se envía sola después');
 // ---------- Otro teléfono: entra solo con correo y contraseña ----------
 const X=mk();let other;current=X.db;await act(async()=>{other=renderer.create(React.createElement(App))});await flush();const x=H(other);
 await x.press('Tengo un código de invitación');await x.code('Código de invitación (solo para cuenta nueva)',code.slice(3));await x.type('Tu nombre *','Pepe');await x.type('Tu correo *','pepe@gns.mx');await x.type('Contraseña *','secreto99');await x.press('Crear mi cuenta');await flush(6);
 assert(x.all().includes('ya se usó'),'el código no sirve dos veces');await x.press('Volver al inicio');
 await x.type('Correo','luis@gns.mx');await x.type('Contraseña','secreto22');await x.press('Entrar');await flush(10);
 assert(!x.all().includes('Soy vendedor nuevo'),'entra en el teléfono nuevo solo con correo y contraseña');assert(x.all().includes('disponibles'));
 await s.press('Cuenta');await s.press('Actualizar ahora');await flush(6);assert(s.all().includes('se abrió en otro teléfono'),'el teléfono anterior se desconecta y avisa');
 assert.equal(new Business(S.db).setting('cloudSession',null),null);
 // El dueño le pone una contraseña nueva (si no le llega el correo)
 await o.press('Ajustes');await o.press('Invitar, formas de pago y sincronizar');await flush(6);await o.press('Nueva contraseña');await o.type('Contraseña nueva de Luis','temporal-123');await o.press('Guardar contraseña');await flush(6);
 assert(o.all().includes('Contraseña de Luis cambiada'));assert.equal(fake.users.find(u=>u.email==='luis@gns.mx').password,'temporal-123');
 // Olvidé mi contraseña desde el teléfono del vendedor (correo con código)
 await s.press('¿Olvidaste tu contraseña?');await s.type('Tu correo','luis@gns.mx');await s.press('Enviarme el correo');await flush(6);
 await s.type('Código del correo',fake.state.mails.at(-1).code);await s.type('Contraseña nueva (mínimo 8)','luis-nueva-1');await s.type('Repite la contraseña nueva','luis-nueva-1');await s.press('Guardar contraseña nueva');await flush(6);
 assert(s.all().includes('Contraseña cambiada'));assert.equal(fake.users.find(u=>u.email==='luis@gns.mx').password,'luis-nueva-1');
 fake.state.smtpBlocked=true;await s.press('¿Olvidaste tu contraseña?');await s.type('Tu correo','luis@gns.mx');await s.press('Enviarme el correo');await flush(6);assert(s.all().includes('falta configurar el correo'),'avisa si el correo no está configurado');fake.state.smtpBlocked=false;await s.press('Volver');
 console.log('  ✓ otro teléfono entra solo con correo y contraseña (el anterior se desconecta); contraseña nueva por correo o puesta por el dueño');
 // ---------- Datos para transferencia ----------
 await o.press('Ajustes');await o.press('Formas de pago');await o.press('＋ Banamex');await o.type('Titular de la cuenta *','Emmanuel Martínez');await o.type('CLABE (18 dígitos)','002180700000000000');await o.press('Guardar datos');
 assert(o.all().includes('no es válida'),'valida la CLABE');
 const clabe=(()=>{const base='00218070123456789';const w=[3,7,1];const sum=base.split('').reduce((n,c,i)=>n+(Number(c)*w[i%3])%10,0);return base+((10-sum%10)%10)})();
 await o.type('CLABE (18 dígitos)',clabe);await o.press('Guardar datos');await flush(8);assert(o.all().includes(`CLABE ${clabe.replace(/(\d{4})(?=\d)/g,'$1 ')}`),'CLABE en bloques de 4');
 await o.press('＋ Mercado Pago');await o.type('Titular de la cuenta *','Emmanuel Martínez');await o.type('Número de tarjeta (opcional)','5428 7801 2345 6789');await o.press('Guardar datos');await flush(10);
 assert.equal(fake.T.config.find(c=>c.key==='transfer').value.accounts.length,2,'publicados para los vendedores');
 await x.press('Cuenta');await x.press('Actualizar ahora');await flush(6);await x.press('Vender');await x.add(cat.name);
 assert(!x.all().includes('Datos para transferencia'),'no se ven si no es transferencia');await x.press('Transferencia');
 assert(x.all().includes('Datos para transferencia')&&x.all().includes('Banamex')&&x.all().includes('Mercado Pago'),'el vendedor los ve al elegir transferencia');
 await x.press('Compartir datos con el cliente');assert(shared.at(-1).message.includes(clabe)&&shared.at(-1).message.includes('5428 7801 2345 6789'));
 // Con dos cuentas, el vendedor dice a cuál le pagaron
 await x.press('Registrar venta');await flush(4);assert(x.all().includes('Elige a qué cuenta te transfirió'),'pide la cuenta');
 await x.press('Mercado Pago');await x.press('Registrar venta');await flush(8);const tv=fake.T.sales.at(-1);assert.equal(tv.method,'Transferencia');assert.equal(tv.transfer_id,'mercadopago');
 await o.press('Ajustes');await o.press('Invitar, formas de pago y sincronizar');await flush(4);await o.press('Sincronizar ahora');await flush(10);
 const mpAcct=ob.accounts().find(a=>a.name==='Mercado Pago');assert(mpAcct,'cuenta Mercado Pago creada al guardar los datos');assert.equal(ob.accounts().filter(a=>a.name==='Banamex').length,1);
 const local=ob.sales().find(v=>v.remoteId===tv.id);assert(local,'venta registrada');assert.equal(ob.salePaymentsByAccount().get(local.id)[mpAcct.id],tv.total,'cae en la cuenta Mercado Pago');assert.equal(local.transferLabel,'Mercado Pago');
 // Filtro de Ventas por forma de cobro
 await o.press('Ventas');assert(o.all().includes('Efectivo'));await o.press('Mercado Pago');
 assert(/1\s+venta\s+·/.test(o.all()),'solo la de Mercado Pago');assert(o.all().includes(`cobrado por Mercado Pago: ${money(tv.total)}`));
 await o.press('Efectivo');assert(!o.all().includes('cobrado por Efectivo: $0.00'));await o.press('Terminal (tarjeta)');assert(o.all().includes('cobrado por Terminal'));await o.press('Todos los cobros');
 const luisId0=fake.users.find(u=>u.email==='luis@gns.mx').id;
 await o.press('Ajustes');await o.press('Invitar, formas de pago y sincronizar');await flush(6);await o.press('✓ Mercado Pago');await flush(6);assert.deepEqual(fake.T.members.find(m=>m.user_id===luisId0).transfer_ids,['banamex']);
 await x.press('Cuenta');await x.press('Actualizar ahora');await flush(6);await x.press('Vender');await x.add(cat.name);await x.press('Transferencia');
 assert(x.all().includes('Banamex')&&!x.all().includes('Tarjeta 5428'),'solo ve los asignados');await x.press('Vaciar');
 // 2.5: Formas de pago — todo en un lugar: quién usa cada cuenta, editar y eliminar
 {await o.press('Ajustes');await o.press('Formas de pago');await flush(8);assert(o.all().includes('Quién la usa')&&o.all().includes('Formas de cobro al vender'),'página unificada');
  await o.press('Luis: no');await flush(6);assert.deepEqual(fake.T.members.find(m=>m.user_id===luisId0).transfer_ids,['banamex','mercadopago'],'el dueño le da Mercado Pago a Luis');assert(o.all().includes('Luis ahora ve Mercado Pago'));
  await o.press('Luis: sí',1);await flush(6);assert.deepEqual(fake.T.members.find(m=>m.user_id===luisId0).transfer_ids,['banamex'],'y se lo quita');
  await o.press('Efectivo: sí');await flush(6);assert.deepEqual(fake.T.members.find(m=>m.user_id===luisId0).methods,['Tarjeta','Transferencia'],'quita efectivo al vendedor');
  await o.press('Efectivo: no');await flush(6);assert.deepEqual(fake.T.members.find(m=>m.user_id===luisId0).methods,['Tarjeta','Efectivo','Transferencia'],'y lo devuelve');
  await o.press('Tú: sí',1);assert.equal(new Business(O.db).setting('transferAccounts',[]).find(a=>a.id==='mercadopago').ownerHidden,true,'el dueño deja de usar Mercado Pago');
  assert.deepEqual(fake.T.members.find(m=>m.user_id===luisId0).transfer_ids,['banamex'],'lo del dueño no cambia a los vendedores');
  await o.press('Tú: no');assert(!new Business(O.db).setting('transferAccounts',[]).find(a=>a.id==='mercadopago').ownerHidden);
  await o.press('Editar Banamex');await o.type('Nota para el cliente (opcional)','Manda tu comprobante');await o.press('Guardar datos');await flush(6);assert(o.all().includes('Manda tu comprobante'),'edita sin perder lo demás');
  await o.press('＋ Otra cuenta');await o.type('Nombre que verá el cliente *','BBVA');await o.type('Titular de la cuenta *','Emmanuel Martínez');await o.type('Número de cuenta (opcional)','0123456789');await o.press('Guardar datos');await flush(6);assert(o.all().includes('BBVA'));
  const n=alerts.length;await o.press('Eliminar BBVA');assert.equal(alerts.length,n+1,'pide confirmar');const [confirm]=alerts.splice(n,1);await act(async()=>confirm[2].find(x=>x.text==='Eliminar').onPress());await flush(6);
  assert(!new Business(O.db).setting('transferAccounts',[]).some(a=>a.label==='BBVA'),'eliminada');assert.equal(fake.T.config.find(c=>c.key==='transfer').value.accounts.length,2,'y se publica');
  await o.press('Ajustes');await o.press('Invitar, formas de pago y sincronizar');await flush(6);}
 console.log('  ✓ datos de transferencia: CLABE validada, asignados por vendedor, solo con transferencia; la venta cae en la cuenta del banco y se filtra en Ventas');
 // ---------- 1.3: cierre de caja del vendedor (no se puede cambiar) ----------
 const luisId=fake.users.find(u=>u.email==='luis@gns.mx').id;
 await x.press('Vender');await x.add(cat.name);await x.press('Efectivo');await x.press('Registrar venta');await flush(6);
 await x.press('Caja');await flush(6);assert(x.all().includes('Caja abierta'),'pantalla de caja');
 const open=fake.T.sales.filter(v=>v.seller_id===luisId&&!v.closing_id&&v.status!=='rechazada');const openTotal=open.reduce((n,v)=>n+v.total,0);
 assert(x.all().includes(money(openTotal)),'total vendido desde el último cierre');assert(x.all().includes('Unidades vendidas'));assert(x.all().includes(cat.name),'lo que se vendió');
 await x.press('Cerrar caja');assert(x.all().includes('no se puede cambiar ni borrar'));await x.press('Sí, cerrar caja');await flush(8);
 assert.equal(fake.T.seller_closings.length,1);const cut=fake.T.seller_closings[0];assert.equal(cut.total,openTotal);assert.equal(cut.sales_count,open.length);
 assert(x.all().includes('Cierres anteriores')&&x.all().includes(money(openTotal)));
 const xc=new (require('../src/cloud.ts').Cloud)(global.__STORE_CLOUD,new Business(X.db).setting('cloudSession',null),()=>{},fake.fetch);xc.device=new Business(X.db).setting('deviceId',null);
 assert.equal((await xc.update('seller_closings',`id=eq.${cut.id}`,{total:1})).length,0,'el vendedor no puede cambiar su cierre');assert.equal(fake.T.seller_closings[0].total,openTotal);
 const closeBtn=other.root.findAll(n=>n.type==='Pressable'&&text(n).includes('Cerrar caja')&&n.props.disabled);assert(closeBtn.length,'sin ventas nuevas no se cierra otra vez');
 console.log('  ✓ el vendedor cierra caja: ve lo vendido, el total y las unidades; el cierre queda fijo en el servidor');
 // ---------- 1.3: el dueño ve cierres, correos, define formas de pago y elimina usuarios ----------
 await o.press('Actualizar lista');await flush(6);assert(o.all().includes('luis@gns.mx'),'el dueño ve el correo');
 await o.press('Cierres de caja');await flush(4);assert(o.all().includes(money(openTotal)),'el dueño ve el cierre');
 await o.press('✓ Efectivo');await flush(6);assert.deepEqual(fake.T.members.find(m=>m.user_id===luisId).methods,['Tarjeta','Transferencia']);
 await x.press('Cuenta');await x.press('Actualizar ahora');await flush(6);await x.press('Vender');await x.add(cat.name);
 assert(!x.btn('Efectivo').length,'ya no ve Efectivo');assert(x.all().includes('Cobrar'),'tarjeta por defecto');await x.press('Vaciar');
 // Comisión por vendedor: el dueño la quita y el vendedor cobra con tarjeta a precio de lista
 assert(!o.all().includes('Sumar comisión'),'no hay interruptor de comisión por vendedor (siempre la cobran)');
 await x.press('Cuenta');await x.press('Actualizar ahora');await flush(6);await x.press('Vender');await x.add(cat.name);
 assert(x.all().includes(`Cobrar ${money(client(cat.price))}`),'tarjeta: precio al cliente');await x.press('Vaciar');
 {const r=await xc.rpc('check_sale',{p_items:[{productId:cat.product_id,qty:1}]});assert.equal(r.card_total,client(cat.price),'el servidor también');assert.equal(r.pricing,'grossup');assert.equal(r.subtotal,cat.price);assert.equal(r.commission,fee(cat.price));}
 // 2.0: la comisión es un parámetro: al cambiarla, el servidor y los vendedores la usan de inmediato.
 {await o.press('Ajustes');await o.press('Cambiar porcentaje');await o.type('Comisión (%) *','3.5');await o.press('Guardar');await flush(12);
  assert.equal(fake.T.config.find(c=>c.key==='fee').value.bps,350,'se publicó la comisión nueva');
  await x.press('Cuenta');await x.press('Actualizar ahora');await flush(6);await x.press('Vender');await x.add(cat.name);
  assert(x.all().includes(`Cobrar ${money(grossUp(cat.price,350))}`),'el vendedor cobra con la comisión nueva');await x.press('Vaciar');
  assert.equal((await xc.rpc('check_sale',{p_items:[{productId:cat.product_id,qty:1}]})).total,grossUp(cat.price,350),'el servidor también');
  await o.press('Cambiar porcentaje');await o.type('Comisión (%) *','4.06');await o.press('Guardar');await flush(12);assert.equal(fake.T.config.find(c=>c.key==='fee').value.bps,406);await o.press('Invitar, formas de pago y sincronizar');await flush(6);}
 await assert.rejects(xc.rpc('submit_sale',{p_id:'v-forzada-01',p_items:[{productId:cat.product_id,qty:1}],p_method:'Efectivo'}),/no te habilitó/,'el servidor también lo impide');
 // Cuenta huérfana (sin acceso) y baja de Luis
 await fake.fetch(fake.BASE+'/auth/v1/admin/users',{method:'POST',headers:{apikey:'service'},body:JSON.stringify({email:'prueba@gns.mx',password:'secreto99'})});
 await o.press('Actualizar lista');await flush(6);assert(o.all().includes('Cuentas sin acceso a la tienda')&&o.all().includes('prueba@gns.mx'));
 await o.press('Eliminar');const del1=alerts.pop();assert.equal(del1[0],'Eliminar usuario');await act(async()=>del1[2][1].onPress());await flush(6);
 assert(!fake.users.some(u=>u.email==='prueba@gns.mx'),'cuenta huérfana eliminada');
 await o.press('Eliminar usuario');const del2=alerts.pop();assert.match(del2[1],/luis@gns\.mx/);await act(async()=>del2[2][1].onPress());await flush(6);
 assert(!fake.users.some(u=>u.email==='luis@gns.mx'),'correo de Luis eliminado');assert(!fake.T.members.some(m=>m.user_id===luisId));
 assert.ok(fake.T.sales.length>=4&&fake.T.seller_closings.length===1,'ventas y cierres se conservan');assert(!o.all().includes('luis@gns.mx'));
 await x.press('Cuenta');await x.press('Actualizar ahora');await flush(6);assert(x.all().includes('Soy vendedor nuevo'),'el vendedor eliminado queda fuera');
 console.log('  ✓ el dueño ve cierres y correos, limita formas de pago y elimina usuarios con su correo');
 await act(async()=>other.unmount());
 assert.equal(alerts.length,0,JSON.stringify(alerts));
 await act(async()=>{owner.unmount();seller.unmount()});
 console.log('EQUIPO: OK');
})().then(()=>process.exit(process.exitCode||0)).catch(e=>{console.error(e);process.exit(1)});
