/* Slice planner, stack viewer and DICOM export. Loaded after app.js and reads its state
   (volume, spect, fusionSample, mode). No network access: files are written by the user. */
'use strict';
// Source view → image axes. Coronal and sagittal rows run from superior down, as in drawSlices.
const SOURCE_AXES={axial:{horizontal:0,vertical:1,flip:false},coronal:{horizontal:0,vertical:2,flip:true},sagittal:{horizontal:1,vertical:2,flip:true}};
const PLANE_LABELS={axial:'Axial',coronal:'Coronal',sagittal:'Sagital'};
let slicePlan=null,sliceImage=null,limitDrag=null,sliceExporting=false,sliceContentChosen=false;
const sliceInputs=['sliceDistance','sliceThickness','sliceFrom','sliceTo'];
const sliceNumber=id=>Number($(id).value);
function sliceAxis(){const frame=Reformat.PLANES[$('slicePlane').value];return frame?frame.axis:2;}
function sliceExtent(axis){const box=Reformat.bounds(volume);return box[axis];}
function refreshPlaneOptions(){
 const source=$('sliceSource').value,previous=$('slicePlane').value,options=Object.keys(Reformat.PLANES).filter(p=>p!==source);
 $('slicePlane').replaceChildren(...options.map(p=>new Option(PLANE_LABELS[p],p)));
 $('slicePlane').value=options.includes(previous)?previous:options[0];
}
function resetSliceRange(){
 if(!volume)return;
 const [from,to]=sliceExtent(sliceAxis());
 $('sliceFrom').value=from.toFixed(1);$('sliceTo').value=to.toFixed(1);
}
function sliceContentIsFusion(){return $('sliceContent').value==='fusion'&&!!fusionSample;}
// The fused overlay is the default whenever it exists, unless the user picked otherwise.
function refreshSliceContent(){
 const select=$('sliceContent'),option=(select.options?[...select.options]:[]).find(o=>o.value==='fusion');
 if(option)option.disabled=!fusionSample;
 if(!fusionSample&&select.value==='fusion')select.value='base';
 if(fusionSample&&!sliceContentChosen)select.value='fusion';
}
function planOptions(){
 return {plane:$('slicePlane').value,distance:sliceNumber('sliceDistance'),thickness:sliceNumber('sliceThickness'),
  combine:$('sliceCombine').value,from:sliceNumber('sliceFrom'),to:sliceNumber('sliceTo')};
}
function updateSlicePlan(){
 slicePlan=null;$('sliceExport').disabled=true;
 if(!volume){$('slicePlan').textContent='Carga un volumen para planificar cortes.';return null;}
 // An empty field is not zero: refuse it instead of planning a silent default.
 if(sliceInputs.some(id=>$(id).value===''||!Number.isFinite(sliceNumber(id)))){$('slicePlan').textContent='Introduce distancia, grosor y rango numéricos.';schedule();return null;}
 try{
  slicePlan=Reformat.plan(volume,planOptions());
  const p=slicePlan,thin=p.thickness<volume.spacing[p.axis]-1e-6;
  $('slicePlan').textContent=`${p.count} corte(s) ${p.name}es · ${p.columns} × ${p.rows} px · ${p.pixel.toFixed(2)} mm/px · `+
   `${p.distance} mm entre cortes, ${p.thickness} mm de grosor (${Reformat.COMBINERS[p.combine]} de ${p.samples} muestra(s))`+
   (thin?' · grosor menor que el vóxel: corte interpolado, no añade información.':'')+
   (p.distance>p.thickness?' · quedan huecos entre cortes.':p.distance<p.thickness?' · cortes solapados.':'');
  $('sliceExport').disabled=false;
 }catch(e){$('slicePlan').textContent=e.message;}
 if(slicePlan&&Number($('sliceIndex').max)!==slicePlan.count-1){
  $('sliceIndex').max=slicePlan.count-1;
  $('sliceIndex').value=Math.min(Number($('sliceIndex').value),slicePlan.count-1);
 }
 sliceImage=null;schedule();
 return slicePlan;
}
function resetSlicePlanner(){
 sliceContentChosen=false;
 refreshPlaneOptions();refreshSliceContent();resetSliceRange();
 $('sliceIndex').max=0;$('sliceIndex').value=0;sliceImage=null;
 updateSlicePlan();
}
function fusionSettings(){
 if(!sliceContentIsFusion())return null;
 return {sample:fusionSample,low:spectMaximum*Number($('spectLow').value)/100,high:spectMaximum*Number($('spectHigh').value)/100,alpha:Number($('fusionOpacity').value)/100};
}
function renderSliceImage(index){
 if(!slicePlan||!volume)return null;
 const k=Math.max(0,Math.min(slicePlan.count-1,index));
 if(sliceImage&&sliceImage.index===k&&sliceImage.plan===slicePlan&&sliceImage.stamp===sliceStamp())return sliceImage;
 const result=Reformat.renderSlice(slicePlan,k,{volume,window:$('width').value,level:$('level').value,fusion:fusionSettings()});
 sliceImage={index:k,plan:slicePlan,stamp:sliceStamp(),...result};
 return sliceImage;
}
// Any display setting that changes the rendered pixels invalidates the cached slice.
function sliceStamp(){return [$('width').value,$('level').value,$('sliceContent').value,$('fusionOpacity').value,$('spectLow').value,$('spectHigh').value,fusionSample?1:0].join('|');}
function drawSlicePreview(){
 if(mode!=='slices')return;
 const canvas=$('sliceCanvas');
 if(!canvas||(expandedPane&&expandedPane!=='volume'))return;
 const [cw,ch]=fit(canvas),ctx=canvas.getContext('2d');
 ctx.fillStyle='#05090e';ctx.fillRect(0,0,cw,ch);
 const image=slicePlan?renderSliceImage(Number($('sliceIndex').value)):null;
 if(!image){$('volumeKind').textContent='Cortes · sin plan';return;}
 const off=document.createElement('canvas');off.width=image.columns;off.height=image.rows;
 const offContext=off.getContext('2d'),buffer=offContext.createImageData(image.columns,image.rows);
 buffer.data.set(image.rgba);offContext.putImageData(buffer,0,0);
 const scale=Math.max(.001,Math.min((cw-24)/image.columns,(ch-24)/image.rows)),w=image.columns*scale,h=image.rows*scale;
 ctx.imageSmoothingEnabled=true;ctx.drawImage(off,(cw-w)/2,(ch-h)/2,w,h);
 const p=slicePlan,mm=p.centers[image.index];
 $('volumeTitle').textContent=`CORTES ${p.name.toUpperCase()}`;
 $('volumeKind').textContent=`${image.index+1} / ${p.count} · ${mm.toFixed(1)} mm · ${p.thickness} mm de grosor`;
 $('volumeLegend').textContent=sliceContentIsFusion()?'Fusión CT + SPECT en color · derivado':'Volumen base · derivado';
}
function syncSliceMode(){
 const active=mode==='slices';
 $('sliceCanvas').hidden=!active;$('volume').hidden=active;$('sliceIndex').hidden=!active;
 if(!active){$('volumeLegend').textContent='Girar · Arrastrar';$('volumeError').textContent='';}
 schedule();
}
// Range limits drawn on the working view; they are planes perpendicular to the output slices.
function limitGeometry(name,layout){
 if(!volume||!layout||name!==$('sliceSource').value)return null;
 const limits=Reformat.limitsOn(name,$('slicePlane').value);
 if(!limits)return null;
 const map=SOURCE_AXES[name],axis=limits.axis,count=[volume.nx,volume.ny,volume.nz][axis];
 const toScreen=mm=>{
  const index=(mm-volume.origin[axis])/volume.spacing[axis];
  if(limits.direction==='vertical')return layout.left+(index+.5)/layout.iw*layout.w;
  const j=map.flip?count-1-index:index;
  return layout.top+(j+.5)/layout.ih*layout.h;
 };
 const toMillimetres=coordinate=>{
  let index;
  if(limits.direction==='vertical')index=(coordinate-layout.left)/layout.w*layout.iw-.5;
  else{const j=(coordinate-layout.top)/layout.h*layout.ih-.5;index=map.flip?count-1-j:j;}
  return volume.origin[axis]+index*volume.spacing[axis];
 };
 return {...limits,toScreen,toMillimetres,layout};
}
function reformatOverlay(name,ctx,layout){
 const geometry=limitGeometry(name,layout);
 if(!geometry)return;
 const from=sliceNumber('sliceFrom'),to=sliceNumber('sliceTo');
 if(!Number.isFinite(from)||!Number.isFinite(to))return;
 const vertical=geometry.direction==='vertical',a=geometry.toScreen(from),b=geometry.toScreen(to);
 const low=Math.min(a,b),high=Math.max(a,b),l=layout;
 ctx.fillStyle='rgba(5,9,14,.55)';
 if(vertical){ctx.fillRect(l.left,l.top,Math.max(0,low-l.left),l.h);ctx.fillRect(high,l.top,Math.max(0,l.left+l.w-high),l.h);}
 else{ctx.fillRect(l.left,l.top,l.w,Math.max(0,low-l.top));ctx.fillRect(l.left,high,l.w,Math.max(0,l.top+l.h-high));}
 if(slicePlan&&slicePlan.axis===geometry.axis&&slicePlan.count<=160){
  ctx.strokeStyle='#7ad7ff55';ctx.lineWidth=1;ctx.beginPath();
  for(const centre of slicePlan.centers){const c=geometry.toScreen(centre);
   if(vertical){ctx.moveTo(c,l.top);ctx.lineTo(c,l.top+l.h);}else{ctx.moveTo(l.left,c);ctx.lineTo(l.left+l.w,c);}}
  ctx.stroke();
 }
 ctx.strokeStyle='#7ad7ff';ctx.lineWidth=2;ctx.beginPath();
 for(const c of [a,b]){if(vertical){ctx.moveTo(c,l.top);ctx.lineTo(c,l.top+l.h);}else{ctx.moveTo(l.left,c);ctx.lineTo(l.left+l.w,c);}}
 ctx.stroke();ctx.lineWidth=1;
}
function reformatPointerDown(name,point,event,canvas){
 const geometry=limitGeometry(name,layouts[name]);
 if(!geometry)return false;
 const coordinate=geometry.direction==='vertical'?point.x:point.y;
 const distances=[['sliceFrom',Math.abs(geometry.toScreen(sliceNumber('sliceFrom'))-coordinate)],['sliceTo',Math.abs(geometry.toScreen(sliceNumber('sliceTo'))-coordinate)]];
 const [id,distance]=distances.sort((a,b)=>a[1]-b[1])[0];
 if(!Number.isFinite(distance)||distance>10)return false;
 limitDrag={id,name,pointerId:event.pointerId};
 if(canvas&&canvas.setPointerCapture)canvas.setPointerCapture(event.pointerId);
 return true;
}
function reformatPointerMove(name,point,event){
 if(!limitDrag||limitDrag.name!==name||!point)return false;
 const geometry=limitGeometry(name,layouts[name]);
 if(!geometry)return false;
 const [low,high]=sliceExtent(geometry.axis);
 const millimetres=Math.max(low,Math.min(high,geometry.toMillimetres(geometry.direction==='vertical'?point.x:point.y)));
 $(limitDrag.id).value=millimetres.toFixed(1);
 updateSlicePlan();
 return true;
}
function reformatPointerUp(event,canvas){
 if(!limitDrag||(event&&event.pointerId!==undefined&&event.pointerId!==limitDrag.pointerId))return false;
 limitDrag=null;
 if(canvas&&canvas.hasPointerCapture&&canvas.hasPointerCapture(event?.pointerId))canvas.releasePointerCapture(event.pointerId);
 return true;
}
function seriesDescription(p){
 const content=sliceContentIsFusion()?`Fusion ${volume.modality}+${spect.modality}`:volume.modality;
 return `${content} ${PLANE_LABELS[p.plane]} ${p.thickness} mm/${p.distance} mm DERIVADO`.slice(0,64);
}
function derivationText(p){
 return `Reformateo multiplanar ${p.name} generado por Volumina desde "${volume.description}". `+
  `Distancia entre cortes ${p.distance} mm, grosor ${p.thickness} mm, ${Reformat.COMBINERS[p.combine]} de ${p.samples} muestra(s) `+
  `combinadas en las intensidades originales antes de aplicar ventana y color. `+
  (sliceContentIsFusion()?`Superposición funcional ${spect.modality} en color sobre el volumen base. `:'')+
  `Imagen en color derivada: no conserva HU ni unidades funcionales y no sirve para medir. Prototipo sin validación clínica.`;
}
function sliceFileName(p,k){return `VOL_${p.plane.toUpperCase()}_${String(k+1).padStart(4,'0')}.dcm`;}
function sliceSeriesHeader(p){
 const studyUid=volume.studyUid||DicomWrite.uid();
 return {studyUid,seriesUid:DicomWrite.uid(),frameUid:volume.frame||'',
  patientName:volume.patientName||'',patientId:volume.patientId||'',issuer:volume.issuer||'',
  studyId:volume.studyId||'',studyDate:volume.studyDate||'',studyTime:volume.studyTime||'',accession:volume.accession||'',referring:volume.referring||'',
  seriesNumber:9000+Math.floor(Math.random()*900),seriesDescription:seriesDescription(p),derivation:derivationText(p),
  pixelSpacing:[p.pixel,p.pixel],orientation:p.orientation,sliceThickness:p.thickness,spacingBetweenSlices:p.distance,
  now:new Date(),generatedStudy:!volume.studyUid};
}
function sliceBytes(p,k,header){
 const image=Reformat.renderSlice(p,k,{volume,window:$('width').value,level:$('level').value,fusion:fusionSettings()});
 return DicomWrite.secondaryCapture({...header,rgb:Reformat.toRgb24(image.rgba),columns:p.columns,rows:p.rows,
  position:p.position(k),sliceLocation:p.location(k),instanceNumber:k+1});
}
async function exportSlices(){
 if(sliceExporting)return;
 const p=updateSlicePlan();
 if(!p)return;
 const header=sliceSeriesHeader(p),estimate=p.columns*p.rows*3*p.count;
 let directory=null,entries=null;
 if(typeof showDirectoryPicker==='function'){
  try{directory=await showDirectoryPicker({mode:'readwrite',id:'volumina-cortes'});}
  catch(e){status('Exportación cancelada; no se escribió ningún archivo.');return;}
 }else if(estimate>384*1024*1024){
  status(`Este navegador solo puede descargar un ZIP y la serie ocuparía ${Math.round(estimate/1048576)} MB. Reduce el rango o usa Chrome/Edge para escribir en una carpeta.`,true);return;
 }else entries=[];
 sliceExporting=true;$('sliceExport').disabled=true;
 try{
  for(let k=0;k<p.count;k++){
   const bytes=sliceBytes(p,k,header),name=sliceFileName(p,k);
   if(directory){const file=await directory.getFileHandle(name,{create:true}),stream=await file.createWritable();await stream.write(bytes);await stream.close();}
   else entries.push({name,data:bytes});
   if(k%4===0){status(`Exportando corte ${k+1} de ${p.count}…`);await new Promise(r=>setTimeout(r,0));}
  }
  if(entries){
   if(typeof Blob!=='function')throw Error('Este navegador no permite descargar el ZIP');
   const blob=new Blob([DicomWrite.zip(entries)],{type:'application/zip'}),link=document.createElement('a');
   link.href=URL.createObjectURL(blob);link.download=`volumina_${p.plane}.zip`;link.click();
   setTimeout(()=>URL.revokeObjectURL(link.href),10000);
  }
  status(`${p.count} corte(s) ${p.name}es exportados como Secondary Capture RGB${directory?' en la carpeta elegida':' en un ZIP'}. `+
   `Serie derivada, sin HU ni unidades funcionales.${header.generatedStudy?' El volumen no traía StudyInstanceUID: la serie se creó en un estudio nuevo.':''}`);
 }catch(e){status(`No se pudo exportar: ${e.message}. Los cortes ya escritos permanecen en la carpeta.`,true);}
 finally{sliceExporting=false;$('sliceExport').disabled=!slicePlan;}
}
$('sliceSource').addEventListener('change',()=>{refreshPlaneOptions();resetSliceRange();updateSlicePlan();});
$('slicePlane').addEventListener('change',()=>{resetSliceRange();updateSlicePlan();});
$('sliceFull').addEventListener('click',()=>{resetSliceRange();updateSlicePlan();});
for(const id of ['sliceDistance','sliceThickness','sliceFrom','sliceTo'])$(id).addEventListener('input',updateSlicePlan);
for(const id of ['sliceCombine','sliceContent'])$(id).addEventListener('change',()=>{if(id==='sliceContent')sliceContentChosen=true;sliceImage=null;updateSlicePlan();});
$('sliceGenerate').addEventListener('click',()=>{
 if(!updateSlicePlan())return;
 setMode('slices');
 $('sliceIndex').value=Math.floor((slicePlan.count-1)/2);
 status(`${slicePlan.count} corte(s) ${slicePlan.name}es planificados. Rueda o barra para recorrerlos; exporta cuando estén como quieres.`);
 schedule();
});
$('sliceExport').addEventListener('click',exportSlices);
$('sliceIndex').addEventListener('input',()=>{sliceImage=null;schedule();});
$('sliceCanvas').addEventListener('wheel',e=>{
 e.preventDefault();
 if(!slicePlan)return;
 const next=Math.max(0,Math.min(slicePlan.count-1,Number($('sliceIndex').value)+Math.sign(e.deltaY)));
 $('sliceIndex').value=next;sliceImage=null;schedule();
},{passive:false});
