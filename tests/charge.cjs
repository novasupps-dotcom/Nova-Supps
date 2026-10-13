// 1.3 · Cancelar un cobro mientras se revisa la terminal no deja un cobro tardío ni una venta doble.
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
 global.__NOVA_SKIP_LOCK=true;const B=require('./seed.cjs')(db);B.setSetting('appRole','owner');
 B.setSetting('mpConfig',{token:'APP_USR-x',account:'A',terminalId:'PAX_A910__SMART2',terminalLabel:'SMART2',enabled:true});
 global.__MP_POLL_MS=10;let releaseTerm;const termGate=new Promise(r=>releaseTerm=r);const calls=[];
 global.fetch=async(url,init={})=>{calls.push(url+' '+(init.method||'GET'));let r={};
  if(url.includes('/terminals/v1/list')){await termGate;r={data:{terminals:[{id:'PAX_A910__SMART2',operating_mode:'PDV'}]}};}
  else if(url.endsWith('/v1/orders')&&init.method==='POST')r={id:'ORD1',status:'created',transactions:{payments:[{id:'PAY1',status:'created'}]}};
  else if(url.includes('/v1/orders/')&&(init.method||'GET')==='GET')r={id:'ORD1',status:'processed',transactions:{payments:[{id:'PAY1',reference_id:'9',amount:'1',status:'processed',status_detail:'accredited'}]}};
  return {ok:true,status:200,json:async()=>r};};
await act(async()=>{ui=renderer.create(React.createElement(App));});
 const card=sql.prepare("SELECT name FROM accounts WHERE kind='Tarjeta'").get().name;
 const n0=sql.prepare('SELECT count(*) n FROM sales').get().n;
await press('Stock');await sellFromStock();await press(card);
 const tb=ui.root.findAll(n=>n.type==='Pressable'&&/Cobrar \$.* en la terminal/.test(text(n))&&typeof n.props.onPress==='function');
 await act(async()=>tb[0].props.onPress());await flush(20);
 assert(/Revisando la terminal/.test(text(ui.root)));
 await pressExact('Cancelar cobro');await flush(20);
 assert(!/Revisando la terminal/.test(text(ui.root))&&formOpen(),'cancelar cierra la ventana de cobro');
 await pressExact('Ya lo cobré · registrar sin enviar a la terminal');await flush(20);
 assert.equal(sql.prepare('SELECT count(*) n FROM sales').get().n-n0,1);
 releaseTerm();for(let i=0;i<20;i++)await flush(15);
 assert.equal(calls.filter(c=>c.endsWith('/v1/orders POST')).length,0,'cancelado mientras se revisaba: no se manda a la terminal');
 assert.equal(sql.prepare('SELECT count(*) n FROM sales').get().n-n0,1,'sin venta duplicada');
 assert(!text(ui.root).includes('Pago aprobado'));console.log('Cobro cancelado durante el envío: OK (sin cobro tardío ni venta doble)');
 await act(async()=>ui.unmount());process.exit(0);
})().catch(e=>{console.error(e.stack);process.exit(1)});
