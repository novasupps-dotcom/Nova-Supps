// Pruebas de la foto del producto en iPhone (Fotos, cámara y Archivos → JPG ≤ 1024 px).
const fs=require('fs'),Module=require('module'),ts=require('typescript'),assert=require('node:assert/strict');
for(const extension of ['.ts','.tsx']) require.extensions[extension]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,file);
let choice=0,perm=true,picked=null,docPicked=null;const log=[];
const ref=(w,h,uri)=>({width:w,height:h,uri,released:false,release(){this.released=true;log.push('release '+uri)},
 async saveAsync(o){log.push('save '+JSON.stringify(o));return {uri:'file:///cache/out.jpg',width:w,height:h}}});
const manipulator={SaveFormat:{JPEG:'jpeg',PNG:'png'},ImageManipulator:{manipulate(src){const steps=[];const isRef=typeof src!=='string';
 return {resize(s){steps.push(s);log.push('resize '+JSON.stringify(s));return this},
  async renderAsync(){if(!isRef){log.push('load '+src);const [w,h]=src.includes('big')?[4032,3024]:src.includes('tall')?[3024,4032]:[800,600];return ref(w,h,src)}
   let {width:w,height:h}=src;for(const s of steps){if(s.width){h=Math.round(h*s.width/w);w=s.width}else{w=Math.round(w*s.height/h);h=s.height}}return ref(w,h,'render')}}}}};
const imagePicker={UIImagePickerPreferredAssetRepresentationMode:{Compatible:'compatible'},
 async requestCameraPermissionsAsync(){log.push('perm');return {granted:perm}},
 async launchCameraAsync(o){log.push('camera '+JSON.stringify(o));return picked},
 async launchImageLibraryAsync(o){log.push('library '+JSON.stringify(o));return picked}};
const rn={ActionSheetIOS:{showActionSheetWithOptions(o,cb){log.push('sheet '+o.options.join('|'));setTimeout(()=>cb(choice),0)}}};
const docPicker={async getDocumentAsync(o){log.push('files '+o.type);return docPicked}};
const original=Module._load;Module._load=function(n,...a){
 if(n==='react-native')return rn;if(n==='expo-document-picker')return docPicker;if(n==='expo-image-picker')return imagePicker;if(n==='expo-image-manipulator')return manipulator;
 if(n==='expo-file-system/legacy')return {};return original.call(this,n,...a)};
const {pickPhotoIOS}=require('../src/iosPhoto.ts');
(async()=>{
 choice=0;assert.equal(await pickPhotoIOS(),null,'cancelar no elige nada');assert.ok(log[0].includes('Elegir de Fotos|Tomar foto|Elegir de Archivos'));
 console.log('  ✓ menú con Fotos, cámara y Archivos; cancelar no hace nada');
 log.length=0;choice=1;picked={canceled:false,assets:[{uri:'file:///big.heic',mimeType:'image/heic'}]};
 let r=await pickPhotoIOS();assert.deepEqual(r,{uri:'file:///cache/out.jpg',mimeType:'image/jpeg',size:null});
 assert.ok(log.some(x=>x.startsWith('library')&&x.includes('"compatible"')&&x.includes('"images"')),'pide formato compatible (HEIC → JPG)');
 assert.ok(log.includes('resize {"width":1024}'),'foto horizontal: 1024 de ancho');assert.ok(log.includes('save {"compress":0.8,"format":"jpeg"}'));
 assert.ok(!log.includes('perm'),'Fotos no pide permiso de cámara');assert.ok(log.filter(x=>x.startsWith('release')).length===2,'libera memoria');
 console.log('  ✓ Fotos: HEIC grande → JPG de 1024 px');
 log.length=0;picked={canceled:false,assets:[{uri:'file:///tall.png'}]};await pickPhotoIOS();assert.ok(log.includes('resize {"height":1024}'),'foto vertical: 1024 de alto');
 log.length=0;picked={canceled:false,assets:[{uri:'file:///small.png'}]};r=await pickPhotoIOS();assert.ok(!log.some(x=>x.startsWith('resize')),'foto chica no se agranda');assert.equal(r.mimeType,'image/jpeg','PNG se guarda como JPG');
 log.length=0;picked={canceled:true,assets:null};assert.equal(await pickPhotoIOS(),null,'cerrar Fotos sin elegir');
 console.log('  ✓ fotos verticales, chicas, PNG y cancelación');
 log.length=0;choice=2;perm=false;await assert.rejects(pickPhotoIOS(),/Ajustes → Nova Negocio → Cámara/);assert.ok(!log.some(x=>x.startsWith('camera')),'sin permiso no abre la cámara');
 perm=true;log.length=0;picked={canceled:false,assets:[{uri:'file:///big.jpg'}]};r=await pickPhotoIOS();assert.equal(r.uri,'file:///cache/out.jpg');assert.ok(log.includes('perm')&&log.some(x=>x.startsWith('camera')));
 console.log('  ✓ cámara: pide permiso y avisa si se negó');
 log.length=0;choice=3;docPicked={canceled:false,assets:[{uri:'file:///big.webp'}]};r=await pickPhotoIOS();assert.ok(log.includes('files image/*'));assert.equal(r.mimeType,'image/jpeg');
 docPicked={canceled:true};assert.equal(await pickPhotoIOS(),null);
 console.log('  ✓ Archivos: cualquier imagen → JPG');
 const bad=manipulator.ImageManipulator.manipulate;manipulator.ImageManipulator.manipulate=()=>({async renderAsync(){throw new Error('formato raro')},resize(){return this}});
 docPicked={canceled:false,assets:[{uri:'file:///x.raw'}]};await assert.rejects(pickPhotoIOS(),/No se pudo leer esa foto/);manipulator.ImageManipulator.manipulate=bad;
 console.log('  ✓ imagen ilegible: mensaje claro');
 // Android nunca carga los módulos nativos de iPhone.
 const src=fs.readFileSync(__dirname+'/../src/iosPhoto.ts','utf8');assert.ok(!/^import (?!type ).*from "expo-image-(picker|manipulator)"/m.test(src),'solo import type');
 const app=fs.readFileSync(__dirname+'/../App.tsx','utf8');assert.ok(/Platform\.OS === "ios"\) file = await pickPhotoIOS\(\)/.test(app),'solo en iPhone');
 console.log('  ✓ en Android no se cargan los módulos de iPhone');
})().catch(e=>{console.error(e);process.exit(1)});
