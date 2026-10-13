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
async function gridAdd(name){await type('Buscar producto',name);const t=ui.root.findAll(n=>n.props.accessibilityLabel==='Agregar '+name&&typeof n.props.onPress==='function');assert(t.length,'foto de '+name);await act(async()=>t[0].props.onPress());}
async function openCart(){const c=ui.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Abrir carrito'&&typeof n.props.onPress==='function');assert(c.length,'carrito');await act(async()=>c[0].props.onPress());}
async function emptyCart(){if(!ui.root.findAll(n=>n.props.accessibilityLabel==='Abrir carrito').length)return;await openCart();for(let i=0;i<50;i++){const q=ui.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Quitar una'&&typeof n.props.onPress==='function');if(!q.length)break;await act(async()=>q[0].props.onPress());}const c=ui.root.findAll(n=>n.type==='Pressable'&&(n.children||[]).length&&JSON.stringify(n.props.accessibilityLabel||'')==='""'&&false);await act(async()=>{});const cl=ui.root.findAll(n=>n.type==='Pressable'&&typeof n.props.onPress==='function'&&String((function t(x){return typeof x==='string'?x:(x.children||[]).map(t).join(' ')})(n)).trim()==='Cerrar');if(cl.length)await act(async()=>cl[0].props.onPress());}
async function sellFromStock(){await emptyCart();const b=ui.root.findAll(n=>n.type==='Pressable'&&typeof n.props.onPress==='function'&&!n.props.disabled&&String((function t(x){return typeof x==='string'?x:(x.children||[]).map(t).join(' ')})(n)).trim()==='🛒 Al carrito');assert(b.length,'🛒 Al carrito');await act(async()=>b[0].props.onPress());await openCart();}
async function type(label,value){const input=ui.root.findAll(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label)[0];assert(input,label);await act(async()=>input.props.onChangeText(value));}
async function flush(ms=800){await act(async()=>{await new Promise(r=>setTimeout(r,ms))});}
// Sanity-check de TODOS los botones Guardar: cada formulario se guarda, cierra y deja la app lista para el siguiente.
const count=t=>sql.prepare(`SELECT count(*) n FROM ${t}`).get().n;
const fails=[];
async function check(name,fn){try{await fn();console.log('  ✓',name)}catch(e){fails.push(name+': '+e.message);console.log('  ✗',name,'→',e.message);try{for(let i=0;i<3;i++){const c=exact('Cerrar');if(!c.length)break;await act(async()=>c[0].props.onPress())}}catch{}}}
async function choose(label,option){await act(async()=>ui.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel===label)[0].props.onPress());const o=ui.root.findAll(n=>n.type==='Pressable'&&text(n).includes(option)&&typeof n.props.onPress==='function');assert(o.length,'opción '+option);await act(async()=>o[o.length-1].props.onPress());}
const formOpen=()=>ui.root.findAll(n=>n.type==='Modal').some(m=>m.props.visible);
// 2.0: los módulos avanzados están en Parámetros con su interruptor.
async function adv(){await press('Parámetros');const sw=ui.root.findAll(n=>n.type==='Switch'&&n.props.accessibilityLabel==='Funciones avanzadas')[0];assert(sw,'interruptor de funciones avanzadas');if(!sw.props.value)await act(async()=>sw.props.onValueChange(true));}
(async()=>{
 global.__NOVA_SKIP_LOCK=true;require('./seed.cjs')(db).setSetting('appRole','owner');await act(async()=>{ui=renderer.create(React.createElement(App));});
 const cash=sql.prepare("SELECT name FROM accounts WHERE kind='Efectivo'").get().name;
 await check('Cliente nuevo (dos seguidos)',async()=>{const n=count('customers');
  await press('Clientes');await pressExact('＋ Cliente');await type('Nombre *','Cliente Uno');await type('Teléfono (opcional)','5512345678');await pressExact('Guardar');assert(!formOpen(),'el formulario no se cerró');
  await pressExact('＋ Cliente');await type('Nombre *','Cliente Dos');await pressExact('Guardar');assert(!formOpen(),'el 2º formulario no se cerró');assert.equal(count('customers'),n+2);});
 await check('Editar cliente',async()=>{await press('Clientes');const ed=exact('Editar');await act(async()=>ed[0].props.onPress());await type('Nombre *','Cliente Editado');await pressExact('Frecuente');await pressExact('Guardar');assert(!formOpen());assert(sql.prepare("SELECT count(*) n FROM customers WHERE name='Cliente Editado' AND stage='Frecuente'").get().n===1);});
 await check('Cliente creado desde una venta y luego cobrar',async()=>{const s0=count('sales');
  await press('Stock');await sellFromStock();await choose('Cliente','＋ Crear cliente');await type('Nombre *','Cliente Desde Venta');await pressExact('Guardar');
  assert(text(ui.root).includes('Cliente Desde Venta'),'el cliente no quedó elegido en la venta');
  await pressExact('Cobrar y confirmar venta');assert(!formOpen(),'la venta no se guardó (botón sin respuesta)');assert.equal(count('sales'),s0+1);
  const c=sql.prepare("SELECT s.customerId FROM sales s ORDER BY created DESC").get();assert.equal(sql.prepare('SELECT name FROM customers WHERE id=?').get(c.customerId).name,'Cliente Desde Venta');});
 await check('Producto creado desde una venta y luego cobrar',async()=>{const s0=count('sales');
  await press('Vender');
  await pressExact('＋ Producto nuevo');await type('Nombre *','Producto Rápido');await type('Precio de venta MXN *','100');await type('Stock inicial (opcional)','3');await type('Costo por unidad MXN *','40');await pressExact('Guardar');
  await openCart();assert(text(ui.root).includes('Producto Rápido'),'producto no agregado al carrito');await pressExact('Cobrar y confirmar venta');assert(!formOpen(),'venta no guardada');assert.equal(count('sales'),s0+1);});
 await check('Producto nuevo y editar',async()=>{const n=count('products');await press('Stock');await pressExact('＋ Producto');await type('Nombre *','Prod B');await type('Precio de venta MXN *','1,250.50');await pressExact('Guardar');assert(!formOpen());assert.equal(count('products'),n+1);
  await pressExact('＋ Producto');await type('Nombre *','Prod C');await type('Precio de venta MXN *','50');await pressExact('Guardar');assert.equal(count('products'),n+2);
  const ed=exact('Editar');await act(async()=>ed[0].props.onPress());await type('Precio de venta MXN *','999');await pressExact('Guardar');assert(!formOpen(),'editar producto no cerró');});
 await check('Campaña',async()=>{const n=count('campaigns');await adv();await press('Campañas');await pressExact('＋ Campaña');await type('Nombre *','Apertura');await pressExact('Guardar');assert(!formOpen());assert.equal(count('campaigns'),n+1);
  await pressExact('Actualizar');await pressExact('Activa');await pressExact('Guardar');assert(!formOpen());});
 await check('Compañía y Ubicación',async()=>{await adv();await press('Compañías');await pressExact('＋ Compañía');await type('Nombre *','GNS');await pressExact('Guardar');assert(!formOpen());
  await adv();await press('Ubicaciones');await pressExact('＋ Ubicación');await type('Nombre *','Tienda Centro');await pressExact('Guardar');assert(!formOpen());assert.equal(count('locations'),1);});
 await check('Cuenta y Movimiento',async()=>{const n=count('accounts');await adv();await press('Cuentas y movimientos');await pressExact('＋ Cuenta');await type('Nombre *','BBVA');await pressExact('Banco');await type('Saldo inicial MXN','500');await pressExact('Guardar');assert(!formOpen());assert.equal(count('accounts'),n+1);
  await pressExact('＋ Movimiento');await type('Importe MXN *','20');await type('Concepto *','Bolsas');await pressExact('Guardar');assert(!formOpen(),'gasto no guardado');});
 await check('Entrada de stock (inventario y compra pagada)',async()=>{const n=count('lots');await press('Stock');await pressExact('＋ Entrada');await choose('Producto *','Prod B');await type('Cantidad *','5');await type('Costo unitario MXN *','30');await pressExact('Guardar');assert(!formOpen());
  await pressExact('＋ Entrada');await choose('Producto *','Prod C');await type('Cantidad *','2');await type('Costo unitario MXN *','10');await pressExact('Compra pagada');await pressExact(cash);await pressExact('Guardar');assert(!formOpen(),'compra no guardada');assert.equal(count('lots'),n+2);});
 await check('Asignar ubicación de lote',async()=>{await adv();await press('Lotes y caducidades');const b=exact('Asignar / cambiar ubicación');await act(async()=>b[0].props.onPress());await choose('Ubicación del lote *','Tienda Centro');await pressExact('Guardar');assert(!formOpen());});
 await check('Venta a crédito, abono y editar seguimiento',async()=>{await press('Clientes');const nv=exact('Nueva venta');await act(async()=>nv[0].props.onPress());
  await gridAdd('Prod B');await openCart();assert(!/Cliente\s+Público general/.test(text(ui.root))&&/Cliente\s+Cliente Desde Venta/.test(text(ui.root)),'el cliente se queda elegido en el carrito');
  await pressExact('＋ Más detalles (opcional)');await type('Cobro de hoy MXN','100');await pressExact('Cobrar y confirmar venta');assert(!formOpen(),'venta a crédito no guardada');
  await press('Ventas');await pressExact('Por cobrar');const ab=exact('Abonar');await act(async()=>ab[0].props.onPress());await pressExact('Guardar');assert(!formOpen(),'abono no guardado');
  await press('Ventas');await pressExact('Activas');const card=ui.root.findAll(n=>n.type==='Pressable'&&text(n).includes('Cliente Editado')&&typeof n.props.onPress==='function');await act(async()=>card[0].props.onPress());
  await pressExact('Editar seguimiento');await pressExact('WhatsApp');await pressExact('Guardar');assert(!formOpen(),'seguimiento no guardado');});
 await check('Paquete',async()=>{const n=count('bundles');await adv();await press('Paquetes');await pressExact('＋ Paquete');await type('Nombre *','Combo');await type('Precio del paquete MXN *','150');
  await gridAdd('Prod B');
  await gridAdd('Prod C');await pressExact('Guardar');assert(!formOpen(),'paquete no guardado');assert.equal(count('bundles'),n+1);});
 await check('1.0 · Ajuste de inventario (merma y conteo)',async()=>{await press('Stock');await pressExact('Ajustar conteo');await choose('Producto *','Prod B');
  const before=sql.prepare("SELECT SUM(l.qty) n FROM lots l JOIN products p ON p.id=l.productId WHERE p.name='Prod B'").get().n;
  await type('Unidades que contaste *',String(before-1));assert(text(ui.root).includes('Se descontarán 1 unidad'));await pressExact('Merma o caducado');await pressExact('Guardar');assert(!formOpen(),'ajuste no guardado');
  assert.equal(sql.prepare("SELECT SUM(l.qty) n FROM lots l JOIN products p ON p.id=l.productId WHERE p.name='Prod B'").get().n,before-1);
  assert(text(ui.root).includes(`Existencias ajustadas: ${before} → ${before-1}`));
  const card=ui.root.findAll(n=>n.type==='Pressable'&&text(n).includes('Prod C')&&typeof n.props.onPress==='function');await act(async()=>card[0].props.onPress());
  await pressExact('Ajustar existencias (conteo, merma, regalo)');await type('Unidades que contaste *','10');await pressExact('Guardar');assert(!formOpen(),'ajuste desde detalle no guardado');});
 await check('1.0 · Renombrar cuenta',async()=>{await adv();await press('Cuentas y movimientos');const r=exact('Renombrar');await act(async()=>r[0].props.onPress());await type('Nombre *','Caja tienda');await pressExact('Guardar');assert(!formOpen());
  assert.equal(sql.prepare("SELECT count(*) n FROM accounts WHERE name='Caja tienda'").get().n,1);});
 await check('1.0 · Corte de caja y compartir',async()=>{await press('Ventas');await press('🧮 Corte de caja');const t=text(ui.root);assert(t.includes('Ventas del día'));assert(t.includes('Resultado del día'));
  global.__shared=[];await pressExact('📤 Compartir corte');assert.match(global.__shared[0].message,/Corte de caja/);assert.match(global.__shared[0].message,/Ventas: \d+/);});
 await check('1.0 · Comprobante (WhatsApp o compartir)',async()=>{await press('Ventas');await pressExact('Activas');
  const c2=ui.root.findAll(n=>n.type==='Pressable'&&text(n).includes('Cliente Desde Venta')&&typeof n.props.onPress==='function');await act(async()=>c2[0].props.onPress());
  global.__shared=[];await pressExact('📲 Enviar comprobante');assert(formOpen(),'sin teléfono pide número');assert(text(ui.root).includes('Vista previa'));
  await pressExact('Compartir con otra app');assert.match(global.__shared[0].message,/Comprobante/);assert.match(global.__shared[0].message,/\*Total: \$/);await pressExact('Cerrar');
  await press('Clientes');await type('Buscar nombre o teléfono','Cliente Desde Venta');await pressExact('Editar');await type('Teléfono (opcional)','55 1111 2222');await pressExact('Guardar');
  await press('Ventas');const c3=ui.root.findAll(n=>n.type==='Pressable'&&text(n).includes('Cliente Desde Venta')&&typeof n.props.onPress==='function');await act(async()=>c3[0].props.onPress());
  await pressExact('📲 Enviar comprobante');
  assert.match(opened.at(-1),/^https:\/\/wa\.me\/525511112222\?text=/);});
 await check('2.0 · Comisión: parámetro que absorbe el cliente',async()=>{await press('Parámetros');assert(text(ui.root).includes('4.06%')&&text(ui.root).includes('Comisión que absorbe el cliente'));
  assert(text(ui.root).includes('$1,042.32')&&/Recibes\s+\$1,000\.00/.test(text(ui.root)),'ejemplo: $1,000 → cliente $1,042.32 → recibes $1,000');await pressExact('Cambiar porcentaje');await type('Comisión (%) *','3.5');await pressExact('Guardar');assert(!formOpen(),'config no guardada');
  assert.equal(JSON.parse(sql.prepare("SELECT value FROM settings WHERE key='cardFeeBps'").get().value),350);assert(text(ui.root).includes('3.5%')&&text(ui.root).includes('$1,036.27'),'el ejemplo usa el nuevo porcentaje');
  await pressExact('Cambiar porcentaje');await type('Comisión (%) *','abc');await pressExact('Guardar');assert(formOpen(),'debe rechazar texto');await type('Comisión (%) *','4.06');await pressExact('Guardar');assert(!formOpen());});
 await check('1.0.1 · Devolver un producto de una venta',async()=>{await press('Stock');await type('Buscar nombre, SKU o marca','Prod B');await sellFromStock();await act(async()=>ui.root.findAll(n=>n.props.accessibilityLabel==='Agregar una')[0].props.onPress());await pressExact('Cobrar y confirmar venta');assert(!formOpen());
  const sale=sql.prepare("SELECT * FROM sales ORDER BY created DESC").get();const stock0=sql.prepare("SELECT SUM(l.qty) n FROM lots l JOIN products p ON p.id=l.productId WHERE p.name='Prod B'").get().n;
  await press('Ventas');await pressExact('Activas');const c=ui.root.findAll(n=>n.type==='Pressable'&&typeof n.props.onPress==='function'&&text(n).includes(sale.id.slice(-8).toUpperCase()));await act(async()=>c[0].props.onPress());
  await pressExact('↩️ Devolver productos / modificar venta');await act(async()=>ui.root.findAll(n=>n.props.accessibilityLabel==='Quitar una')[0].props.onPress());
  assert(text(ui.root).includes('Devolver al cliente'));await pressExact('Guardar cambios');assert(!formOpen(),'modificación no guardada');
  const after=sql.prepare("SELECT * FROM sales WHERE id=?").get(sale.id);assert.equal(after.total,sale.total/2);
  assert.equal(sql.prepare("SELECT SUM(l.qty) n FROM lots l JOIN products p ON p.id=l.productId WHERE p.name='Prod B'").get().n,stock0+1,'unidad regresó al inventario');
  assert.equal(sql.prepare("SELECT SUM(amount) n FROM ledger WHERE ref=? AND kind='sale'").get(sale.id).n,sale.total/2,'devolución registrada');
  assert(text(ui.root).includes('Devolución parcial'));});
 await check('1.0.1 · Corte con caja esperada y utilidad con mermas',async()=>{await press('Ventas');await press('🧮 Corte de caja');const t=text(ui.root);assert(t.includes('Caja esperada al cierre'));assert(t.includes('Caja al abrir el día'));
  await press('Ventas');await press('📊 Resumen');assert(text(ui.root).includes('Utilidad estimada'));assert(text(ui.root).includes('Mermas y ajustes de inventario'));});
 await check('1.0.2 · El carrito no pasa de lo disponible',async()=>{await press('Stock');await pressExact('＋ Producto');await type('Nombre *','Prod Limite');await type('Precio de venta MXN *','80');await type('Stock inicial (opcional)','2');await type('Costo por unidad MXN *','30');await pressExact('Guardar');assert(!formOpen());
  await type('Buscar nombre, SKU o marca','Prod Limite');await sellFromStock();const plus=()=>act(async()=>ui.root.findAll(n=>n.props.accessibilityLabel==='Agregar una')[0].props.onPress());
  await plus();await plus();await plus();const qty=()=>Number(ui.root.findAll(n=>n.type==='Text'&&/^\d+$/.test(text(n).trim())&&n.props.style&&n.props.style[1]&&n.props.style[1].minWidth===26)[0].props.children);
  assert.equal(qty(),2,'no debe pasar de 2');assert(text(ui.root).includes('Solo hay 2 unidades disponibles de Prod Limite'));assert(text(ui.root).includes('Máximo disponible (2)'));
  await pressExact('Cobrar y confirmar venta');assert(!formOpen(),'venta no guardada');
  assert.equal(sql.prepare("SELECT SUM(l.qty) n FROM lots l JOIN products p ON p.id=l.productId WHERE p.name='Prod Limite'").get().n,0);
  // Sin existencias: no se puede agregar desde el buscador.
  await press('Vender');await gridAdd('Prod Limite');
  assert(text(ui.root).includes('Prod Limite no tiene existencias'));assert(!ui.root.findAll(n=>n.props.accessibilityLabel==='Abrir carrito').length,'no debe quedar en el carrito');
  // Al modificar la venta, el máximo incluye las unidades que ya tiene.
  const sale=sql.prepare("SELECT s.id FROM sales s JOIN sale_lines l ON l.saleId=s.id WHERE l.name='Prod Limite'").get();
  await press('Ventas');await pressExact('Activas');const c=ui.root.findAll(n=>n.type==='Pressable'&&typeof n.props.onPress==='function'&&text(n).includes(sale.id.slice(-8).toUpperCase()));await act(async()=>c[0].props.onPress());
  await pressExact('↩️ Devolver productos / modificar venta');assert(text(ui.root).includes('Máximo disponible (2)'));await plus();assert.equal(qty(),2);await pressExact('Cerrar');});
 await check('Ningún error inesperado',async()=>{assert.equal(alerts.length,0,JSON.stringify(alerts))});
 await act(async()=>ui.unmount());
 if(fails.length){console.error('FALLAS:\n- '+fails.join('\n- '));process.exitCode=1}else console.log('FORMS PASS: todos los botones Guardar funcionan.');
})().catch(e=>{console.error(e);process.exitCode=1});
