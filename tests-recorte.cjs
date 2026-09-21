// Prueba de integración de recorte.html con un DOM/canvas mínimo.
// Comprueba el plan de recorte, el arrastre de los límites y la exportación real, no el aspecto visual.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
globalThis.dicomParser=require('./vendor/dicomParser.min.js');
const {dicom}=require('./tests-fixture.cjs');
const html=fs.readFileSync(__dirname+'/recorte.html','utf8'),elements=new Map(),queue=[];

class Node{
 constructor(){this.children=[];this.textContent='';}
 append(...nodes){for(const node of nodes)this.children.push(node);}
 get text(){return [this.textContent,...this.children.map(child=>child.text||'')].join(' ');}
}
class Element extends Node{
 constructor(id=''){
  super();
  this.id=id;this.value='';this.disabled=false;this.hidden=false;this.width=360;this.height=280;
  this.className='';this.title='';this.style={};this.events={};this.classes=new Set();
  this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),
   toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name),
   contains:name=>this.classes.has(name)};
  this.ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),
   putImageData:image=>{this.pixels=image.data;},drawImage:source=>{this.drawn=source;},
   fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},setLineDash(){}};
 }
 set innerHTML(value){this.children=[];this.textContent=value;}
 get innerHTML(){return this.text;}
 addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
 fire(name,details={}){for(const fn of this.events[name]||[])fn({target:this,preventDefault(){},...details});}
 getBoundingClientRect(){return {width:360,height:280,left:0,top:0};}
 getContext(){return this.ctx;}
 setPointerCapture(){}
 replaceChildren(...options){this.options=options;this.value=options[0]?.value||'';}
 click(){this.clicked=true;}
}
for(const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){
 const element=new Element(match[1]);
 element.value=match[0].match(/\bvalue="([^"]*)"/)?.[1]||'';
 if(match[0].startsWith('<select'))
  element.value=html.slice(match.index,html.indexOf('</select>',match.index)).match(/<option[^>]*\bvalue="([^"]*)"/)?.[1]||'';
 elements.set(element.id,element);
}
const created=[];
const document={
 getElementById:id=>{assert.ok(elements.has(id),'Falta el id '+id);return elements.get(id);},
 createElement:tag=>{const element=new Element();element.tag=tag;created.push(element);return element;},
 createDocumentFragment:()=>new Node(),
 querySelector:()=>new Element(),addEventListener(){},body:new Element()
};
let picked=null,zipped=null;
function fakeDirectory(){
 const files=new Map();
 return {files,folder:null,
  async getDirectoryHandle(name){this.folder=name;return this;},
  async getFileHandle(name){
   const store=files;let buffer=null;
   return {async createWritable(){return {async write(bytes){buffer=bytes;},async close(){store.set(name,buffer);}};}};
  }};
}
const context=vm.createContext({
 console,document,devicePixelRatio:1,setTimeout,queueMicrotask,dicomParser:globalThis.dicomParser,
 requestAnimationFrame:fn=>queue.push(fn),addEventListener(){},
 Option:class{constructor(text,value){this.text=text;this.value=value;}},
 Blob:class{constructor(parts){zipped=parts[0];}},
 URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},
 confirm:()=>true,crypto,
 Float32Array,Float64Array,Uint8Array,Uint8ClampedArray,DataView,TextEncoder,Promise,Math,JSON,Date,Number,String,Object,Array,Set,Map,Error,isNaN
});
context.window=context;
context.showDirectoryPicker=async()=>{picked=fakeDirectory();return picked;};
for(const file of ['core.js','dicomwrite.js','anon.js','recorte-ui.js'])
 vm.runInContext(fs.readFileSync(__dirname+'/'+file,'utf8'),context);
const run=code=>vm.runInContext(code,context),flush=()=>{while(queue.length)queue.shift()();};
// Los objetos creados dentro del sandbox tienen otro prototipo: se comparan por JSON.
const json=code=>JSON.parse(vm.runInContext(`JSON.stringify(${code})`,context));
const el=id=>elements.get(id);
const file=(name,bytes)=>({name,size:bytes.length,
 arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)});
// Ocho cortes contiguos de 2 mm, un salto y dos cortes más: el caso de una serie real incompleta.
const zs=[0,2,4,6,8,10,12,14,30,32];
const series=zs.map((z,i)=>file(`CT_${i}`,dicom({z,instance:i+1})));
const settle=async()=>{for(let i=0;i<40;i++)await new Promise(done=>setTimeout(done));flush();};

let passed=0;
async function test(name,fn){await fn();flush();passed++;console.log('PASS '+name);}

(async()=>{
await test('La carga agrupa la serie y parte del tramo contiguo más largo',async()=>{
 el('folder').fire('change',{target:{files:series}});
 await settle();
 assert.equal(run('seriesList.length'),1);
 assert.equal(run('current.slices.length'),10);
 assert.deepEqual(json('current.runs'),[[0,7],[8,9]]);
 assert.deepEqual([run('from'),run('to')],[0,7]);
 assert.match(el('status').textContent,/10 imágenes en 1 serie/);
 assert.match(el('seriesInfo').textContent,/espaciado 2\.00 mm · 2 tramos/);
});
await test('El plan de recorte informa cortes, milímetros y compatibilidad con el visor',()=>{
 assert.match(el('cropInfo').textContent,/^8 cortes · Z de 0\.0 a 14\.0 mm/);
 assert.match(el('cropInfo').textContent,/Entra en los límites del visor/);
 assert.equal(el('cropInfo').classes.has('warn'),false);
});
await test('Los localizadores tienen una fila por corte y se dibujan',()=>{
 assert.deepEqual([run('scout.coronal.rows'),run('scout.coronal.width')],[10,2]);
 assert.deepEqual([run('scout.sagittal.rows'),run('scout.sagittal.width')],[10,2]);
 assert.ok(el('coronal').drawn,'el localizador coronal no se dibujó');
 assert.match(el('coronalOut').textContent,/8 de 10 cortes/);
});
await test('Arrastrar sobre el localizador mueve el límite más cercano y avisa del salto',async()=>{
 el('coronal').fire('pointerdown',{clientY:15,pointerId:1});
 await settle();
 assert.equal(run('edge'),'to');
 assert.deepEqual([run('from'),run('to')],[0,9]);
 assert.match(el('cropInfo').textContent,/cruza un salto de cortes/);
 assert.ok(el('cropInfo').classes.has('warn'));
});
await test('La rueda mueve el límite activo de a un corte',async()=>{
 el('coronal').fire('wheel',{deltaY:1});
 await settle();
 assert.equal(run('to'),8);
 el('coronal').fire('wheel',{deltaY:-1});
 await settle();
 assert.equal(run('to'),9);
});
await test('El corte axial de referencia sigue al límite activo',async()=>{
 assert.equal(run('referenceIndex'),9);
 assert.match(el('axialOut').textContent,/corte 10 · 32\.0 mm/);
 assert.equal(el('axialEdge').textContent,'LÍMITE SUPERIOR');
});
await test('Los botones de rango vuelven al tramo contiguo y al total',async()=>{
 el('useAll').fire('click');await settle();
 assert.deepEqual([run('from'),run('to')],[0,9]);
 el('useRun').fire('click');await settle();
 assert.deepEqual([run('from'),run('to')],[0,7]);
});
await test('Los números del panel también fijan el rango',async()=>{
 el('fromSlice').value='3';el('fromSlice').fire('change',{target:el('fromSlice')});
 await settle();
 assert.deepEqual([run('from'),run('to')],[2,7]);
 assert.equal(run('edge'),'from');
 el('useRun').fire('click');await settle();
});
await test('La auditoría enumera lo que sale y lo que se conserva',()=>{
 const body=el('audit').text;
 assert.match(body,/Se eliminan/);
 assert.match(body,/InstitutionName/);
 assert.match(body,/Tags privados \(2\)/);
 assert.match(body,/Se vacían/);
 assert.match(body,/AccessionNumber/);
 assert.match(body,/PatientName/);
 assert.match(body,/Se conservan a propósito/);
 assert.match(el('auditOut').textContent,/eliminados · 4 vaciados/);
});
await test('Exportar a carpeta escribe los cortes anonimizados y verificados',async()=>{
 el('exportFolder').fire('click');
 await settle();
 assert.ok(picked,'no se pidió carpeta');
 assert.match(picked.folder,/^CT_recorte_\d{8}_\d{6}$/);
 const names=[...picked.files.keys()];
 assert.equal(names.length,9,'8 cortes y el manifiesto');
 assert.deepEqual(names.slice(0,8),Array.from({length:8},(_,i)=>`CT_${String(i+1).padStart(4,'0')}.dcm`));
 assert.match(el('status').textContent,/Listo · 8 cortes anonimizados y verificados/);
});
await test('Cada corte escrito pasa la auditoría y comparte los UID nuevos',()=>{
 const {audit}=context.DicomAnon;
 const read=name=>globalThis.dicomParser.parseDicom(picked.files.get(name));
 const sops=new Set(),studies=new Set(),frames=new Set();
 for(let i=1;i<=8;i++){
  const name=`CT_${String(i).padStart(4,'0')}.dcm`,ds=read(name);
  studies.add(ds.string('x0020000d'));frames.add(ds.string('x00200052'));sops.add(ds.string('x00080018'));
  assert.equal(ds.string('x00100010').trim(),'ANONIMO^RECORTE');
  assert.equal(ds.string('x00200013').trim(),String(i),'InstanceNumber renumerado');
  assert.deepEqual([...audit(picked.files.get(name),{uids:{study:ds.string('x0020000d'),series:ds.string('x0020000e'),frame:ds.string('x00200052'),sop:ds.string('x00080018')}})],[]);
 }
 assert.equal(studies.size,1);assert.equal(frames.size,1);assert.equal(sops.size,8);
});
await test('El manifiesto lleva los UID nuevos y nada del estudio original',()=>{
 const manifest=JSON.parse(Buffer.from(picked.files.get('recorte.json')).toString('utf8'));
 assert.equal(manifest.recorte.cortes,8);
 assert.deepEqual([manifest.recorte.z_min,manifest.recorte.z_max],[0,14]);
 assert.equal(manifest.paciente.id,'VOLUMINA-ANON-001');
 assert.ok(manifest.frame_of_reference_uid.startsWith('2.25.'));
 const texto=JSON.stringify(manifest);
 for(const secreto of ['ROSAS','12457618','HOSPITAL','ONCOLOGICO','20260916','1.3.12.2.1107'])
  assert.ok(!texto.includes(secreto),'el manifiesto filtra '+secreto);
});
await test('El ZIP contiene los mismos archivos cuando no hay carpeta',async()=>{
 zipped=null;
 el('exportZip').fire('click');
 await settle();
 assert.ok(zipped&&zipped.length>1000,'no se generó el ZIP');
 const text=Buffer.from(zipped).toString('latin1');
 assert.ok(text.includes('CT_0001.dcm')&&text.includes('CT_0008.dcm')&&text.includes('recorte.json'));
 assert.ok(!text.includes('ROSAS DIAZ'),'el ZIP filtra el nombre del paciente');
 assert.ok(created.some(element=>element.tag==='a'&&element.clicked),'no se disparó la descarga');
});
console.log(`\n${passed} pruebas correctas`);
})().catch(error=>{console.error(error);process.exit(1);});
