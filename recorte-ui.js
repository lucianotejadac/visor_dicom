'use strict';
const $=id=>document.getElementById(id);
const status=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
const VOXEL_LIMIT=128*1024*1024,SLICE_LIMIT=512,ZIP_WARN=400*1024*1024;
const encoder=new TextEncoder(),axes=['coronal','sagittal'];
let seriesList=[],current=null,from=0,to=0,edge='from';
let scout={},layouts={},reference=null,referenceIndex=-1,referenceToken=0,auditToken=0;
let busy=false,cancelled=false,scheduled=false,dragging=null;

function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;draw();});}}
function fit(canvas){
 const box=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5);
 const w=Math.max(1,Math.round(box.width*ratio)),h=Math.max(1,Math.round(box.height*ratio));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 return [w,h];
}
function lock(on){
 busy=on;
 for(const id of ['folder','files','series','fromSlice','toSlice','useRun','useLimit','useAll','projection'])$(id).disabled=on||(!current&&id!=='folder'&&id!=='files');
 $('exportZip').disabled=on||!current;
 $('exportFolder').disabled=on||!current||!window.showDirectoryPicker;
}

/* ---- lectura ---- */
async function readAll(list){
 if(busy)return;
 const files=[...list];
 if(!files.length)return;
 lock(true);
 const accepted=[],skipped=new Map();
 for(let i=0;i<files.length;i++){
  if(i%8===0){status(`Leyendo ${i+1} de ${files.length} archivos…`);await new Promise(done=>setTimeout(done));}
  try{
   const info=DicomAnon.describe(new Uint8Array(await files[i].arrayBuffer()),{projection:true});
   info.file=files[i];info.name=files[i].name;accepted.push(info);
  }catch(error){skipped.set(error.message,(skipped.get(error.message)||0)+1);}
 }
 seriesList=accepted.length?DicomAnon.planSeries(accepted):[];
 const reasons=[...skipped].map(([message,count])=>`${count} × ${message}`).slice(0,3).join(' · ');
 if(!seriesList.length){
  current=null;lock(false);
  status(`Ningún archivo utilizable de ${files.length}. ${reasons}`,true);
  return;
 }
 $('series').replaceChildren(...seriesList.map((series,index)=>
  new Option(`${series.modality} · ${series.slices.length} cortes · serie ${series.seriesNumber||'—'}`,String(index))));
 $('series').value='0';
 status(`${accepted.length} imágenes en ${seriesList.length} serie${seriesList.length>1?'s':''}.`
  +(skipped.size?` ${files.length-accepted.length} descartadas: ${reasons}`:''));
 selectSeries(0);
 lock(false);
}
/* ---- serie y rango ---- */
function selectSeries(index){
 current=seriesList[index];
 const run=DicomAnon.longestRun(current);
 from=run[0];to=run[1];
 if(to-from+1>SLICE_LIMIT)from=to-SLICE_LIMIT+1;
 edge='from';reference=null;referenceIndex=-1;
 $('width').value=Math.min(4000,Math.max(1,current.slices[0].window||400));
 $('level').value=Math.max(-1200,Math.min(2000,current.slices[0].level||40));
 $('coronalEmpty').hidden=true;
 $('seriesInfo').textContent=`${current.nx} × ${current.ny} · ${current.spacing[1].toFixed(2)} × ${current.spacing[0].toFixed(2)} mm`
  +` · espaciado ${Math.abs(current.dz).toFixed(2)} mm · ${current.runs.length} tramo${current.runs.length>1?'s':''} de espaciado uniforme`;
 $('dimensions').textContent=`${current.slices.length} cortes leídos · ${current.nx} × ${current.ny}`;
 if(current.warnings.length)status(current.warnings.join(' · '),true);
 buildScouts();updateAudit();syncInputs();
}
function autoWindow(slices,key){
 const sample=[],step=Math.max(1,Math.floor(slices.length/64));
 for(let i=0;i<slices.length;i+=step)for(const value of slices[i].projection[key])sample.push(value);
 sample.sort((a,b)=>a-b);
 const low=sample[Math.floor(sample.length*.02)],high=sample[Math.floor(sample.length*.98)];
 return high>low?[low,high]:[sample[0],sample[sample.length-1]+1];
}
/* Localizadores coronal y sagital: una fila por corte, construidos una sola vez por serie. */
function buildScouts(){
 const suffix=$('projection').value==='max'?'':'Mean';
 scout={};
 for(const axis of axes){
  const key=axis+suffix,slices=current.slices,rows=slices.length,width=slices[0].projection[key].length;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=rows;
  const context=canvas.getContext('2d'),image=context.createImageData(width,rows);
  const [low,high]=autoWindow(slices,key),span=Math.max(1e-6,high-low);
  for(let row=0;row<rows;row++){
   const values=slices[rows-1-row].projection[key];
   for(let x=0;x<width;x++){
    const grey=Math.max(0,Math.min(255,(values[x]-low)/span*255)),at=4*(x+width*row);
    image.data[at]=image.data[at+1]=image.data[at+2]=grey;image.data[at+3]=255;
   }
  }
  context.putImageData(image,0,0);
  scout[axis]={canvas,width,rows,mm:axis==='coronal'?current.spacing[1]:current.spacing[0]};
 }
 queueReference(true);schedule();
}
function syncInputs(){
 $('fromSlice').value=from+1;$('toSlice').value=to+1;
 $('fromSlice').max=$('toSlice').max=current?current.slices.length:1;
 $('axialEdge').textContent=edge==='from'?'LÍMITE INFERIOR':'LÍMITE SUPERIOR';
 for(const id of ['width','level'])$(id+'Out').textContent=$(id).value;
 updateCrop();schedule();
}
function updateCrop(){
 if(!current)return;
 const count=to-from+1,zFrom=current.slices[from].z,zTo=current.slices[to].z;
 const voxels=current.nx*current.ny*count,run=current.runs.find(r=>from>=r[0]&&to<=r[1]);
 const parts=[`${count} cortes · Z de ${zFrom.toFixed(1)} a ${zTo.toFixed(1)} mm`,
  `${(voxels/1048576).toFixed(1)} M vóxeles · ~${(count*(current.slices[from].bytes||0)/1048576).toFixed(0)} MB`];
 if(!run)parts.push('El rango cruza un salto de cortes: el visor rechazará la serie.');
 else if(voxels>VOXEL_LIMIT)parts.push('Supera los 128 M vóxeles que acepta el visor.');
 else parts.push('Entra en los límites del visor.');
 $('cropInfo').textContent=parts.join(' · ');
 $('cropInfo').classList.toggle('warn',!run||voxels>VOXEL_LIMIT);
}
function moveEdge(index){
 if(!current)return;
 index=Math.max(0,Math.min(current.slices.length-1,index));
 if(edge==='from')from=Math.min(index,to);else to=Math.max(index,from);
 queueReference();syncInputs();
}
/* ---- corte axial de referencia ---- */
function queueReference(force=false){
 if(!current)return;
 const index=edge==='from'?from:to;
 if(index===referenceIndex&&!force)return;
 referenceIndex=index;
 const token=++referenceToken;
 current.slices[index].file.arrayBuffer().then(buffer=>{
  if(token!==referenceToken)return;
  reference=VolumeCore.parse(new Uint8Array(buffer));schedule();
 }).catch(()=>{reference=null;schedule();});
}
/* ---- dibujo ---- */
function draw(){
 for(const axis of axes)drawScout(axis);
 drawAxial();
}
function drawScout(axis){
 const canvas=$(axis),[cw,ch]=fit(canvas),context=canvas.getContext('2d');
 context.fillStyle='#05090e';context.fillRect(0,0,cw,ch);
 const info=scout[axis];if(!info||!current)return;
 const dz=Math.abs(current.dz)||1;
 const scale=Math.max(.001,Math.min((cw-30)/(info.width*info.mm),(ch-30)/(info.rows*dz)));
 const w=info.width*info.mm*scale,h=info.rows*dz*scale,left=(cw-w)/2,top=(ch-h)/2;
 context.imageSmoothingEnabled=true;context.drawImage(info.canvas,left,top,w,h);
 const yTop=top+(info.rows-1-to)*h/info.rows,yBottom=top+(info.rows-from)*h/info.rows;
 context.fillStyle='rgba(5,9,14,.66)';
 context.fillRect(left,top,w,Math.max(0,yTop-top));
 context.fillRect(left,yBottom,w,Math.max(0,top+h-yBottom));
 context.strokeStyle='#51d8c0';
 for(const [y,which] of [[yTop,'to'],[yBottom,'from']]){
  context.lineWidth=edge===which?2.5:1;
  context.beginPath();context.moveTo(left,y);context.lineTo(left+w,y);context.stroke();
 }
 layouts[axis]={left,top,w,h,rows:info.rows};
 $(axis+'Out').textContent=`${to-from+1} de ${info.rows} cortes`;
}
function drawAxial(){
 const canvas=$('axial'),[cw,ch]=fit(canvas),context=canvas.getContext('2d');
 context.fillStyle='#05090e';context.fillRect(0,0,cw,ch);
 if(!reference||!current){$('axialOut').textContent='—';return;}
 const width=Number($('width').value),level=Number($('level').value),low=level-.5-(width-1)/2;
 const off=document.createElement('canvas');off.width=reference.nx;off.height=reference.ny;
 const source=off.getContext('2d'),image=source.createImageData(reference.nx,reference.ny);
 for(let i=0;i<reference.nx*reference.ny;i++){
  const value=reference.data[i],grey=width<=1?(value>level-.5?255:0):Math.max(0,Math.min(255,(value-low)/(width-1)*255));
  image.data[4*i]=image.data[4*i+1]=image.data[4*i+2]=grey;image.data[4*i+3]=255;
 }
 source.putImageData(image,0,0);
 const sx=reference.spacing[1],sy=reference.spacing[0];
 const scale=Math.max(.001,Math.min((cw-30)/(reference.nx*sx),(ch-30)/(reference.ny*sy)));
 const w=reference.nx*sx*scale,h=reference.ny*sy*scale;
 context.imageSmoothingEnabled=true;context.drawImage(off,(cw-w)/2,(ch-h)/2,w,h);
 $('axialOut').textContent=`corte ${referenceIndex+1} · ${reference.position[2].toFixed(1)} mm`;
}
/* ---- auditoría ---- */
async function updateAudit(){
 const token=++auditToken,slice=current.slices[from];
 let result;
 try{result=DicomAnon.anonymize(new Uint8Array(await slice.file.arrayBuffer()),{});}
 catch(error){$('audit').innerHTML='';$('audit').append(section('No se puede reescribir',[error.message],'warn'));return;}
 if(token!==auditToken)return;
 const report=result.report;
 $('auditOut').textContent=`${report.removed.length} eliminados · ${report.cleared.length} vaciados · ${report.replaced.length} reemplazados`;
 const body=$('audit');body.innerHTML='';
 if(report.warnings.length)body.append(section('Avisos',report.warnings,'warn'));
 body.append(section(`Se eliminan (${report.removed.length})`,[report.removed.join(', ')]));
 body.append(section(`Se vacían (${report.cleared.length})`,[report.cleared.join(', ')]));
 body.append(section(`Se reemplazan (${report.replaced.length})`,[report.replaced.join(', ')]));
 body.append(section('Se conservan a propósito',[
  'Píxeles byte a byte, rescale y geometría: las HU no cambian.',
  'Fabricante, modelo, versión, protocolo y parámetros de adquisición (kV, mAs, filtro, grosor).',
  'Sexo del paciente y descripción anatómica; ni el nombre, ni la edad, ni el peso, ni las fechas reales.'],'keep'));
}
function section(title,lines,kind){
 const block=document.createDocumentFragment(),heading=document.createElement('h4');
 heading.textContent=title;block.append(heading);
 for(const line of lines.filter(Boolean)){
  const paragraph=document.createElement('p');
  paragraph.textContent=line;if(kind)paragraph.className=kind;
  block.append(paragraph);
 }
 if(!lines.filter(Boolean).length){const paragraph=document.createElement('p');paragraph.textContent='—';block.append(paragraph);}
 return block;
}
/* ---- exportación ---- */
const pad=(value,size)=>String(value).padStart(size,'0');
function stampNow(){
 const now=new Date();
 return `${now.getFullYear()}${pad(now.getMonth()+1,2)}${pad(now.getDate(),2)}_${pad(now.getHours(),2)}${pad(now.getMinutes(),2)}${pad(now.getSeconds(),2)}`;
}
async function write(directory,name,data){
 const handle=await directory.getFileHandle(name,{create:true});
 const stream=await handle.createWritable();
 await stream.write(data);await stream.close();
}
function download(bytes,name){
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
 const link=document.createElement('a');link.href=url;link.download=name;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),10000);
}
/* El manifiesto acompaña a la salida, así que solo lleva geometría y los UID nuevos:
   nada del estudio original, ni siquiera su descripción. */
function manifest(slices,uids,report,folder){
 const zs=slices.map(info=>info.z);
 return encoder.encode(JSON.stringify({
  carpeta:folder,generado:new Date().toISOString(),herramienta:'Volumina · recortar y anonimizar',
  recorte:{cortes:slices.length,z_min:Math.min(...zs),z_max:Math.max(...zs),
   espaciado_mm:current.dz,matriz:[current.nx,current.ny],
   voxeles:current.nx*current.ny*slices.length,cortes_leidos:current.slices.length},
  study_uid:uids.studyUid,series_uid:uids.seriesUid,frame_of_reference_uid:uids.frameUid,
  paciente:{nombre:DicomAnon.IDENTITY.name,id:DicomAnon.IDENTITY.id,emisor:DicomAnon.IDENTITY.issuer},
  metodo:DicomAnon.IDENTITY.method,
  tags_eliminados:report.removed,tags_vaciados:report.cleared,tags_reemplazados:report.replaced,
  avisos:report.warnings
 },null,1));
}
async function exportSelection(kind){
 if(busy||!current)return;
 const slices=DicomAnon.exportOrder(current.slices.slice(from,to+1));
 if(!slices.length)return;
 const folder=`CT_recorte_${stampNow()}`;
 let directory=null;
 if(kind==='folder'){
  try{directory=await(await window.showDirectoryPicker({mode:'readwrite'})).getDirectoryHandle(folder,{create:true});}
  catch(error){status('Sin carpeta de salida · '+error.message,true);return;}
 }else{
  const estimate=slices.length*(slices[0].bytes||0);
  if(estimate>ZIP_WARN&&!confirm(`El ZIP ocupará unos ${(estimate/1048576).toFixed(0)} MB en memoria del navegador. ¿Continuar?`))return;
 }
 cancelled=false;lock(true);$('cancel').hidden=false;$('progress').hidden=false;
 const uids={studyUid:DicomWrite.uid(),seriesUid:DicomWrite.uid(),frameUid:DicomWrite.uid()};
 const packed=[];let report=null;
 try{
  for(let i=0;i<slices.length;i++){
   if(cancelled)throw Error('cancelada por el usuario');
   const result=DicomAnon.anonymize(new Uint8Array(await slices[i].file.arrayBuffer()),{...uids,instance:i+1});
   const problems=DicomAnon.audit(result.bytes,{uids:result.uids,identity:result.identity,pixelLength:result.pixelLength});
   if(problems.length)throw Error(`auditoría fallida en ${slices[i].name} · ${problems[0]}`);
   report=report||result.report;
   const name=`CT_${pad(i+1,4)}.dcm`;
   if(directory)await write(directory,name,result.bytes);
   else packed.push({name:`${folder}/${name}`,data:result.bytes});
   if(i%4===0||i===slices.length-1){
    $('progressBar').style.width=`${(i+1)/slices.length*100}%`;
    status(`Escribiendo y verificando ${i+1} de ${slices.length} cortes…`);
    await new Promise(done=>setTimeout(done));
   }
  }
  const json=manifest(slices,uids,report,folder);
  if(directory){
   await write(directory,'recorte.json',json);
   status(`Listo · ${slices.length} cortes anonimizados y verificados en ${folder}.`);
  }else{
   packed.push({name:`${folder}/recorte.json`,data:json});
   download(DicomWrite.zip(packed),folder+'.zip');
   status(`Listo · ZIP con ${slices.length} cortes anonimizados y verificados.`);
  }
  $('exportInfo').textContent=`Marco de referencia nuevo: ${uids.frameUid}`;
 }catch(error){status('Exportación detenida · '+error.message,true);}
 finally{lock(false);$('cancel').hidden=true;$('progress').hidden=true;$('progressBar').style.width='0';}
}
/* ---- eventos ---- */
$('folder').addEventListener('change',event=>readAll(event.target.files));
$('files').addEventListener('change',event=>readAll(event.target.files));
$('series').addEventListener('change',event=>selectSeries(Number(event.target.value)));
$('projection').addEventListener('change',()=>{if(current)buildScouts();});
$('fromSlice').addEventListener('change',event=>{edge='from';moveEdge(Number(event.target.value)-1);});
$('toSlice').addEventListener('change',event=>{edge='to';moveEdge(Number(event.target.value)-1);});
$('useRun').addEventListener('click',()=>{
 if(!current)return;
 const run=DicomAnon.longestRun(current);from=run[0];to=run[1];queueReference(true);syncInputs();
});
$('useLimit').addEventListener('click',()=>{
 if(!current)return;
 if(to-from+1>SLICE_LIMIT)from=to-SLICE_LIMIT+1;
 queueReference(true);syncInputs();
});
$('useAll').addEventListener('click',()=>{
 if(!current)return;
 from=0;to=current.slices.length-1;queueReference(true);syncInputs();
});
$('preset').addEventListener('change',event=>{
 const [width,level]=event.target.value.split(',');
 $('width').value=width;$('level').value=level;syncInputs();
});
for(const id of ['width','level'])$(id).addEventListener('input',syncInputs);
$('cancel').addEventListener('click',()=>{cancelled=true;});
$('exportFolder').addEventListener('click',()=>exportSelection('folder'));
$('exportZip').addEventListener('click',()=>exportSelection('zip'));
function indexAt(axis,event){
 const layout=layouts[axis];if(!layout)return null;
 const canvas=$(axis),box=canvas.getBoundingClientRect();
 const y=(event.clientY-box.top)*(canvas.height/Math.max(1,box.height));
 return layout.rows-1-Math.floor((y-layout.top)/layout.h*layout.rows);
}
for(const axis of axes){
 const canvas=$(axis);
 canvas.addEventListener('pointerdown',event=>{
  if(!current||busy)return;
  const index=indexAt(axis,event);if(index===null)return;
  edge=Math.abs(index-from)<=Math.abs(index-to)?'from':'to';
  dragging=axis;canvas.setPointerCapture(event.pointerId);moveEdge(index);
 });
 canvas.addEventListener('pointermove',event=>{
  if(dragging!==axis)return;
  const index=indexAt(axis,event);if(index!==null)moveEdge(index);
 });
 for(const name of ['pointerup','pointercancel'])canvas.addEventListener(name,()=>{dragging=null;});
 canvas.addEventListener('wheel',event=>{
  if(!current||busy)return;
  event.preventDefault();
  moveEdge((edge==='from'?from:to)+(event.deltaY>0?-1:1));
 },{passive:false});
}
/* Arrastrar la carpeta del estudio a la ventana. */
async function fromDrop(transfer){
 const roots=[...transfer.items].map(entry=>entry.webkitGetAsEntry&&entry.webkitGetAsEntry()).filter(Boolean);
 if(!roots.length)return [...transfer.files];
 const files=[],walk=async entry=>{
  if(entry.isFile)return new Promise(done=>entry.file(file=>{files.push(file);done();},done));
  const reader=entry.createReader();
  for(;;){
   const batch=await new Promise((done,fail)=>reader.readEntries(done,fail));
   if(!batch.length)break;
   for(const child of batch)await walk(child);
  }
 };
 for(const entry of roots)await walk(entry);
 return files;
}
document.addEventListener('dragover',event=>{event.preventDefault();document.body.classList.add('dragging');});
document.addEventListener('dragleave',event=>{if(event.relatedTarget===null)document.body.classList.remove('dragging');});
document.addEventListener('drop',async event=>{
 event.preventDefault();document.body.classList.remove('dragging');
 readAll(await fromDrop(event.dataTransfer));
});
addEventListener('resize',schedule);
$('identity').textContent=`${DicomAnon.IDENTITY.name} · ${DicomAnon.IDENTITY.id} · ${DicomAnon.IDENTITY.issuer}`;
if(!window.showDirectoryPicker)$('exportFolder').title='Este navegador no permite escribir carpetas; usa el ZIP.';
lock(false);
