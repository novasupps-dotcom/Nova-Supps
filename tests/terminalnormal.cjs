// 2.0.3 · Terminal en modo normal (no Punto de Venta): el vendedor y el dueño cobran directo en la terminal
// y la app busca el pago en Mercado Pago para ligarlo a la venta.
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

 const {grossUp}=require('../src/business.ts');const client=(x)=>grossUp(x,406);
 const prod={...fake.T.catalog.filter(p=>p.available>=5&&!p.archived).sort((a,b)=>a.name<b.name?-1:1)[0]};const total=client(prod.price);
 const term=fake.mp.terminals[0];term.operating_mode='STANDALONE';
 const cobrar=async()=>{await s.press('Vender');await s.add(prod.name);await s.press('Tarjeta (terminal)');await s.pressLike(/Cobrar .* en la terminal/);await flush(6);};
 const ordersBefore=fake.mp.orders.size;
 await cobrar();
 assert(s.all().includes('está en modo normal'),'avisa que la terminal está en modo normal');assert.equal(fake.mp.orders.size,ordersBefore,'no manda el cobro a la terminal');
 assert(s.all().includes(`Cobra ${money(total)} directamente en la terminal`));
 await s.press('✅ Ya cobré en la terminal');await flush(10);
 assert(s.all().includes('Todavía no aparece un pago aprobado'),'aún sin pago');assert.equal(fake.T.sales.length,0);
 fake.mp.charge(total,{online:true});await s.press('✅ Ya cobré en la terminal');await flush(10);
 assert(s.all().includes('no viene de la terminal'),'avisa del pago que no es de la terminal');assert.equal(fake.T.sales.length,0,'no liga pagos que no son de la terminal');
 const pay1=fake.mp.charge(total,{last4:'3434',authorization:'765432'});
 await s.press('✅ Ya cobré en la terminal');await flush(12);
 assert(s.all().includes('Pago aprobado'),'aprobado: '+s.all().slice(0,300));assert.equal(fake.T.sales.length,1);
 const v1=fake.T.sales[0];assert.equal(v1.method,'Tarjeta');assert.equal(v1.total,total);assert.equal(v1.mp.orderId,'PAY-'+pay1);
 assert.equal(fake.T.terminal_orders.find(o=>o.order_id==='PAY-'+pay1).sale_id,v1.id,'el pago queda usado por esa venta');
 await s.press('📲 Enviar comprobante por WhatsApp');await flush(4);assert(s.all().includes('Autorización: 765432'),'comprobante con autorización');assert(s.all().includes('3434'));await s.press('Cerrar');
 console.log('  ✓ vendedor: terminal en modo normal → cobra en la terminal, «Ya cobré» liga el pago real y registra la venta');
 // Dos pagos por el mismo monto: el vendedor elige; el usado ya no vuelve a aparecer.
 const pa=fake.mp.charge(total,{last4:'1212',minutesAgo:1}),pb=fake.mp.charge(total,{last4:'5656'});
 await cobrar();await s.press('✅ Ya cobré en la terminal');await flush(10);
 assert(s.all().includes('Hay varios pagos'),'elige entre varios');assert(s.all().includes('••5656')&&s.all().includes('••1212'));
 await s.pressLike(/••5656/);await flush(12);assert(s.all().includes('Pago aprobado'));assert.equal(fake.T.sales.length,2);assert.equal(fake.T.sales[1].mp.orderId,'PAY-'+pb);
 await s.press('Listo');
 // Cerrar y ligar después: el cobro queda pendiente y no deja empezar otro con tarjeta.
 await cobrar();await s.press('Cerrar y ligar después');await flush(2);
 assert(s.all().includes('Cobro con tarjeta sin confirmar'),'queda pendiente');
 await s.add(prod.name);await s.press('Tarjeta (terminal)');await s.pressLike(/Cobrar .* en la terminal/);await flush(4);assert(s.all().includes('Hay un cobro con tarjeta sin confirmar'),'no cobra otro encima');
 await s.press('Revisar cobro');await s.press('✅ Ya cobré en la terminal');await flush(10);
 assert(s.all().includes('Pago aprobado'),'liga el pago que quedaba (pa)');assert.equal(fake.T.sales.length,3);assert.equal(fake.T.sales[2].mp.orderId,'PAY-'+pa);await s.press('Listo');
 assert.equal(new Business(S.db).setting('sellerCharge',null),null,'sin cobro pendiente');
 console.log('  ✓ varios pagos por el mismo monto: el vendedor elige; «Cerrar y ligar después» deja el cobro pendiente');
 // Ya en Punto de Venta, pero la terminal no recibe (aún no se reinicia): se retira y se cobra ahí directo.
 term.operating_mode='PDV';await cobrar();assert(s.all().includes('Cobro enviado'),'se manda a la terminal');
 for(let i=0;i<4;i++)await flush(6);
 const sent=[...fake.mp.orders.values()].at(-1);await s.press('¿No llega a la terminal? Cobrar ahí directo');await flush(4);
 assert.equal(sent.status,'canceled','retira el cobro de la terminal');assert(s.all().includes('está en modo normal'),'pasa a cobro directo');
 await s.press('Cancelar cobro');await flush(2);assert(s.all().includes('Cobro cancelado'));await s.press('Cerrar');await s.press('Vaciar');
 console.log('  ✓ si la terminal no recibe el cobro, se retira y se cobra directo en la terminal');
 // ---------- El dueño recibe: revisa el pago, comisión real ----------
 await o.press('🔄 Sincronizar ahora');await flush(12);
 const mine=ob.sales().filter(v=>v.seller==='Luis');assert.equal(mine.length,3,'el dueño registra las 3 ventas');assert.ok(fake.T.sales.every(v=>v.status==='aplicada'),JSON.stringify(fake.T.sales.map(v=>[v.status,v.error])));
 for(let i=0;i<4;i++)await flush(6);
 const entries=mine.map(v=>require('../src/receipt.ts').terminalPayments(ob.saleDetail(v.id))[0]);
 assert.ok(entries.every(e=>e&&e.orderId.startsWith('PAY-')&&e.realFee===222),'comisión real de cada pago: '+JSON.stringify(entries));
 console.log('  ✓ el dueño registra las ventas, revisa cada pago en Mercado Pago y concilia la comisión real');
 // Un pago ya usado por el vendedor no se puede ligar a una venta del dueño.
 assert.equal(ob.paymentLinked(String(pay1)),true);assert.equal(ob.paymentLinked('999999'),false);
 console.log('  ✓ un pago ya usado no se puede ligar a otra venta del dueño');
 // (El cobro directo del dueño se prueba en tests/ui.cjs.)
 process.exit(0);

})().catch(e=>{console.error(e);process.exit(1)});
