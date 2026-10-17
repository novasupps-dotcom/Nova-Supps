// 1.3 · Teléfono del dueño: no se puede empezar de cero; solo el dueño REGISTRADO
// (correo + contraseña + código REC tecleado a mano) y luego su respaldo.
// Sin PIN: huella o rostro opcionales.
const fs=require('fs'),Module=require('module'),ts=require('typescript'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
global.IS_REACT_ACT_ENVIRONMENT=true;global.__NOVA_NO_FOLLOW_ALERT=true;
for(const extension of ['.ts','.tsx']) require.extensions[extension]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,file);
require.extensions['.jpg']=(m,file)=>m.exports={asset:file};
const React=require('react'),renderer=require('react-test-renderer'),{act}=renderer;
const mk=()=>{const sql=new DatabaseSync(':memory:');return {sql,db:{execSync:s=>sql.exec(s),runSync:(s,...p)=>sql.prepare(s).run(...p),getAllSync:(s,...p)=>sql.prepare(s).all(...p),getFirstSync:(s,...p)=>sql.prepare(s).get(...p),withTransactionSync:f=>{sql.exec('BEGIN');try{f();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}}}};
let current=null;const alerts=[];
const rn={StyleSheet:{create:x=>x},Platform:{OS:'android'},Alert:{alert:(...a)=>alerts.push(a)},
 AppState:{addEventListener:()=>({remove(){}})},BackHandler:{addEventListener:()=>({remove(){}}),exitApp(){}},
 Vibration:{vibrate(){}},Share:{share:async()=>{}},Linking:{openURL:async()=>{}},useWindowDimensions:()=>({width:400,height:800})};
for(const c of ['Image','Modal','Pressable','ScrollView','Switch','Text','TextInput','View','StatusBar','KeyboardAvoidingView','ActivityIndicator'])rn[c]=c;
rn.FlatList=function FlatList(p){return React.createElement('View',null,p.ListHeaderComponent,(p.data||[]).map((item,index)=>React.createElement(React.Fragment,{key:p.keyExtractor?p.keyExtractor(item):index},p.renderItem({item,index}))),!(p.data||[]).length&&p.ListEmptyComponent)};
const bio={hardware:false,result:true,calls:0};
let pickedFile='';
const original=Module._load;
Module._load=function(name,...args){
 if(name==='react-native')return rn;
 if(name==='react-native-safe-area-context')return {SafeAreaProvider:'SafeAreaProvider',SafeAreaView:'SafeAreaView'};
 if(name==='expo-sqlite')return {openDatabaseSync:()=>current};
 if(name==='expo-local-authentication')return {hasHardwareAsync:async()=>bio.hardware,isEnrolledAsync:async()=>bio.hardware,authenticateAsync:async()=>(bio.calls++,{success:bio.result})};
 if(name==='expo-document-picker')return {getDocumentAsync:async()=>({canceled:false,assets:[{uri:'file:///respaldo.json'}]})};
 if(name==='expo-file-system/legacy')return {documentDirectory:'file:///doc/',readAsStringAsync:async()=>pickedFile,readDirectoryAsync:async()=>[],writeAsStringAsync:async()=>{},deleteAsync:async()=>{},getInfoAsync:async()=>({exists:false}),makeDirectoryAsync:async()=>{}};
 if(name.startsWith('expo-'))return {};
 return original.call(this,name,...args);
};
const {createFake}=require('./fakeSupabase.cjs');const fake=createFake();global.fetch=fake.fetch;global.__STORE_CLOUD={url:fake.BASE,anonKey:fake.ANON};
global.__OWNER_SYNC_MS=10**8;global.__SELLER_SYNC_MS=10**8;
const App=require('../App.tsx').default;const {Business}=require('../src/business.ts');const {Cloud}=require('../src/cloud.ts');
function text(node){if(typeof node==='string')return node;return (node.children||[]).map(text).join(' ')}
const H=(ui)=>({
 all:()=>text(ui.root),
 has:(label)=>ui.root.findAll(n=>n.type==='Pressable'&&text(n).includes(label)).length>0,
 async press(label){if(label==='Ajustes'&&!ui.root.findAll(n=>n.type==='Pressable'&&(n.props.accessibilityLabel==='Ajustes'||text(n).trim()==='Ajustes')).length){const v=ui.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityState&&'selected' in n.props.accessibilityState&&text(n).trim()==='Vender');if(v.length)await act(async()=>v[v.length-1].props.onPress());}if(label==='Cuenta'&&!ui.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Cuenta').length&&text(ui.root).includes('Cerrar sesión'))return;let c=ui.root.findAll(n=>n.type==='Pressable'&&text(n).trim()===label&&typeof n.props.onPress==='function');if(!c.length)c=ui.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel===label&&typeof n.props.onPress==='function');if(!c.length)c=ui.root.findAll(n=>n.type==='Pressable'&&text(n).includes(label)&&typeof n.props.onPress==='function').slice(-1);assert(c.length,'botón '+label);await act(async()=>c[0].props.onPress());},
 input:(label)=>ui.root.findAll(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label)[0],
 async type(label,v){const i=this.input(label);assert(i,'campo '+label);await act(async()=>i.props.onChangeText(v));},
 async code(label,raw){for(const ch of raw){const i=this.input(label);assert(i,'campo '+label);await act(async()=>i.props.onChangeText(String(i.props.value||'')+ch));}},
});
const flush=async(n=6,ms=5)=>{for(let i=0;i<n;i++)await act(async()=>{await new Promise(r=>setTimeout(r,ms))})};
const mount=async(db)=>{current=db;let ui;await act(async()=>{ui=renderer.create(React.createElement(App))});await flush();return ui;};
(async()=>{
 // Dueño ya registrado en su teléfono anterior, con código de recuperación.
 const old=new Cloud(global.__STORE_CLOUD,null,()=>{},fake.fetch);old.device='dev-viejo-0123456789';await old.signUp('dueno@gns.mx','secreto1');await old.rpc('claim_owner',{p_name:'Emmanuel'});
 const rec=await old.rpc('create_owner_recovery',{});
 const intruder=new Cloud(global.__STORE_CLOUD,null,()=>{},fake.fetch);await intruder.signUp('intruso@x.mx','secreto2');
 const seed=require('./seed.cjs');const src=mk();const sb=seed(src.db);pickedFile=sb.backup();
 // ---------- Instalación nueva: inicio de sesión con correo y contraseña ----------
 const A=mk();let ui=await mount(A.db);let h=H(ui);
 assert(h.all().includes('Inicia sesión'),'pantalla de inicio de sesión');assert(!h.all().includes('tienda nueva')&&!h.has('Empezar'),'no hay opción de empezar de cero');
 assert(!h.all().includes('REC')&&!h.all().includes('recuperación'),'no pide código REC');
 assert.equal(A.sql.prepare('SELECT COUNT(*) n FROM products').get().n,0,'el APK no trae datos');
 await h.type('Correo','dueno@gns.mx');await h.type('Contraseña','mala');await h.press('Entrar');await flush(6);assert(h.all().includes('Correo o contraseña incorrectos'));
 await h.type('Correo','intruso@x.mx');await h.type('Contraseña','secreto2');await h.press('Entrar');await flush(6);assert(h.all().includes('no tiene acceso a la tienda'),'cuenta sin acceso');assert.equal(new Business(A.db).setting('appRole',null),null);
 // Olvidé mi contraseña: correo con código → contraseña nueva
 await h.press('¿Olvidaste tu contraseña?');await h.type('Tu correo','dueno@gns.mx');await h.press('Enviarme el correo');await flush(6);
 const mail=fake.state.mails.at(-1);assert.equal(mail.to,'dueno@gns.mx');assert(h.all().includes('te llegó un correo'));
 await h.type('Código del correo','000000');await h.type('Contraseña nueva (mínimo 8)','nueva-clave-1');await h.type('Repite la contraseña nueva','nueva-clave-1');await h.press('Guardar contraseña nueva');await flush(6);assert(h.all().includes('venció o no es correcto'),'código equivocado');
 await h.type('Código del correo',mail.code);await h.press('Guardar contraseña nueva');await flush(6);assert(h.all().includes('contraseña cambiada'),'contraseña cambiada');
 // Dueño entra solo con correo y contraseña (sin REC) → restaura su respaldo
 await h.type('Contraseña','secreto1');await h.press('Entrar');await flush(6);assert(h.all().includes('Correo o contraseña incorrectos'),'la anterior ya no sirve');
 await h.type('Contraseña','nueva-clave-1');await h.press('Entrar');await flush(8);assert(h.all().includes('Restaura tu negocio'),'dueño entra');
 assert.equal(await old.rpc('request_join',{p_name:''}),'other_device','el teléfono anterior deja de ser el del dueño');
 await act(async()=>ui.unmount());ui=await mount(A.db);h=H(ui);assert(h.all().includes('Restaura tu negocio'),'si cierra la app vuelve a restaurar');
 pickedFile='{"no":"es un respaldo"}';await h.press('Elegir mi respaldo');await flush(4);assert(h.all().includes('No se pudo restaurar'));assert.equal(new Business(A.db).setting('appRole',null),null);
 pickedFile=sb.backup();await h.press('Elegir mi respaldo');await flush(8);assert(h.all().includes('Clientes')&&h.all().includes('Vender'),'ve su negocio');assert(!h.all().includes('PIN'));
 const b=new Business(A.db);assert.equal(b.setting('appRole',null),'owner');assert.equal(b.setting('ownerVerified',null),null);
 assert(!b.backup().includes('ownerVerified')&&!b.backup().includes(b.setting('cloudSession',null).access_token),'el respaldo no lleva la sesión');
 await h.press('Ajustes');await h.press('Invitar, formas de pago y sincronizar');await flush(6);assert(h.all().includes('Base en línea'),'ya conectado como dueño');assert(!h.all().includes('recuperación'),'sin código de recuperación');
 // 2.1: otro teléfono nuevo del dueño restaura desde la nube (sin buscar el archivo).
 {const {uploadBackup}=require('../src/cloudBackup.ts');const {Cloud}=require('../src/cloud.ts');const {deviceId}=require('../src/device.ts');
  const c=new Cloud(b.setting('cloudConfig',null),b.setting('cloudSession',null),ns=>b.setSetting('cloudSession',ns),fake.fetch);c.device=deviceId(b);const up=await uploadBackup(b,c,'test');
  const Z=mk();const zb=new Business(Z.db);for(const k of ['cloudConfig','cloudSession','deviceId'])zb.setSetting(k,b.setting(k,null));zb.setSetting('ownerVerified',true);
  await act(async()=>ui.unmount());ui=await mount(Z.db);h=H(ui);await flush(6);assert(h.all().includes('Restaura tu negocio')&&h.all().includes('Restaurar de la nube'),'ofrece el respaldo de la nube');
  const part=fake.T.owner_backup_parts.find(x=>x.backup_id===up.id);const good=part.data;part.data='AAAA'+good.slice(4);
  await h.press('Restaurar de la nube');await flush(8);assert(h.all().includes('No se pudo restaurar')&&h.all().includes('verificación'),'respaldo dañado: '+h.all().slice(0,300));assert.equal(new Business(Z.db).setting('appRole',null),null);
  part.data=good;await h.press('Restaurar de la nube');await flush(10);assert(h.all().includes('Clientes')&&h.all().includes('Vender'),'restaurado desde la nube');
  const zr=new Business(Z.db);assert.equal(zr.setting('appRole',null),'owner');assert.equal(zr.stock().length,b.stock().length,'mismo inventario');assert.equal(zr.sales().length,b.sales().length,'mismas ventas');
  await act(async()=>ui.unmount());ui=await mount(A.db);h=H(ui);}
 // El teléfono anterior: se le pide la contraseña para volver a ser dueño (no un código)
 const O=mk();const ob=seed(O.db);ob.setSetting('appRole','owner');ob.setSetting('cloudConfig',global.__STORE_CLOUD);ob.setSetting('deviceId','dev-viejo-0123456789');ob.setSetting('cloudSession',old.session);
 await act(async()=>ui.unmount());ui=await mount(O.db);h=H(ui);await h.press('Ajustes');await h.press('Invitar, formas de pago y sincronizar');await flush(8);
 assert(h.all().includes('se abrió en otro teléfono'),'aviso en el teléfono anterior');await h.type('Tu contraseña','nueva-clave-1');await h.press('Usar este teléfono como dueño');await flush(8);
 assert(h.all().includes('volvió a ser el del dueño'));assert.equal(fake.T.members.find(m=>m.role==='owner').device_id,'dev-viejo-0123456789');
 await act(async()=>ui.unmount());
 console.log('  ✓ inicio de sesión solo con correo y contraseña (sin REC ni empezar de cero), recuperación de contraseña por correo y respaldo del dueño');
 // ---------- Huella opcional, sin PIN ----------
 bio.hardware=true;bio.result=false;ui=await mount(A.db);h=H(ui);await flush(4);
 assert(h.all().includes('Nova Negocio está protegido')&&!h.all().includes('Clientes'),'huella fallida: bloqueado');assert(!h.all().includes('PIN'));
 bio.result=true;await h.press('Desbloquear con huella o rostro');await flush(2);assert(h.all().includes('Clientes'),'abre con huella');
 await h.press('Ajustes');await h.press('Bloquear ahora');assert(h.all().includes('Nova Negocio está protegido'));await h.press('Desbloquear con huella o rostro');await flush(2);
 await h.press('Desactivar bloqueo');assert.equal(new Business(A.db).setting('biometricEnabled',true),false);await act(async()=>ui.unmount());
 ui=await mount(A.db);h=H(ui);await flush(2);assert(h.all().includes('Clientes'),'sin bloqueo si se desactivó');await act(async()=>ui.unmount());
 bio.hardware=false;
 console.log('  ✓ sin PIN: huella o rostro opcionales, Bloquear ahora y desactivar');
 // ---------- Vendedor: directo a conectarse ----------
 const S=mk();ui=await mount(S.db);h=H(ui);await h.press('Tengo un código de invitación');assert(h.all().includes('Soy vendedor nuevo')&&h.all().includes('Ya tengo cuenta'));assert(!h.all().includes('PIN'));
 await act(async()=>ui.unmount());
 console.log('  ✓ el vendedor nuevo va directo a crear su cuenta con código');
 assert.equal(alerts.length,0,JSON.stringify(alerts));
 console.log('DUEÑO Y ACCESO: OK');
})().then(()=>process.exit(process.exitCode||0)).catch(e=>{console.error(e);process.exit(1)});
