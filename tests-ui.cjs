// Application integration test with a minimal DOM/canvas harness.
// Checks real MPR pixel buffers and event/state transitions; not browser visual QA.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/index.html','utf8'),elements=new Map(),queue=[];
class Element{
 constructor(id=''){this.id=id;this.value='';this.checked=false;this.disabled=false;this.textContent='';this.width=360;this.height=280;this.events={};this.classList={toggle(){},remove(){},add(){}};this.ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),putImageData:image=>this.pixels=image.data,drawImage:off=>this.pixels=off.pixels,fillRect(){},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};}
 addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
 fire(name,details={}){for(const fn of this.events[name]||[])fn({target:this,preventDefault(){},...details});}
 closest(){return null;}
 setPointerCapture(id){this.captured=id;}
 hasPointerCapture(id){return this.captured===id;}
 releasePointerCapture(){this.captured=null;}
 getBoundingClientRect(){return {width:360,height:280,left:0,top:0};}
 click(){this.clicked=true;this.fire('click');}
 toBlob(callback,type){callback({size:128,type});}
 getContext(type){return type==='webgl2'?null:this.ctx;}
 replaceChildren(...options){this.options=options;this.value=options[0]?.value||'';}
 add(option){(this.options??=[]).push(option);if(this.options.length===1)this.value=option.value;}
 checkValidity(){return this.value!==''&&Number.isFinite(Number(this.value))&&Number(this.value)>=-1000&&Number(this.value)<=1000;}
}
for(const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){
 const e=new Element(match[1]);e.value=match[0].match(/\bvalue="([^"]*)"/)?.[1]||'';
 // A browser select reports its first option as the initial value.
 if(match[0].startsWith('<select'))e.value=html.slice(match.index,html.indexOf('</select>',match.index)).match(/<option[^>]*\bvalue="([^"]*)"/)?.[1]||'';
 e.checked=/\bchecked\b/.test(match[0]);elements.set(e.id,e);
}
let lastCreated=null;
const badges=new Map(),document={getElementById:id=>{assert.ok(elements.has(id),'Missing DOM id '+id);return elements.get(id);},querySelector:selector=>{if(!badges.has(selector))badges.set(selector,new Element());return badges.get(selector);},createElement:()=>lastCreated=new Element(),addEventListener(){},body:new Element()};
const context=vm.createContext({console,document,devicePixelRatio:1,Option:class{constructor(text,value){this.text=text;this.value=value;}},ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>queue.push(fn),setTimeout,Float32Array,Uint8Array,Uint8ClampedArray,DataView,TextEncoder,crypto,
 URL:{createObjectURL:()=>'blob:volumina',revokeObjectURL(){}}});
const dicomParser=require('./vendor/dicomParser.min.js');
for(const file of ['core.js','reformat.js','dicomwrite.js','app.js','reformat-ui.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+file,'utf8'),context);
const run=code=>vm.runInContext(code,context),flush=()=>{while(queue.length)queue.shift()();},el=id=>elements.get(id);
let passed=0;function test(name,fn){fn();flush();passed++;console.log('PASS '+name);}
test('Demo creates CT/SPECT pair and physical fusion mapper',()=>{el('demo').fire('click');assert.equal(run('volume.modality'), 'CT');assert.equal(run('spect.modality'),'NM');assert.equal(run('typeof fusionSample'),'function');});
test('All three MPR pixel buffers contain the SPECT color overlay',()=>{for(const name of ['axial','coronal','sagittal']){const p=el(name).pixels;assert.ok(p&&p.some((v,i)=>i%4===0&&v!==p[i+1]),name);}});
test('Hide SPECT restores grayscale in all three planes',()=>{el('fusionEnabled').checked=false;el('fusionEnabled').fire('change');flush();for(const name of ['axial','coronal','sagittal']){const p=el(name).pixels;for(let i=0;i<p.length;i+=4)assert.equal(p[i],p[i+1]);}});
test('Zero opacity preserves base pixels despite enabled fusion',()=>{el('fusionEnabled').checked=true;el('fusionEnabled').fire('change');el('fusionOpacity').value='0';el('fusionOpacity').fire('input');flush();const p=el('axial').pixels;for(let i=0;i<p.length;i+=4)assert.equal(p[i],p[i+1]);el('fusionOpacity').value='60';el('fusionOpacity').fire('input');});
test('Scale sliders cannot cross',()=>{el('spectLow').value='99';el('spectHigh').value='60';el('spectLow').fire('input');assert.equal(Number(el('spectHigh').value),100);el('spectHigh').value='1';el('spectHigh').fire('input');assert.equal(Number(el('spectLow').value),0);el('spectLow').value='5';el('spectHigh').value='100';el('spectLow').fire('input');});
test('Different frame disables fusion until manual mode is explicitly enabled',()=>{run("setSpect({...VolumeCore.demoSpect(),frame:'unregistered'})");assert.equal(run('fusionSample'),null);el('manualFusion').checked=true;el('manualFusion').fire('change');assert.equal(run('typeof fusionSample'),'function');assert.match(el('fusionStatus').textContent,/no registrada/);});
test('Translation with no overlap disables overlay',()=>{el('offsetX').value='1000';el('offsetX').fire('input');assert.equal(run('fusionSample'),null);assert.match(el('fusionStatus').textContent,/No hay superposición/);});
test('Clearing a numeric translation does not silently interpret it as zero',()=>{el('offsetX').value='';el('offsetX').fire('input');assert.equal(run('fusionSample'),null);assert.match(el('fusionStatus').textContent,/válidos/);});
test('Reset translation restores manual overlay and disabling manual removes it',()=>{el('resetOffsets').fire('click');assert.equal(run('typeof fusionSample'),'function');el('manualFusion').checked=false;el('manualFusion').fire('change');assert.equal(run('fusionSample'),null);});
test('Rejected patient mismatch retains the prior SPECT instead of replacing it',()=>{assert.throws(()=>run("setSpect({...VolumeCore.demoSpect(),patientId:'other'})"),/paciente/);assert.equal(run('spect.frame'),'unregistered');});
test('Changing the base clears SPECT, references and manual offsets',()=>{run('setVolume(VolumeCore.demo())');assert.equal(run('spect'),null);assert.equal(run('fusionSample'),null);assert.equal(el('fusionControls').disabled,true);assert.equal(Number(el('offsetX').value),0);});
test('Remove SPECT retains CT and restores plain MPR labels',()=>{el('demo').fire('click');el('removeSpect').fire('click');assert.equal(run('spect'),null);assert.equal(run('volume.modality'),'CT');assert.equal(badges.get('.axial h3 span').textContent,'MPR');});
test('PT overlay is accepted and labeled by its DICOM modality and BQML units',()=>{run("setSpect({...VolumeCore.demoSpect(),modality:'PT',units:'BQML'})");assert.equal(run('typeof fusionSample'),'function');assert.equal(badges.get('.axial h3 span').textContent,'CT + PT');assert.match(el('spectMetadata').textContent,/DICOM PT/);assert.match(el('spectScale').textContent,/Bq\/ml/);assert.match(el('spectScale').textContent,/sin conversión a SUV/);});
test('Loading functional overlay selects its native volume for 3D',()=>{assert.equal(el('volumeSource').value,'spect');assert.equal(run('active3DVolume()===spect'),true);assert.equal(el('functional3dControls').disabled,false);});
test('MIP and VRT use the same selected functional source',()=>{el('mip').fire('click');assert.equal(run('mode'),'mip');assert.equal(el('opacity').disabled,true);assert.equal(run('active3DVolume()===spect'),true);el('vrt').fire('click');assert.equal(el('opacity').disabled,false);assert.equal(run('active3DVolume()===spect'),true);});
test('Switching 3D to CT preserves MPR position and SPECT fusion',()=>{const before=run('JSON.stringify(position)');el('volumeSource').value='base';el('volumeSource').fire('change');assert.equal(run('active3DVolume()===volume'),true);assert.equal(run('parameters3D().functional'),false);assert.equal(run('JSON.stringify(position)'),before);assert.equal(run('typeof fusionSample'),'function');});
test('Functional 3D scale remains independent of MPR fusion scale',()=>{el('volumeSource').value='spect';el('volumeSource').fire('change');const old=el('spectLow').value;el('volumeLow').value='20';el('volumeHigh').value='80';el('volumeLow').fire('input');assert.equal(el('spectLow').value,old);assert.ok(Math.abs(run('parameters3D().low')-run('spectMaximum*.2'))<1e-9);assert.ok(Math.abs(run('parameters3D().high')-run('spectMaximum*.8'))<1e-9);});
test('3D percentage sliders cannot cross',()=>{el('volumeLow').value='99';el('volumeLow').fire('input');assert.equal(Number(el('volumeHigh').value),100);el('volumeHigh').value='1';el('volumeHigh').fire('input');assert.equal(Number(el('volumeLow').value),0);el('volumeLow').value='5';el('volumeHigh').value='100';el('volumeLow').fire('input');});
test('Unregistered SPECT is independently viewable in 3D without enabling fusion',()=>{run("setSpect({...VolumeCore.demoSpect(),frame:'unregistered'})");assert.equal(run('fusionSample'),null);assert.equal(run('active3DVolume()===spect'),true);assert.equal(run('parameters3D().functional'),true);});
test('Removing active SPECT restores CT source and disables unavailable option',()=>{el('removeSpect').fire('click');assert.equal(el('volumeSource').value,'base');assert.equal(el('spect3dOption').disabled,true);assert.equal(run('active3DVolume()===volume'),true);});
test('Standalone PT base uses its own maximum, independent of the CT intensity range',()=>{run("const standalone=VolumeCore.demoSpect();standalone.data=Float32Array.from(standalone.data,x=>x*4148.9);setVolume({...standalone,modality:'PT',units:'BQML',window:400,level:40});");assert.equal(run('parameters3D().functional'),true);assert.ok(run('parameters3D().high')>400000);assert.match(el('volumeScale').textContent,/Bq\/ml/);});
test('Fused 3D selects CT geometry and SPECT intensity scale',()=>{el('demo').fire('click');el('volumeSource').value='fusion';el('volumeSource').fire('change');assert.equal(run('parameters3D().fusion'),true);assert.equal(run('active3DVolume()===volume'),true);assert.equal(run('parameters3D().high'),run('spectMaximum'));assert.equal(el('fusion3dOpacity').disabled,false);assert.equal(run('fusion3DState().ready'),true);});
test('Fused MIP and VRT keep both-volume mode',()=>{el('mip').fire('click');assert.match(el('volumeScale').textContent,/dos proyecciones/);el('vrt').fire('click');assert.match(el('volumeScale').textContent,/profundidad/);assert.equal(el('threshold').disabled,false);});
test('Hiding MPR overlay does not silently disable 3D fusion',()=>{el('fusionEnabled').checked=false;el('fusionEnabled').fire('change');assert.equal(run('fusionSample'),null);assert.equal(run('fusion3DState().ready'),true);});
test('3D fusion blocks unmatched reference frames until manual registration',()=>{run("setSpect({...VolumeCore.demoSpect(),frame:'unregistered'})");el('volumeSource').value='fusion';el('volumeSource').fire('change');assert.equal(run('fusion3DState().ready'),false);assert.match(el('volumeScale').textContent,/bloqueada/);el('manualFusion').checked=true;el('manualFusion').fire('change');assert.equal(run('fusion3DState().ready'),true);assert.match(el('volumeKind').textContent,/MANUAL/);});
test('3D fusion uses the same manual offset and rejects no overlap',()=>{el('offsetX').value='2';el('offsetX').fire('input');assert.equal(run('fusion3DState().offset[0]'),2);el('offsetX').value='1000';el('offsetX').fire('input');assert.equal(run('fusion3DState().ready'),false);});
test('Invalid manual offset blocks 3D fusion',()=>{el('offsetX').value='';el('offsetX').fire('input');assert.equal(run('fusion3DState().ready'),false);});
test('Removing SPECT also disables fused 3D selection',()=>{el('removeSpect').fire('click');assert.equal(el('fusion3dOption').disabled,true);assert.equal(el('volumeSource').value,'base');assert.equal(run('parameters3D().fusion'),false);});
test('Double click expands and restores each of the four panes',()=>{for(const name of ['axial','coronal','sagittal','volume']){const pane=badges.get('.pane.'+name);pane.fire('dblclick');assert.equal(run('expandedPane'),name);for(const other of ['axial','coronal','sagittal','volume'])assert.equal(badges.get('.pane.'+other).hidden,other!==name);pane.fire('dblclick');assert.equal(run('expandedPane'),null);}});
test('Expanded view can be restored by the visible button',()=>{badges.get('.pane.axial').fire('dblclick');assert.equal(el('restoreViews').hidden,false);el('restoreViews').fire('click');assert.equal(run('expandedPane'),null);assert.equal(el('restoreViews').hidden,true);});
test('Double click on controls does not expand panes',()=>{badges.get('.pane.axial').fire('dblclick',{target:{closest:()=>({})}});assert.equal(run('expandedPane'),null);});
test('Outside image click selects zoom and drag changes only that MPR scale',()=>{el('reset').fire('click');flush();const before=run('JSON.stringify(position)');el('axial').fire('pointerdown',{button:0,pointerId:1,clientX:2,clientY:140});el('axial').fire('pointermove',{pointerId:1,clientX:2,clientY:100});el('axial').fire('pointerup',{pointerId:1});assert.ok(run('mprZoom.axial')>1);assert.equal(run('mprZoom.coronal'),1);assert.equal(run('JSON.stringify(position)'),before);assert.equal(el('axial').captured,null);});
test('Wheel after outside click zooms instead of changing slice',()=>{const before=run('position[2]'),old=run('mprZoom.axial');el('axial').fire('wheel',{clientX:180,clientY:140,deltaY:-100,deltaMode:0});assert.ok(run('mprZoom.axial')>old);assert.equal(run('position[2]'),before);});
test('Click inside image exits zoom mode and wheel resumes slices',()=>{el('axial').fire('pointerdown',{button:0,pointerId:2,clientX:180,clientY:140});assert.equal(run('mprZoomMode.axial'),false);const before=run('position[2]'),old=run('mprZoom.axial');el('axial').fire('wheel',{clientX:180,clientY:140,deltaY:100,deltaMode:0});assert.equal(run('position[2]'),before+1);assert.equal(run('mprZoom.axial'),old);});
test('Zoomed image click maps to the correct voxel',()=>{flush();const l=run('layouts.axial'),ix=Math.floor(l.iw*.55),iy=Math.floor(l.ih*.55);el('axial').fire('pointerdown',{button:0,pointerId:3,clientX:l.left+(ix+.5)*l.w/l.iw,clientY:l.top+(iy+.5)*l.h/l.ih});assert.equal(run('position[0]'),ix);assert.equal(run('position[1]'),iy);});
test('Expanding a pane preserves its zoom and current slices',()=>{const old=run('mprZoom.axial'),before=run('JSON.stringify(position)');badges.get('.pane.axial').fire('dblclick');flush();assert.equal(run('mprZoom.axial'),old);assert.equal(run('JSON.stringify(position)'),before);el('restoreViews').fire('click');});
test('Reset restores all MPR zoom factors and modes',()=>{el('reset').fire('click');for(const name of ['axial','coronal','sagittal']){assert.equal(run(`mprZoom.${name}`),1);assert.equal(run(`mprZoomMode.${name}`),false);}});
test('Slice planner offers the two planes perpendicular to the working view and the full extent',()=>{
 el('demo').fire('click');
 assert.deepEqual(el('slicePlane').options.map(o=>o.value),['coronal','sagittal']);
 assert.equal(el('sliceFrom').value,'0.0');
 assert.equal(el('sliceTo').value,(127*1.4).toFixed(1));
 assert.equal(el('sliceContent').value,'fusion');
 assert.match(el('slicePlan').textContent,/corte\(s\) coronales/);
 // Coronal covers 128 × 1.4 mm across and 144 × 1.5 mm down: the square field takes the longer side.
 assert.equal(el('sliceFov').value,'216');
 assert.equal(el('sliceMatrix').value,'128');
});
test('Changing the working window re-offers only the perpendicular planes',()=>{
 el('sliceSource').value='coronal';el('sliceSource').fire('change');
 assert.deepEqual(el('slicePlane').options.map(o=>o.value),['axial','sagittal']);
 assert.equal(el('slicePlane').value,'axial');
 assert.equal(el('sliceTo').value,(143*1.5).toFixed(1));
});
test('Distance and thickness decide the planned count and the number of slab samples',()=>{
 el('sliceDistance').value='10';el('sliceThickness').value='10';el('sliceDistance').fire('input');
 assert.equal(run('slicePlan.count'),22);
 assert.equal(run('slicePlan.samples'),Math.ceil(10/1.5));
 assert.match(el('slicePlan').textContent,/22 corte\(s\) axiales/);
 assert.match(el('slicePlan').textContent,/promedio de 7 muestra/);
 el('sliceThickness').value='4';el('sliceThickness').fire('input');
 assert.match(el('slicePlan').textContent,/huecos entre cortes/);
 el('sliceThickness').value='14';el('sliceThickness').fire('input');
 assert.match(el('slicePlan').textContent,/solapados/);
 el('sliceThickness').value='10';el('sliceThickness').fire('input');
});
test('Generating fills the fourth pane with the slice stack instead of 3D',()=>{
 el('sliceGenerate').fire('click');flush();
 assert.equal(run('mode'),'slices');
 assert.equal(el('sliceCanvas').hidden,false);assert.equal(el('volume').hidden,true);assert.equal(el('sliceIndex').hidden,false);
 assert.ok(el('sliceCanvas').pixels?.some(v=>v>0));
 assert.match(el('volumeKind').textContent,/ \/ 22 /);
});
test('The stack viewer scrolls through generated slices without touching the MPR',()=>{
 const before=Number(el('sliceIndex').value),reference=run('JSON.stringify(position)');
 el('sliceCanvas').fire('wheel',{deltaY:100});flush();
 assert.equal(Number(el('sliceIndex').value),before+1);
 assert.equal(run('JSON.stringify(position)'),reference);
 assert.match(el('volumeKind').textContent,/mm · 10 mm de grosor/);
});
test('Fused content colours the generated slices and base-only keeps them gray',()=>{
 const coloured=el('sliceCanvas').pixels;
 assert.ok(coloured.some((v,i)=>i%4===0&&v!==coloured[i+1]));
 el('sliceContent').value='base';el('sliceContent').fire('change');flush();
 const gray=el('sliceCanvas').pixels;
 for(let i=0;i<gray.length;i+=4)assert.equal(gray[i],gray[i+1]);
 el('sliceContent').value='fusion';el('sliceContent').fire('change');flush();
});
test('Range lines belong to the working window only',()=>{
 assert.equal(run('limitGeometry("axial",layouts.axial)'),null);
 assert.equal(run('!!limitGeometry("coronal",layouts.coronal)'),true);
 assert.equal(run('limitGeometry("coronal",layouts.coronal).direction'),'horizontal');
});
test('Dragging a range line shortens the plan without moving the MPR reference',()=>{
 const y=run('limitGeometry("coronal",layouts.coronal).toScreen(Number($("sliceTo").value))');
 const reference=run('JSON.stringify(position)');
 el('coronal').fire('pointerdown',{button:0,pointerId:9,clientX:180,clientY:y});
 assert.equal(run('limitDrag.id'),'sliceTo');
 el('coronal').fire('pointermove',{pointerId:9,clientX:180,clientY:y+20});
 el('coronal').fire('pointerup',{pointerId:9});
 assert.equal(run('limitDrag'),null);
 assert.equal(run('JSON.stringify(position)'),reference);
 assert.ok(Number(el('sliceTo').value)<214.5);
 assert.ok(run('slicePlan.count')<22);
});
test('Full range restores the whole extent of the output axis',()=>{
 el('sliceFull').fire('click');
 assert.equal(el('sliceTo').value,(143*1.5).toFixed(1));
 assert.equal(run('slicePlan.count'),22);
});
test('Invalid spacing blocks export and says why',()=>{
 el('sliceDistance').value='0';el('sliceDistance').fire('input');
 assert.equal(run('slicePlan'),null);assert.equal(el('sliceExport').disabled,true);
 assert.match(el('slicePlan').textContent,/distancia/);
 el('sliceDistance').value='';el('sliceDistance').fire('input');
 assert.match(el('slicePlan').textContent,/numéricos/);
 el('sliceDistance').value='10';el('sliceDistance').fire('input');
 assert.equal(el('sliceExport').disabled,false);
});
test('Exported slices inherit patient and study identity and are marked derived',()=>{
 run("volume.studyUid='1.2.826.0.1.3680043.9.7';volume.patientName='Prueba^Volumina';volume.studyDate='20260101'");
 const bytes=run('sliceBytes(slicePlan,0,sliceSeriesHeader(slicePlan))'),ds=dicomParser.parseDicom(bytes);
 assert.equal(ds.string('x0020000d'),'1.2.826.0.1.3680043.9.7');
 assert.equal(ds.string('x00100010'),'Prueba^Volumina');
 assert.equal(ds.string('x00080020'),'20260101');
 assert.equal(ds.string('x00200052'),run('volume.frame'));
 assert.equal(ds.string('x00080008'),'DERIVED\\SECONDARY\\REFORMATTED');
 assert.equal(ds.uint16('x00280011'),run('slicePlan.columns'));
 assert.equal(ds.string('x00200037'),'1\\0\\0\\0\\1\\0');
 assert.match(ds.string('x0008103e'),/Fusion CT\+NM/);
 assert.match(ds.string('x00082111'),/no conserva HU/);
});
test('A volume without StudyInstanceUID gets a new study instead of a blank one',()=>{
 run("volume.studyUid=''");
 const header=run('sliceSeriesHeader(slicePlan)');
 assert.equal(header.generatedStudy,true);
 assert.match(header.studyUid,/^2\.25\.\d+$/);
 assert.notEqual(header.seriesUid,header.studyUid);
});
test('Leaving slice mode restores the 3D canvas',()=>{
 el('vrt').fire('click');flush();
 assert.equal(run('mode'),'vrt');
 assert.equal(el('sliceCanvas').hidden,true);assert.equal(el('volume').hidden,false);assert.equal(el('sliceIndex').hidden,true);
});
test('Loading another volume replans from scratch',()=>{
 run('setVolume(VolumeCore.demo())');flush();
 assert.equal(el('sliceContent').value,'base');
 assert.equal(Number(el('sliceIndex').value),0);
 assert.equal(run('slicePlan.plane'),'axial');
});
test('Each MPR maps the two axes it shows, both ways',()=>{
 assert.equal(run('JSON.stringify(viewGeometry("axial",layouts.axial).axes)'),'[0,1]');
 assert.equal(run('JSON.stringify(viewGeometry("coronal",layouts.coronal).axes)'),'[0,2]');
 assert.equal(run('JSON.stringify(viewGeometry("sagittal",layouts.sagittal).axes)'),'[1,2]');
 assert.equal(run('viewGeometry("axial",layouts.axial).direction(0)'),'vertical');
 assert.equal(run('viewGeometry("axial",layouts.axial).direction(1)'),'horizontal');
 for(const [name,axis] of [['coronal',0],['coronal',2],['sagittal',1]])
  assert.ok(run(`Math.abs(viewGeometry("${name}",layouts.${name}).toMillimetres(${axis},viewGeometry("${name}",layouts.${name}).toScreen(${axis},100))-100)`)<1e-6,`${name}/${axis}`);
});
test('The matrix sets the output size and the field of view sets the pixel',()=>{
 assert.equal(el('sliceFov').value,'180');
 assert.equal(el('sliceMatrix').value,'128');
 assert.equal(run('slicePlan.columns'),128);
 assert.ok(Math.abs(run('slicePlan.pixel')-180/128)<1e-9);
 assert.match(el('slicePlan').textContent,/FoV 180 mm · matriz 128 × 128 · 1\.41 mm\/px/);
 el('sliceMatrix').value='512';el('sliceMatrix').fire('change');
 assert.equal(run('slicePlan.columns'),512);
 assert.ok(Math.abs(run('slicePlan.pixel')-180/512)<1e-9);
 assert.match(el('slicePlan').textContent,/matriz 512 × 512/);
 assert.match(el('slicePlan').textContent,/por debajo del vóxel/);
 assert.match(el('slicePlan').textContent,/MB al exportar/);
 el('sliceMatrix').value='128';el('sliceMatrix').fire('change');
});
test('A smaller field of view keeps the matrix and shrinks the pixel',()=>{
 el('sliceFov').value='100';el('sliceFov').fire('input');
 assert.equal(run('slicePlan.columns'),128);
 assert.ok(Math.abs(run('slicePlan.pixel')-100/128)<1e-9);
 assert.match(el('slicePlan').textContent,/FoV 100 mm · matriz 128 × 128/);
 el('sliceFullField').fire('click');
 assert.equal(el('sliceFov').value,'180');
 assert.equal(run('sliceCentre'),null);
});
test('Centring moves the field to the reference and the excess is reported',()=>{
 el('sliceCentre').fire('click');
 assert.equal(run('JSON.stringify(sliceCentre)'),JSON.stringify([64*1.4,64*1.4,72*1.5]));
 assert.equal(run('slicePlan.centre[0]'),64*1.4);
 assert.ok(!/borde negro/.test(el('slicePlan').textContent),'the default field is not reported as excess');
 el('sliceFov').value='400';el('sliceFov').fire('input');
 assert.match(el('slicePlan').textContent,/borde negro/);
 el('sliceFullField').fire('click');
 assert.equal(run('sliceCentre'),null);
});
test('An empty or zero field of view is refused instead of silently ignored',()=>{
 el('sliceFov').value='0';el('sliceFov').fire('input');
 assert.equal(run('slicePlan'),null);
 assert.match(el('slicePlan').textContent,/campo de visión/);
 el('sliceFov').value='';el('sliceFov').fire('input');
 assert.match(el('slicePlan').textContent,/numéricos/);
 el('sliceFullField').fire('click');
 assert.equal(run('slicePlan.field'),180);
});
test('Opening with nothing selected says so instead of staying silent',()=>{
 run('loadFiles([])');
 assert.match(el('status').textContent,/No seleccionaste ningún archivo/);
 assert.match(el('status').textContent,/Ctrl\+A/);
 run("loadFiles([],'spect')");
 assert.match(el('status').textContent,/ningún archivo funcional/);
});
test('A single CT file explains that a volume needs the whole series',()=>{
 run("groups=new Map([['una',[{uid:'una'}]]]);$('series').replaceChildren(new Option('una serie','una'));selectSeries();");
 assert.match(el('status').textContent,/un solo corte/);
 assert.match(el('status').textContent,/Ctrl\+A/);
 run("spectGroups=new Map([['una',[{uid:'una'}]]]);$('spectSeries').replaceChildren(new Option('una serie','una'));selectSpectSeries();");
 assert.match(el('status').textContent,/multiframe/);
 el('demo').fire('click');
});
test('The series name follows the output plane until it is typed over',()=>{
 assert.equal(el('sliceName').value,'VOLUMINA_AXIAL');
 el('slicePlane').value='sagittal';el('slicePlane').fire('change');
 assert.equal(el('sliceName').value,'VOLUMINA_SAGITAL');
 el('sliceName').value='Rodilla derecha';el('sliceName').fire('input');
 el('slicePlane').value='axial';el('slicePlane').fire('change');
 assert.equal(el('sliceName').value,'Rodilla derecha','a typed name is never overwritten');
 assert.equal(run('seriesName()'),'Rodilla_derecha');
 assert.match(run('exportFolderName(slicePlan,new Date())'),/^Rodilla_derecha_\d{8}_\d{6}$/);
 assert.match(run('seriesDescription(slicePlan)'),/^Rodilla_derecha /);
});
test('An unusable name falls back to the automatic one',()=>{
 el('sliceName').value='///';el('sliceName').fire('input');
 assert.equal(run('seriesName()'),'VOLUMINA_AXIAL');
 el('sliceName').value='CT/SPECT: cadera*izq';el('sliceName').fire('input');
 assert.equal(run('seriesName()'),'CTSPECT_caderaizq');
 el('sliceName').value='VOLUMINA_AXIAL';el('sliceName').fire('input');
});
test('PNG export saves what the fourth pane shows and refuses when there is nothing',()=>{
 el('vrt').fire('click');flush();
 el('exportPng').fire('click');
 assert.match(el('status').textContent,/No hay imagen 3D/);
 el('sliceGenerate').fire('click');flush();
 el('sliceIndex').value='2';el('sliceIndex').fire('input');flush();
 el('exportPng').fire('click');
 assert.ok(lastCreated.clicked,'the download link was activated');
 assert.match(lastCreated.download,/^VOLUMINA_AXIAL_CORTE_0003_\d{8}_\d{6}\.png$/,lastCreated.download);
 assert.match(el('status').textContent,/Imagen guardada como VOLUMINA_AXIAL_CORTE_0003/);
 assert.match(el('status').textContent,/no un DICOM/);
});
test('Slice canvas zoom works like MPR: margin triggers zoom',()=>{
 el('sliceGenerate').fire('click');flush();
 run('sliceZoom=1');const before=run('sliceZoom');
 el('sliceCanvas').fire('wheel',{clientX:2,clientY:140,deltaY:-100,deltaMode:0});flush();
 assert.ok(run('sliceZoom')>before,'margin wheel should zoom');
 const zoomedIn=run('sliceZoom');
 el('sliceCanvas').fire('wheel',{clientX:2,clientY:140,deltaY:100,deltaMode:0});flush();
 assert.ok(run('sliceZoom')<zoomedIn,'margin wheel should zoom out');
});
test('Slice canvas inside image with wheel changes corte, outside margin does not',()=>{
 const index=Number(el('sliceIndex').value);
 el('sliceCanvas').fire('wheel',{clientX:180,clientY:140,deltaY:100,deltaMode:0});flush();
 assert.equal(Number(el('sliceIndex').value),index+1,'inside wheel should advance');
});
test('Slice canvas pointer drag from margin zooms',()=>{
 const before=run('sliceZoom'),index=Number(el('sliceIndex').value);
 el('sliceCanvas').fire('pointerdown',{button:0,pointerId:5,clientX:2,clientY:140});
 assert.equal(run('sliceZoomMode'),true);
 el('sliceCanvas').fire('pointermove',{pointerId:5,clientX:2,clientY:80});
 el('sliceCanvas').fire('pointerup',{pointerId:5});flush();
 assert.ok(run('sliceZoom')>before,'drag from margin should zoom');
 assert.equal(Number(el('sliceIndex').value),index,'zoom should not change index');
 run('sliceZoom=1');flush();
});
console.log(`${passed} application integration tests passed (DOM/canvas harness, no browser).`);
// Export drives the File System Access API, so it runs against a recording stand-in.
(async()=>{
 const saved={folders:[],files:[]},existing=new Set();
 const folderHandle=name=>({getFileHandle:async file=>({createWritable:async()=>({write:async bytes=>saved.files.push({folder:name,file,length:bytes.length}),close:async()=>{}})})});
 const directory={getDirectoryHandle:async(name,options)=>{
  if(options&&options.create){existing.add(name);saved.folders.push(name);return folderHandle(name);}
  if(existing.has(name))return folderHandle(name);
  throw Object.assign(new Error('NotFound'),{name:'NotFoundError'});
 }};
 context.showDirectoryPicker=async()=>directory;
 context.exportDirectory=directory;
 let count=0;
 const check=async(name,fn)=>{await fn();flush();count++;console.log('PASS '+name);};
 el('sliceMatrix').value='64';el('sliceMatrix').fire('change');
 el('sliceDistance').value='100';el('sliceDistance').fire('input');
 const planned=run('slicePlan.count');
 await check('Export writes the whole series inside a folder of its own',async()=>{
  await run('exportSlices()');
  assert.equal(saved.folders.length,1);
  assert.match(saved.folders[0],/^VOLUMINA_AXIAL_\d{8}_\d{6}$/,saved.folders[0]);
  assert.equal(saved.files.length,planned);
  assert.deepEqual(saved.files.map(f=>f.file),Array.from({length:planned},(_,k)=>`VOL_AXIAL_${String(k+1).padStart(4,'0')}.dcm`));
  assert.ok(saved.files.every(f=>f.folder===saved.folders[0]&&f.length>1000));
  assert.match(el('status').textContent,new RegExp(`en la carpeta ${saved.folders[0]}`));
 });
 await check('The saving dialog opens, counts every slice and closes when done',async()=>{
  assert.equal(el('saveDialog').hidden,true);
  assert.equal(Number(el('saveProgress').value),planned);
  assert.equal(Number(el('saveProgress').max),planned);
  assert.match(el('saveStatus').textContent,new RegExp(`corte ${planned} de ${planned}`));
  assert.match(el('saveTarget').textContent,/^Carpeta VOLUMINA_AXIAL_/);
 });
 await check('A second export never reuses the first folder',async()=>{
  const first=await run('createExportFolder(exportDirectory,"CARPETA")');
  const second=await run('createExportFolder(exportDirectory,"CARPETA")');
  assert.equal(first.name,'CARPETA');
  assert.equal(second.name,'CARPETA_2');
 });
 await check('Cancelling stops the export and says how much was written',async()=>{
  saved.files.length=0;saved.folders.length=0;
  el('sliceDistance').value='4';el('sliceDistance').fire('input');flush();
  const total=run('slicePlan.count');
  const running=run('exportSlices()');
  await new Promise(r=>setTimeout(r,0));
  el('saveCancel').fire('click');
  await running;
  assert.ok(saved.files.length<total,`${saved.files.length} de ${total}`);
  assert.equal(el('saveDialog').hidden,true);
  assert.match(el('status').textContent,/Exportación cancelada tras \d+ de \d+/);
  assert.equal(saved.folders.length,1,'the cancelled run still used one folder');
 });
 await check('A write failure keeps the dialog open with the reason',async()=>{
  context.showDirectoryPicker=async()=>({getDirectoryHandle:async()=>{throw Error('sin permiso de escritura');}});
  await run('exportSlices()');
  assert.equal(el('saveDialog').hidden,false);
  assert.match(el('saveStatus').textContent,/No se pudo guardar: sin permiso de escritura/);
  assert.equal(el('saveCancel').textContent,'Cerrar');
  el('saveCancel').fire('click');
  assert.equal(el('saveDialog').hidden,true);
 });
 console.log(`${count} export tests passed (File System Access stand-in, no real files).`);
})();
// Optional local-data import check. Original files stay in place; no snapshots or patient logs.
if(process.argv[2]){
 (async()=>{
  const path=require('node:path'),dir=process.argv[2],files=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile());
  context.dicomParser=require('./vendor/dicomParser.min.js');
  context.localFirstBytes=new Uint8Array(fs.readFileSync(path.join(dir,files[0].name)));
  context.localFiles=files.map(e=>({name:e.name,size:fs.statSync(path.join(dir,e.name)).size,arrayBuffer:async()=>{const b=fs.readFileSync(path.join(dir,e.name));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}}));
  // A synthetic CT base exercises the import flow only; this is not a clinical fusion test.
  run("const localFrame=VolumeCore.parseFrames(localFirstBytes)[0];setVolume({...VolumeCore.demo(),description:'Synthetic CT base for import test',frame:localFrame.frame,patientId:localFrame.patientId,issuer:localFrame.issuer,origin:localFrame.position});");
  await run("loadFiles(localFiles,'spect')");flush();
  assert.equal(run('spect?.modality'),'PT','Local PT files must reach functional import');
  assert.equal(run('spect?.nz'),files.length);assert.equal(run('spect?.units'),'BQML');assert.equal(run('loading'),false);
  assert.ok(run('spect.data.every(Number.isFinite)'));assert.match(el('spectScale').textContent,/Bq\/ml/);
  console.log('PASS local PT directory: '+files.length+' files imported through application; BQML preserved. Synthetic CT base only, no real CT alignment verified.');
  run('volume=null;clearSpect();');
  await run("loadFiles(localFiles,'spect')");flush();
  assert.equal(run('volume?.modality'),'PT');assert.equal(run('spect'),null);assert.equal(run('volume?.nz'),files.length);
  assert.equal(run('parameters3D().functional'),true);assert.ok(run('parameters3D().high')>0);
  console.log('PASS standalone local PT import: no CT required; 3D selects functional base with its native intensity scale.');
 })().catch(()=>{console.error('FAIL local import check (patient details suppressed)');process.exitCode=1;});
}
