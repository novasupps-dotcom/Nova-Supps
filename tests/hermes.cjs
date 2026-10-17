// 2.5.2 · Catálogo por WhatsApp como en el teléfono (Hermes): sin Buffer global.
// En 2.5.0/2.5.1 las fotos PNG se convertían con jpeg-js directo y en Android salía
// «Property 'Buffer' doesn't exist». Aquí se quita Buffer y se manda el catálogo completo.
const fs=require('fs'),path=require('path'),Module=require('module'),ts=require('typescript'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const NodeBuffer=Buffer;
global.IS_REACT_ACT_ENVIRONMENT=true;
for(const extension of ['.ts','.tsx']) require.extensions[extension]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,file);
require.extensions['.jpg']=(m,file)=>m.exports={asset:file};require.extensions['.png']=(m,file)=>m.exports={asset:file};require.extensions['.webp']=(m,file)=>m.exports={asset:file};
const React=require('react'),renderer=require('react-test-renderer'),{act}=renderer;
const opened=[],notes=[];
const rn={StyleSheet:{create:x=>x},Platform:{OS:'android'},Alert:{alert(){}},Share:{share:async()=>{}},Linking:{openURL:async u=>{opened.push(u)}},useWindowDimensions:()=>({width:400,height:800})};
for(const c of ['Image','Modal','Pressable','ScrollView','Switch','Text','TextInput','View','StatusBar','KeyboardAvoidingView','ActivityIndicator'])rn[c]=c;
// Archivos del teléfono: una foto PNG con transparencia, una JPG grande y una «descarga» de internet.
const ROOT=path.resolve(__dirname,'..');
const files={'file:///fotos/logo.png':fs.readFileSync(path.join(ROOT,'assets/logo/ggg_novasupps.png'))};
const remote={'https://proveedor.mx/foto.png':fs.readFileSync(path.join(ROOT,'assets/logo/icono_app.png'))};
{const {encode}=require('jpeg-js');const w=900,h=900,d=NodeBuffer.alloc(w*h*4);for(let i=0;i<d.length;i++)d[i]=(i*7919)%251;files['file:///fotos/grande.jpg']=NodeBuffer.from(encode({data:d,width:w,height:h},95).data);}
const fsMock={documentDirectory:'file:///doc/',cacheDirectory:'file:///cache/',EncodingType:{Base64:'base64'},
 getInfoAsync:async u=>({exists:!!files[u]}),
 downloadAsync:async(u,to)=>{if(!remote[u])return {status:404};files[to]=remote[u];return {status:200,uri:to}},
 writeAsStringAsync:async(u,v)=>{files[u]=NodeBuffer.from(v,'base64')},
 readAsStringAsync:async u=>{if(!files[u])throw new Error('no existe '+u);return NodeBuffer.from(files[u]).toString('base64')}};
const original=Module._load;
Module._load=function(name,...args){
 if(name==='react-native')return rn;
 if(name==='react-native-safe-area-context')return {SafeAreaProvider:'SafeAreaProvider',SafeAreaView:'SafeAreaView'};
 if(name==='expo-file-system/legacy')return fsMock;
 if(name==='expo-sharing')return {shareAsync:async()=>{}};
 if(name==='expo-image-manipulator')return {ImageManipulator:{manipulate(){throw new Error('sin convertidor')}}};
 if(name.startsWith('expo-'))return {};
 return original.call(this,name,...args);
};
function text(node){if(typeof node==='string')return node;return (node.children||[]).map(text).join(' ')}
const sql=new DatabaseSync(':memory:');
const db={execSync:s=>sql.exec(s),runSync:(s,...p)=>sql.prepare(s).run(...p),getAllSync:(s,...p)=>sql.prepare(s).all(...p),getFirstSync:(s,...p)=>sql.prepare(s).get(...p),withTransactionSync:f=>{sql.exec('BEGIN');try{f();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
const b=require('./seed.cjs')(db);
const {CustomerCatalogPage,photoFor}=require('../src/screens/CustomerCatalog.tsx');
const {jpegSize}=require('../src/pdf.ts');const {base64ToBytes}=require('../src/photos.ts');
(async()=>{
 // Fotos: PNG del teléfono, PNG descargada y JPG grande (se reduce) — todo sin Buffer.
 const products=b.stock().filter(p=>!p.archived);
 products[0].cleanImageUri='file:///fotos/logo.png';
 products[1].cleanImageUri='https://proveedor.mx/foto.png';
 products[2].cleanImageUri='file:///fotos/grande.jpg';
 products[3].cleanImageUri='https://proveedor.mx/no-existe.webp';
 delete globalThis.Buffer;
 try{
  for(const i of [0,1,2]){
   const ph=await photoFor({...products[i],imageKey:products[i].imageKey,uris:[products[i].cleanImageUri]});
   assert(ph&&ph.kind==='jpeg'&&jpegSize(base64ToBytes(ph.base64)),'foto '+i+' convertida a JPG sin Buffer');
  }
  assert.equal(typeof globalThis.Buffer,'undefined','no deja un Buffer prestado');
  // Pantalla: Ana con WhatsApp → «Enviar catálogo…» sube el PDF y abre su chat con el enlace.
  const ana=b.saveCustomer({name:'Alejandra Calderon',phone:'5611232702'});
  const uploads=[];
  const cloud={session:{access_token:'x'},uploadPublic:async(bucket,p,bytes,type)=>{uploads.push({bucket,p,bytes,type});return 'https://x.supabase.co/storage/v1/object/public/'+bucket+'/'+p}};
  let ui;
  await act(async()=>{ui=renderer.create(React.createElement(CustomerCatalogPage,{b,products,customers:b.customers(),feeBps:406,notify:t=>notes.push(t),getCloud:()=>cloud,initialCustomerId:typeof ana==='string'?ana:b.customers().find(c=>c.name==='Alejandra Calderon').id}))});
  const send=ui.root.findAll(n=>n.type==='Pressable'&&/Enviar catálogo a Alejandra por WhatsApp/.test(text(n)));
  assert(send.length,'botón de enviar');
  await act(async()=>{await send[0].props.onPress()});
  for(let i=0;i<20&&!opened.length;i++)await act(async()=>{await new Promise(r=>setTimeout(r,50))});
  const all=text(ui.root);
  assert(!/Buffer/.test(all),'sin error de Buffer: '+all.slice(0,300));
  assert.equal(uploads.length,1,'PDF subido');const pdf=NodeBuffer.from(uploads[0].bytes);
  assert.equal(pdf.slice(0,5).toString(),'%PDF-');assert.equal(uploads[0].type,'application/pdf');
  assert(pdf.includes('/DCTDecode'),'con fotos');
  assert(opened[0].startsWith('https://wa.me/525611232702?text='),'abre el chat de Alejandra');
  assert(decodeURIComponent(opened[0]).includes('/storage/v1/object/public/catalogos/'),'con el enlace');
  assert(notes.includes('Catálogo enviado a Alejandra Calderon'),'avisa: '+notes.join(' | '));
  assert.equal(typeof globalThis.Buffer,'undefined');
  await act(async()=>ui.unmount());
 }finally{globalThis.Buffer=NodeBuffer}
 // Nadie más usa jpeg-js directo (debe pasar por photos.ts, que presta Buffer).
 const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
 const direct=walk(path.join(ROOT,'src')).filter(f=>/\.tsx?$/.test(f)&&!f.endsWith('photos.ts')&&/from "jpeg-js"|require\("jpeg-js"\)/.test(fs.readFileSync(f,'utf8')));
 assert.deepEqual(direct,[],'jpeg-js solo desde src/photos.ts');
 console.log('  ✓ catálogo por WhatsApp sin Buffer (como Hermes): PNG, PNG descargada y JPG grande; PDF subido y chat abierto');
 console.log('HERMES: OK');
})().catch(e=>{globalThis.Buffer=NodeBuffer;console.error(e.stack||e);process.exitCode=1});
