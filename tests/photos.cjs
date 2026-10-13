// Pruebas de fotos: compresión JPG en JS, orientación EXIF, migración y respaldo con fotos.
const fs=require('fs'),Module=require('module'),ts=require('typescript'),assert=require('node:assert/strict'),path=require('path'),os=require('os');
for(const extension of ['.ts','.tsx']) require.extensions[extension]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,file);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-'))+'/';
const fsMock={documentDirectory:'file://'+dir,EncodingType:{Base64:'base64'},
 makeDirectoryAsync:async u=>fs.mkdirSync(u.replace('file://',''),{recursive:true}),
 writeAsStringAsync:async(u,v,o)=>fs.writeFileSync(u.replace('file://',''),o&&o.encoding==='base64'?Buffer.from(v,'base64'):v),
 readAsStringAsync:async(u,o)=>{const b=fs.readFileSync(u.replace('file://',''));return o&&o.encoding==='base64'?b.toString('base64'):b.toString('utf8')},
 readDirectoryAsync:async u=>fs.readdirSync(u.replace('file://','')),deleteAsync:async u=>fs.rmSync(u.replace('file://',''),{force:true})};
const original=Module._load;Module._load=function(n,...a){if(n==='expo-file-system/legacy')return fsMock;return original.call(this,n,...a)};
const ph=require('../src/photos.ts');const {Business}=require('../src/business.ts');const {DatabaseSync}=require('node:sqlite');
(async()=>{
 const src=process.argv[2]||path.join(dir,'source');
 if(!process.argv[2]) {
  fs.mkdirSync(src,{recursive:true});
  const width=1536,height=1024,pixels=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,green=x<180&&y<180;pixels[i]=green?10:210;pixels[i+1]=green?220:25;pixels[i+2]=20;pixels[i+3]=255;}
  const jpeg=require('jpeg-js').encode({data:pixels,width,height},90).data;
  for(const o of [1,6]) {
   const exif=Buffer.alloc(32);exif.write('Exif\0\0',0,'binary');exif.write('II',6);exif.writeUInt16LE(42,8);exif.writeUInt32LE(8,10);exif.writeUInt16LE(1,14);exif.writeUInt16LE(0x112,16);exif.writeUInt16LE(3,18);exif.writeUInt32LE(1,20);exif.writeUInt16LE(o,24);
   const header=Buffer.from([0xff,0xe1,0,exif.length+2]);
   fs.writeFileSync(path.join(src,'o'+o+'.jpg'),Buffer.concat([jpeg.subarray(0,2),header,exif,jpeg.subarray(2)]));
  }
 }
 const realBuffer=global.Buffer;
 for(const [name,o,w,h] of [['o6.jpg',6,683,1024],['o1.jpg',1,1024,683]]){
  const b64=fs.readFileSync(path.join(src,name)).toString('base64');
  const bytes=ph.base64ToBytes(b64);assert.equal(ph.bytesToBase64(bytes),b64,'base64 ida y vuelta');
  assert.equal(ph.exifOrientation(bytes),o);
  delete global.Buffer; // como en Hermes
  const t0=Date.now();let out;try{out=ph.compressJpegBase64(b64)}finally{global.Buffer=realBuffer}
  const ms=Date.now()-t0;
  const img=require('jpeg-js').decode(Buffer.from(out,'base64'),{useTArray:true});
  assert.equal(img.width,w);assert.equal(img.height,h);
  // la esquina verde debe quedar arriba a la derecha (o6) o arriba a la izquierda (o1)
  const px=(x,y)=>{const i=(y*img.width+x)*4;return [img.data[i],img.data[i+1],img.data[i+2]]};
  const green=([r,g])=>g>150&&r<80;
  if(o===6){assert.ok(green(px(img.width-10,10)),'orientación 6');assert.ok(!green(px(10,10)))}else assert.ok(green(px(10,10)),'orientación 1');
  console.log(`  ✓ ${name}: ${Math.round(b64.length*0.75/1024)} KB → ${Math.round(out.length*0.75/1024)} KB, ${img.width}×${img.height}, ${ms} ms`);
 }
 assert.equal(typeof global.Buffer,'function','Buffer original restaurado');
 // Migración y respaldo
 const sql=new DatabaseSync(':memory:');const b=new Business({execSync:s=>sql.exec(s),runSync:(s,...p)=>sql.prepare(s).run(...p),getAllSync:(s,...p)=>sql.prepare(s).all(...p),getFirstSync:(s,...p)=>sql.prepare(s).get(...p),withTransactionSync:f=>{sql.exec('BEGIN');try{f();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}});
 const p=b.addProduct('X-1','Foto','Cat',100,1);const small=fs.readFileSync(path.join(src,'o1.jpg')).toString('base64');
 b.setProductPhoto(p,'data:image/jpeg;base64,'+small);
 assert.equal(await ph.migratePhotos(b),1);const uri=b.productPhotos()[0].imageUri;assert.ok(uri.startsWith('file://'+dir+'fotos/'));
 assert.ok(!b.backup().includes(small.slice(0,200)),'el respaldo crudo ya no lleva la foto');
 const full=await ph.inlinePhotos(b.backup());assert.ok(full.includes('data:image/jpeg;base64,'+small.slice(0,100)),'el respaldo exportado incluye la foto');
 console.log('  ✓ migración a archivos y respaldo con fotos incrustadas');
 fs.writeFileSync(dir+'fotos/huerfana.jpg','x');assert.equal(await ph.removeOrphanPhotos(b),1);assert.ok(fs.existsSync(uri.replace('file://','')));
 console.log('  ✓ limpieza de fotos huérfanas');
 const saved=await ph.importPhoto({uri:'file://'+path.join(src,'o6.jpg'),mimeType:'image/jpeg',size:fs.statSync(path.join(src,'o6.jpg')).size});assert.ok(fs.statSync(saved.replace('file://','')).size<400000);
 await assert.rejects(ph.importPhoto({uri:'x',mimeType:'image/gif',size:10}),/JPG, PNG o WebP/);
 console.log('  ✓ importar foto de la galería');
 console.log('Fotos: OK');
})().catch(e=>{console.error(e);process.exit(1)});
