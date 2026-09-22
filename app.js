'use strict';
const $=id=>document.getElementById(id),names=['axial','coronal','sagittal'];
let volume=null,position=[0,0,0],groups=new Map(),loading=false,mode='vrt',yaw=.35,pitch=.12,zoom=1,scheduled=false;
let spect=null,spectGroups=new Map(),spectMaximum=0,fusionSample=null;
let baseMaximum=0,uploadedVolume=null,uploadedSpect=null;
const status=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
const layouts={};
const mprZoom=Object.fromEntries(names.map(n=>[n,1])),mprZoomMode=Object.fromEntries(names.map(n=>[n,false]));
const mprPan=Object.fromEntries(names.map(n=>[n,[0,0]]));
// Panning never pushes the image out of its panel: this much always stays visible.
function clampPan(pan,cw,ch,w,h){
 const keep=40,limitX=Math.max(0,(cw+w)/2-keep),limitY=Math.max(0,(ch+h)/2-keep);
 return [Math.max(-limitX,Math.min(limitX,pan[0])),Math.max(-limitY,Math.min(limitY,pan[1]))];
}
let expandedPane=null;
function expandPane(name){
 expandedPane=expandedPane===name?null:name;
 document.querySelector('.grid').classList.toggle('expanded',!!expandedPane);
 for(const n of [...names,'volume'])document.querySelector(`.pane.${n}`).hidden=!!expandedPane&&expandedPane!==n;
 $('restoreViews').hidden=!expandedPane;
 for(const n of names)delete layouts[n];
 schedule();
}
for(const name of [...names,'volume'])document.querySelector(`.pane.${name}`).addEventListener('dblclick',e=>{if(e.target.closest('input,button,select,label'))return;e.preventDefault();expandPane(name);});
$('restoreViews').addEventListener('click',()=>{if(expandedPane)expandPane(expandedPane);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expandedPane)expandPane(expandedPane);});
function resetMprZoom(){for(const n of names){mprZoom[n]=1;mprZoomMode[n]=false;mprPan[n]=[0,0];}}
function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;drawSlices();drawVolume();if(typeof drawSlicePreview==='function')drawSlicePreview();});}}
function setVolume(v){
 clearSpect();
 volume=v;position=[Math.floor(v.nx/2),Math.floor(v.ny/2),Math.floor(v.nz/2)];
 resetMprZoom();
 baseMaximum=0;if(VolumeCore.isFunctional(v))for(const value of v.data)baseMaximum=Math.max(baseMaximum,value);
 $('width').value=Math.min(4000,Math.max(1,v.window));$('level').value=v.level;
 $('metadata').textContent=`${v.description} · ${v.modality}`;
 $('dimensions').textContent=`${v.nx} × ${v.ny} × ${v.nz} · ${v.spacing.map(s=>s.toFixed(2)).join(' × ')} mm`;
 names.forEach((name,i)=>{$(name+'Slice').max=[v.nz,v.ny,v.nx][i]-1;});
 yaw=.35;pitch=.12;zoom=1;update3DControls();uploadVolume();
 if(typeof resetSlicePlanner==='function')resetSlicePlanner();
 sync();
 document.dispatchEvent(new CustomEvent('volumina',{detail:{kind:'volume'}}));
}
function sync(){for(const id of ['width','level','threshold','opacity'])$(id+'Out').textContent=$(id).value;names.forEach((n,i)=>{$(n+'Slice').value=position[2-i];});schedule();}
function clearSpect(){
 spect=null;spectMaximum=0;fusionSample=null;spectGroups.clear();
 $('volumeSource').value='base';$('spect3dOption').disabled=true;$('fusion3dOption').disabled=true;
 uploadedSpect=null;if(gl&&spectTexture){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,spectTexture);gl.texImage3D(gl.TEXTURE_3D,0,gl.R32F,1,1,1,0,gl.RED,gl.FLOAT,new Float32Array(1));gl.activeTexture(gl.TEXTURE0);}
 $('spectSeries').replaceChildren(new Option('Sin SPECT',''));$('spectSeries').disabled=true;
 $('spectMetadata').textContent='Abre SPECT solo para MIP/VRT, o carga primero el CT para fusionar.';
 $('spectScale').textContent='Porcentaje del máximo del volumen. Sin conversión a SUV.';
 $('fusionStatus').textContent='Fusión sin activar.';$('fusionStatus').classList.remove('warning');
 $('fusionControls').disabled=true;$('removeSpect').disabled=true;$('manualFusion').checked=false;
 for(const id of ['offsetX','offsetY','offsetZ']){$(id).value=0;$(id).disabled=true;}
 names.forEach(n=>document.querySelector(`.${n} h3 span`).textContent='MPR');
 update3DControls();uploadVolume();schedule();
 document.dispatchEvent(new CustomEvent('volumina',{detail:{kind:'spect'}}));
}
function setSpect(v){
 const compatibility=VolumeCore.fusionCompatibility(volume,v);if(!compatibility.allowed)throw Error(compatibility.reason);
 let max=0;for(const value of v.data){if(!Number.isFinite(value))throw Error('SPECT contiene intensidades no finitas');max=Math.max(max,value);}
 if(max<=0)throw Error('SPECT no contiene intensidades positivas para la escala de actividad');
 spect=v;spectMaximum=max;$('fusionControls').disabled=false;$('removeSpect').disabled=false;
 $('spect3dOption').disabled=false;$('fusion3dOption').disabled=false;$('volumeSource').value='spect';zoom=1;
 $('fusionEnabled').checked=true;$('manualFusion').checked=false;
 for(const id of ['offsetX','offsetY','offsetZ'])$(id).value=0;
 $('spectMetadata').textContent=`${v.description} · DICOM ${v.modality} · ${v.nx} × ${v.ny} × ${v.nz} · ${v.spacing.map(s=>s.toFixed(2)).join(' × ')} mm · ${VolumeCore.intensityUnit(v)}`
  +(v.tiltDegrees?` · Orientación inclinada ${v.tiltDegrees.toFixed(2)}° respecto del eje axial, tratada como axial: desplazamiento máximo de ${(Math.sin(v.tiltDegrees*Math.PI/180)*Math.max(v.nx*v.spacing[0],v.ny*v.spacing[1],v.nz*v.spacing[2])/2).toFixed(1)} mm en los bordes del volumen.`:'');
 update3DControls();uploadVolume();updateFusion();
 document.dispatchEvent(new CustomEvent('volumina',{detail:{kind:'spect'}}));
}
function active3DVolume(){return $('volumeSource').value==='spect'?spect:volume;}
function parameters3D(){
 const fusion=$('volumeSource').value==='fusion',v=active3DVolume(),functional=!!v&&VolumeCore.isFunctional(v),maximum=fusion||$('volumeSource').value==='spect'?spectMaximum:baseMaximum;
 return {v,functional,fusion,low:maximum*Number($('volumeLow').value)/100,high:maximum*Number($('volumeHigh').value)/100};
}
function fusion3DState(){
 if(!volume||!spect)return {ready:false,reason:'Carga CT y SPECT para la fusión 3D.'};
 const compatibility=VolumeCore.fusionCompatibility(volume,spect),manual=$('manualFusion').checked,ids=['offsetX','offsetY','offsetZ'];
 if(!compatibility.allowed)return {ready:false,reason:compatibility.reason};
 if(!compatibility.aligned&&!manual)return {ready:false,reason:'Fusión 3D bloqueada: no comparten coordenadas DICOM. Requiere registro o ajuste manual exploratorio.'};
 if(manual&&ids.some(id=>$(id).value===''||!$(id).checkValidity()))return {ready:false,reason:'Fusión 3D: introduce desplazamientos válidos.'};
 const offset=manual?ids.map(id=>Number($(id).value)):[0,0,0];
 if(!VolumeCore.overlaps(volume,spect,offset))return {ready:false,reason:'Fusión 3D: no hay superposición física entre CT y SPECT.'};
 return {ready:true,offset,manual};
}
function update3DControls(){
 const {v,functional,fusion,low,high}=parameters3D();
 $('functional3dControls').disabled=!(functional||fusion);$('threshold').disabled=functional||mode==='mip';$('opacity').disabled=mode==='mip';$('fusion3dOpacity').disabled=!fusion;
 $('fusion3dOpacityOut').textContent=$('fusion3dOpacity').value+' %';
 $('volumeLowOut').textContent=$('volumeLow').value+' %';$('volumeHighOut').textContent=$('volumeHigh').value+' %';
 $('volumeTitle').textContent=fusion?'CT + SPECT':functional?'SPECT / PT':'VOLUMEN BASE';$('volumeKind').textContent=fusion?($('manualFusion').checked?'FUSIÓN MANUAL':'Fusión 3D'):v?`3D · ${v.modality} · Una serie`:'3D · Sin volumen';
 $('volumeScale').textContent=functional||fusion?`${low.toPrecision(4)} – ${high.toPrecision(4)} ${VolumeCore.intensityUnit(fusion?spect||{}:v)}. Escala 3D independiente de MPR. Sin conversión a SUV.`:'Base: ventana/nivel para MIP; umbral y opacidad para VRT.';
 if(fusion){const state=fusion3DState();$('volumeScale').textContent+=' '+(state.ready?(mode==='mip'?'MIP: superposición de dos proyecciones máximas.':'VRT: mezcla de CT y SPECT por profundidad.')+' Campo limitado al CT.':state.reason);}
}
$('volumeSource').addEventListener('change',()=>{if($('volumeSource').value==='spect'&&!spect)$('volumeSource').value='base';zoom=1;update3DControls();uploadVolume();schedule();});
$('volumeLow').addEventListener('input',()=>{if(Number($('volumeLow').value)>=Number($('volumeHigh').value))$('volumeHigh').value=Number($('volumeLow').value)+1;update3DControls();schedule();});
$('volumeHigh').addEventListener('input',()=>{if(Number($('volumeHigh').value)<=Number($('volumeLow').value))$('volumeLow').value=Number($('volumeHigh').value)-1;update3DControls();schedule();});
$('volumePalette').addEventListener('change',schedule);
$('fusion3dOpacity').addEventListener('input',()=>{update3DControls();schedule();});
function updateFusion(){
 fusionSample=null;const manual=$('manualFusion').checked,ids=['offsetX','offsetY','offsetZ'];
 ids.forEach(id=>$(id).disabled=!manual);
 $('fusionOpacityOut').textContent=$('fusionOpacity').value+' %';$('spectLowOut').textContent=$('spectLow').value+' %';$('spectHighOut').textContent=$('spectHigh').value+' %';
 let message='Fusión sin activar.',warning=false;
 if(volume&&spect){
  const compatibility=VolumeCore.fusionCompatibility(volume,spect),offset=manual?ids.map(id=>Number($(id).value)):[0,0,0];
  const invalid=manual&&ids.some(id=>$(id).value===''||!$(id).checkValidity());
  message=compatibility.reason;
  if(!compatibility.allowed)warning=true;
  else if(!$('fusionEnabled').checked)message='SPECT oculto. Los cortes muestran solo la base.';
  else if(invalid){message='Introduce desplazamientos válidos entre −1000 y 1000 mm.';warning=true;}
  else if(!compatibility.aligned&&!manual)warning=true;
  else if(!VolumeCore.overlaps(volume,spect,offset)){message='No hay superposición física de los campos CT y SPECT con esta posición.';warning=true;}
  else{
   fusionSample=VolumeCore.fusionMapper(volume,spect,offset);
   if(manual){message='Fusión manual exploratoria · no registrada ni validada. Traslación L/P/S: '+offset.join(' / ')+' mm.';warning=true;}
  }
  $('spectScale').textContent=`${(spectMaximum*Number($('spectLow').value)/100).toPrecision(4)} – ${(spectMaximum*Number($('spectHigh').value)/100).toPrecision(4)} ${VolumeCore.intensityUnit(spect)}. Máximo: ${spectMaximum.toPrecision(4)}. Rescale aplicado; sin conversión a SUV.`;
 }
 $('fusionStatus').textContent=message;$('fusionStatus').classList.toggle('warning',warning);
 names.forEach(n=>document.querySelector(`.${n} h3 span`).textContent=fusionSample?(manual?'FUSIÓN MANUAL':spect.modality==='PT'?'CT + PT':'CT + SPECT'):'MPR');
 update3DControls();
 if(typeof refreshSliceContent==='function')refreshSliceContent();
 schedule();
 document.dispatchEvent(new CustomEvent('volumina',{detail:{kind:'fusion'}}));
}
function selectSpectSeries(){
 const slices=spectGroups.get($('spectSeries').value)||[];
 if(slices.length===1)return status('Ese archivo trae un solo corte. Abrir SPECT admite un único archivo, así que debe ser una reconstrucción multiframe con todos los cortes dentro.',true);
 try{setSpect(VolumeCore.build(slices));status('SPECT cargado. Consulta el estado de alineación en el panel de fusión.');}
 catch(e){status(`No se pudo fusionar: ${e.message}. Se conserva la vista anterior.`,true);}
}
for(const id of ['fusionEnabled','manualFusion'])$(id).addEventListener('change',updateFusion);
for(const id of ['fusionOpacity','offsetX','offsetY','offsetZ'])$(id).addEventListener('input',updateFusion);
$('spectLow').addEventListener('input',()=>{if(Number($('spectLow').value)>=Number($('spectHigh').value))$('spectHigh').value=Number($('spectLow').value)+1;updateFusion();});
$('spectHigh').addEventListener('input',()=>{if(Number($('spectHigh').value)<=Number($('spectLow').value))$('spectLow').value=Number($('spectHigh').value)-1;updateFusion();});
$('resetOffsets').addEventListener('click',()=>{for(const id of ['offsetX','offsetY','offsetZ'])$(id).value=0;updateFusion();});
$('removeSpect').addEventListener('click',()=>{clearSpect();status('SPECT retirado. Se conserva el volumen base.');});
function fit(canvas){const box=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5);const w=Math.max(1,Math.round(box.width*ratio)),h=Math.max(1,Math.round(box.height*ratio));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}return [w,h];}
function drawSlices(){
 if(!volume)return;const v=volume,ww=Number($('width').value),wl=Number($('level').value),low=wl-.5-(ww-1)/2;
 const spectLow=spectMaximum*Number($('spectLow').value)/100,spectHigh=spectMaximum*Number($('spectHigh').value)/100,fusionAlpha=Number($('fusionOpacity').value)/100;
 names.forEach((name,k)=>{
  if(expandedPane&&expandedPane!==name)return;
  const canvas=$(name),[cw,ch]=fit(canvas),ctx=canvas.getContext('2d');
  const iw=k===2?v.ny:v.nx,ih=k===0?v.ny:v.nz,sx=k===2?v.spacing[1]:v.spacing[0],sy=k===0?v.spacing[1]:v.spacing[2];
  const off=document.createElement('canvas');off.width=iw;off.height=ih;const ox=off.getContext('2d'),image=ox.createImageData(iw,ih);
  for(let j=0;j<ih;j++)for(let i=0;i<iw;i++){
   const x=k===2?position[0]:i,y=k===0?j:k===1?position[1]:i,z=k===0?position[2]:v.nz-1-j;
   const val=v.data[x+v.nx*(y+v.ny*z)],c=ww<=1?(val>wl-.5?255:0):Math.max(0,Math.min(255,(val-low)/(ww-1)*255)),n=4*(i+iw*j);image.data[n]=image.data[n+1]=image.data[n+2]=c;image.data[n+3]=255;
   if(fusionSample&&fusionAlpha>0){
    const activity=fusionSample(x,y,z);
    if(activity!==null&&activity>spectLow){const t=Math.min(1,(activity-spectLow)/(spectHigh-spectLow)),rgb=VolumeCore.hotColor(t),alpha=fusionAlpha*Math.min(1,t*4);for(let channel=0;channel<3;channel++)image.data[n+channel]=c*(1-alpha)+rgb[channel]*alpha;}
   }
  }ox.putImageData(image,0,0);
  const scale=Math.max(.001,Math.min((cw-38)/(iw*sx),(ch-38)/(ih*sy)))*mprZoom[name],w=iw*sx*scale,h=ih*sy*scale;
  const pan=mprPan[name]=clampPan(mprPan[name],cw,ch,w,h),left=(cw-w)/2+pan[0],top=(ch-h)/2+pan[1];
  ctx.fillStyle='#05090e';ctx.fillRect(0,0,cw,ch);ctx.imageSmoothingEnabled=true;ctx.drawImage(off,left,top,w,h);
  const px=k===2?position[1]:position[0],py=k===0?position[1]:v.nz-1-position[2];
  const cx=left+(px+.5)/iw*w,cy=top+(py+.5)/ih*h;
  ctx.lineWidth=1;ctx.setLineDash([5,5]);ctx.strokeStyle=['#51d8c0aa','#a698edaa','#eda65daa'][k];ctx.beginPath();ctx.moveTo(cx,top);ctx.lineTo(cx,top+h);ctx.moveTo(left,cy);ctx.lineTo(left+w,cy);ctx.stroke();ctx.setLineDash([]);
  layouts[name]={left,top,w,h,iw,ih};
  if(typeof reformatOverlay==='function')reformatOverlay(name,ctx,layouts[name]);
  const axis=2-k;
  $(name+'Zoom').textContent=`${Math.round(mprZoom[name]*100)} % · ${mprZoomMode[name]?'Zoom activo':'Margen: zoom'}`;
  $(name+'Out').textContent=`${position[axis]+1} / ${[v.nx,v.ny,v.nz][axis]} · ${(v.origin[axis]+position[axis]*v.spacing[axis]).toFixed(1)} mm`;
 });
}
names.forEach((name,k)=>{
 let zoomDrag=null,panDrag=null;
 const canvas=$(name);
 const devicePixels=()=>{const rect=canvas.getBoundingClientRect();return rect.width?canvas.width/rect.width:1;};
 // Right button drags the image inside its panel; the browser menu would eat the gesture.
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 function hit(e){const rect=canvas.getBoundingClientRect(),l=layouts[name];if(!l||!rect.width||!rect.height)return null;const x=(e.clientX-rect.left)*canvas.width/rect.width,y=(e.clientY-rect.top)*canvas.height/rect.height;const margin=12*canvas.width/rect.width;return {l,x,y,outside:x<l.left||x>=l.left+l.w||y<l.top||y>=l.top+l.h||x<margin||y<margin||x>canvas.width-margin||y>canvas.height-margin};}
 function zoomTo(value){mprZoom[name]=Math.max(.25,Math.min(8,value));schedule();}
 $(name+'Slice').addEventListener('input',e=>{position[2-k]=Number(e.target.value);schedule();});
 canvas.addEventListener('wheel',e=>{e.preventDefault();if(!volume)return;const point=hit(e);if(!point)return;if(point.outside||mprZoomMode[name]){const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?200:1);zoomTo(mprZoom[name]*Math.exp(-Math.max(-500,Math.min(500,delta))*.002));return;}const axis=2-k;position[axis]=Math.max(0,Math.min([volume.nx,volume.ny,volume.nz][axis]-1,position[axis]+Math.sign(e.deltaY)));sync();},{passive:false});
 canvas.addEventListener('pointerdown',e=>{
  if(!volume)return;
  if(e.button===2){e.preventDefault();panDrag={id:e.pointerId,x:e.clientX,y:e.clientY,from:[...mprPan[name]]};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='move';return;}
  if(e.button!==0)return;const point=hit(e);if(!point)return;
  if(typeof reformatPointerDown==='function'&&reformatPointerDown(name,point,e,canvas))return;
  if(point.outside){mprZoomMode[name]=true;zoomDrag={id:e.pointerId,y:e.clientY,zoom:mprZoom[name]};canvas.setPointerCapture(e.pointerId);schedule();return;}
  mprZoomMode[name]=false;const {l,x,y}=point,ix=Math.min(l.iw-1,Math.floor((x-l.left)/l.w*l.iw)),iy=Math.min(l.ih-1,Math.floor((y-l.top)/l.h*l.ih));if(k===0){position[0]=ix;position[1]=iy;}else if(k===1){position[0]=ix;position[2]=volume.nz-1-iy;}else{position[1]=ix;position[2]=volume.nz-1-iy;}sync();
 });
 canvas.addEventListener('pointermove',e=>{if(typeof reformatPointerMove==='function'&&reformatPointerMove(name,hit(e),e))return;
  if(panDrag&&panDrag.id===e.pointerId){const ratio=devicePixels();mprPan[name]=[panDrag.from[0]+(e.clientX-panDrag.x)*ratio,panDrag.from[1]+(e.clientY-panDrag.y)*ratio];schedule();return;}
  if(zoomDrag&&zoomDrag.id===e.pointerId){zoomTo(zoomDrag.zoom*Math.exp(Math.max(-500,Math.min(500,zoomDrag.y-e.clientY))*.008));return;}const point=hit(e);canvas.style.cursor=point?.outside?'zoom-in':'crosshair';});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(typeof reformatPointerUp==='function')reformatPointerUp(e,canvas);
  if(panDrag?.id===e.pointerId){panDrag=null;canvas.style.cursor='crosshair';if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}
  if(zoomDrag?.id===e.pointerId){zoomDrag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}});
});
let gl=null,program=null,texture=null,spectTexture=null,textureReady=false;
const vertex=`#version 300 es
in vec2 p;out vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;precision highp sampler3D;
in vec2 uv;out vec4 color;uniform sampler3D vox;uniform vec3 extent;uniform mat3 rotation;uniform float aspect;uniform float zoom;uniform float ww;uniform float wl;uniform float threshold;uniform float opacity;uniform float stepSize;uniform int mip;
uniform int functional;uniform int grayPalette;uniform float rangeLow;uniform float rangeHigh;
uniform int fused;uniform sampler3D spectralVox;uniform vec3 spectralScale;uniform vec3 spectralShift;uniform float spectralOpacity;
float activity(float value){return clamp((value-rangeLow)/max(rangeHigh-rangeLow,1.e-20),0.,1.);}
vec3 activityColor(float t){return grayPalette==1?vec3(t):clamp(vec3(3.*t,3.*t-1.,3.*t-2.),0.,1.);}
float spectralAt(vec3 p){vec3 uvw=p*spectralScale+spectralShift;vec3 edge=.5/vec3(textureSize(spectralVox,0));if(any(lessThan(uvw,edge))||any(greaterThan(uvw,1.-edge)))return -1.e30;return texture(spectralVox,uvw).r;}
float sampleAt(vec3 p){return texture(vox,p/extent+.5).r;}
void main(){
 vec2 q=(uv-.5)*2.;q.x*=aspect;
 vec3 ro=rotation*vec3(q*1.8/zoom,3.0),rd=rotation*vec3(0.,0.,-1.);
 vec3 safeRd=vec3(abs(rd.x)<.000001?.000001:rd.x,abs(rd.y)<.000001?.000001:rd.y,abs(rd.z)<.000001?.000001:rd.z);
 vec3 t0=(-extent*.5-ro)/safeRd,t1=(extent*.5-ro)/safeRd,tn=min(t0,t1),tf=max(t0,t1);
 float nearT=max(max(tn.x,tn.y),tn.z),farT=min(min(tf.x,tf.y),tf.z);
 vec3 bg=vec3(.020,.035,.055);if(nearT>farT){color=vec4(bg,1.);return;}
 float dt=max(stepSize,(farT-nearT)/1535.);vec4 acc=vec4(0.);float maximum=-1.e30;float spectralMaximum=-1.e30;
 for(int i=0;i<1536;i++){
  float t=nearT+(float(i)+.5)*dt;if(t>farT)break;
  vec3 pos=ro+rd*t;float value=sampleAt(pos);
  float spectralValue=fused==1?spectralAt(pos):-1.e30;
  if(mip==1){maximum=max(maximum,value);spectralMaximum=max(spectralMaximum,spectralValue);continue;}
  if(fused==1){
   float ctDensity=value<threshold?0.:clamp((value-threshold)/max(ww*.5,1.),0.,1.);
   float s=activity(spectralValue),ctTau=ctDensity*opacity*dt*100.,sTau=s*spectralOpacity*dt*100.,tau=ctTau+sTau;
   if(tau<=0.)continue;
   float gray=ww<=1.?step(wl-.5,value):clamp((value-(wl-.5))/(ww-1.)+.5,0.,1.);
   vec3 rgb=(ctTau*vec3(gray)+sTau*activityColor(s))/tau;
   float alpha=1.-exp(-tau);acc.rgb+=(1.-acc.a)*alpha*rgb;acc.a+=(1.-acc.a)*alpha;if(acc.a>.99)break;
   continue;
  }
  if(functional==1){
   float density=activity(value);if(density<=0.)continue;
   float alpha=1.-exp(-density*opacity*dt*100.);
   acc.rgb+=(1.-acc.a)*alpha*activityColor(density);acc.a+=(1.-acc.a)*alpha;if(acc.a>.99)break;
   continue;
  }
  if(value<threshold)continue;
  float density=clamp((value-threshold)/max(ww*.5,1.),0.,1.);
  float alpha=1.-exp(-density*opacity*dt*100.);
  vec3 delta=extent/vec3(textureSize(vox,0));
  vec3 g=vec3(sampleAt(pos+vec3(delta.x,0,0))-sampleAt(pos-vec3(delta.x,0,0)),sampleAt(pos+vec3(0,delta.y,0))-sampleAt(pos-vec3(0,delta.y,0)),sampleAt(pos+vec3(0,0,delta.z))-sampleAt(pos-vec3(0,0,delta.z)))/delta;
  float light=.55+.45*abs(dot(normalize(g+vec3(.00001)),normalize(vec3(-.4,-.5,1.))));
  vec3 tissue=mix(vec3(.64,.23,.10),vec3(1.,.93,.77),clamp((value-threshold)/max(ww,1.),0.,1.));
  acc.rgb+=(1.-acc.a)*alpha*tissue*light;acc.a+=(1.-acc.a)*alpha;if(acc.a>.99)break;
 }
 if(mip==1){if(functional==1){color=vec4(activityColor(activity(maximum)),1.);}else{float c=ww<=1.?step(wl-.5,maximum):clamp((maximum-(wl-.5))/(ww-1.)+.5,0.,1.);vec3 rgb=vec3(c);if(fused==1){float s=activity(spectralMaximum);rgb=mix(rgb,activityColor(s),spectralOpacity*min(1.,4.*s));}color=vec4(rgb,1.);}}else color=vec4(acc.rgb+(1.-acc.a)*bg,1.);
}`;
function initGL(){
 try{
 gl=$('volume').getContext('webgl2',{alpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 no está disponible. MPR sigue funcionando.');
 const compile=(type,src)=>{const shader=gl.createShader(type);gl.shaderSource(shader,src);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
 program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const attr=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
 texture=gl.createTexture();spectTexture=gl.createTexture();const filter=gl.getExtension('OES_texture_float_linear')?gl.LINEAR:gl.NEAREST;
 for(const [unit,tex] of [[gl.TEXTURE0,texture],[gl.TEXTURE1,spectTexture]]){gl.activeTexture(unit);gl.bindTexture(gl.TEXTURE_3D,tex);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_3D,p,filter);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,p,gl.CLAMP_TO_EDGE);gl.texImage3D(gl.TEXTURE_3D,0,gl.R32F,1,1,1,0,gl.RED,gl.FLOAT,new Float32Array(1));}gl.activeTexture(gl.TEXTURE0);
 }catch(e){$('volumeError').textContent=e.message;gl=null;}
}
function uploadVolume(){const v=active3DVolume();if(v===uploadedVolume&&textureReady)return;textureReady=false;uploadedVolume=null;if(!gl||!v)return;gl.activeTexture(gl.TEXTURE0);const max=gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);if(Math.max(v.nx,v.ny,v.nz)>max){$('volumeError').textContent=`El volumen supera el límite 3D de esta GPU (${max}). MPR disponible.`;return;}
 gl.bindTexture(gl.TEXTURE_3D,texture);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage3D(gl.TEXTURE_3D,0,gl.R32F,v.nx,v.ny,v.nz,0,gl.RED,gl.FLOAT,v.data);if(gl.getError()!==gl.NO_ERROR){$('volumeError').textContent='No se pudo cargar el volumen en la GPU. MPR disponible.';return;}$('volumeError').textContent='';textureReady=true;uploadedVolume=v;}
function uploadSpectTexture(){
 if(uploadedSpect===spect)return true;
 const max=gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);if(Math.max(spect.nx,spect.ny,spect.nz)>max){$('volumeError').textContent='SPECT supera el límite de textura 3D de la GPU.';return false;}
 gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,spectTexture);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage3D(gl.TEXTURE_3D,0,gl.R32F,spect.nx,spect.ny,spect.nz,0,gl.RED,gl.FLOAT,spect.data);const error=gl.getError();gl.activeTexture(gl.TEXTURE0);
 if(error!==gl.NO_ERROR){$('volumeError').textContent='No hay memoria GPU suficiente para la fusión 3D. Prueba las series por separado.';return false;}uploadedSpect=spect;return true;
}
function drawVolume(){if(mode==='slices')return;const settings=parameters3D(),v=settings.v;if(!gl||!v||(expandedPane&&expandedPane!=='volume'))return;const [w,h]=fit($('volume'));gl.viewport(0,0,w,h);gl.clearColor(.02,.035,.055,1);gl.clear(gl.COLOR_BUFFER_BIT);if(!textureReady||uploadedVolume!==v)return;
 let registration=null;if(settings.fusion){registration=fusion3DState();if(!registration.ready){$('volumeError').textContent=registration.reason;return;}if(!uploadSpectTexture())return;}$('volumeError').textContent='';
 gl.useProgram(program);const uniform=(name)=>gl.getUniformLocation(program,name),physical=[v.nx*v.spacing[0],v.ny*v.spacing[1],v.nz*v.spacing[2]],largest=Math.max(...physical),extent=physical.map(s=>s/largest*2);
 gl.uniform1i(uniform('functional'),settings.functional?1:0);gl.uniform1i(uniform('grayPalette'),$('volumePalette').value==='gray'?1:0);gl.uniform1f(uniform('rangeLow'),settings.low);gl.uniform1f(uniform('rangeHigh'),settings.high);
 gl.uniform1i(uniform('fused'),settings.fusion?1:0);gl.uniform1i(uniform('spectralVox'),1);gl.uniform1f(uniform('spectralOpacity'),Number($('fusion3dOpacity').value)/100);
 if(settings.fusion){const transform=VolumeCore.fusionTextureTransform(volume,spect,registration.offset);gl.uniform3fv(uniform('spectralScale'),transform.scale);gl.uniform3fv(uniform('spectralShift'),transform.shift);}
 // Camera right is +L, camera up is +S, with rotations around patient axes.
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 gl.uniformMatrix3fv(uniform('rotation'),false,new Float32Array([cy,sy,0,-sy*sp,cy*sp,cp,sy*cp,-cy*cp,sp]));
 gl.uniform3fv(uniform('extent'),extent);gl.uniform1f(uniform('aspect'),w/h);gl.uniform1f(uniform('zoom'),zoom);gl.uniform1f(uniform('ww'),Number($('width').value));gl.uniform1f(uniform('wl'),Number($('level').value));gl.uniform1f(uniform('threshold'),Number($('threshold').value));gl.uniform1f(uniform('opacity'),Number($('opacity').value)/100);gl.uniform1f(uniform('stepSize'),Math.min(...v.spacing,...(settings.fusion?spect.spacing:[]))/largest);gl.uniform1i(uniform('mip'),mode==='mip'?1:0);gl.uniform1i(uniform('vox'),0);gl.drawArrays(gl.TRIANGLES,0,6);
}
let drag=null;$('volume').addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];$('volume').setPointerCapture(e.pointerId);});$('volume').addEventListener('pointermove',e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.008;pitch=Math.max(-1.5,Math.min(1.5,pitch+(e.clientY-drag[1])*.008));drag=[e.clientX,e.clientY];schedule();});for(const event of ['pointerup','pointercancel','lostpointercapture'])$('volume').addEventListener(event,()=>drag=null);$('volume').addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.4,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));schedule();},{passive:false});
for(const id of ['width','level','threshold','opacity'])$(id).addEventListener('input',sync);
$('preset').addEventListener('change',()=>{const [w,l]=$('preset').value.split(',');$('width').value=w;$('level').value=l;sync();});
function setMode(id){
 mode=id;$('modeLabel').textContent=id==='slices'?'CORTES':id.toUpperCase();
 for(const other of ['mip','vrt','slices'])$(other).classList.toggle('active',other===id);
 if(typeof syncSliceMode==='function')syncSliceMode();
 update3DControls();schedule();
 document.dispatchEvent(new CustomEvent('volumina',{detail:{kind:'mode'}}));
}
for(const id of ['mip','vrt','slices'])$(id).addEventListener('click',()=>setMode(id));
$('reset').addEventListener('click',()=>{resetMprZoom();yaw=.35;pitch=.12;zoom=1;if(volume)position=[Math.floor(volume.nx/2),Math.floor(volume.ny/2),Math.floor(volume.nz/2)];sync();});
$('demo').addEventListener('click',()=>{if(loading)return;groups.clear();$('series').replaceChildren(new Option('CT sintético','demo'));$('series').disabled=true;setVolume(VolumeCore.demo());setSpect(VolumeCore.demoSpect());$('spectSeries').replaceChildren(new Option('SPECT sintético','demo'));status('Demo CT + SPECT cargada · Fusión MPR y SPECT 3D. Puedes alternar la fuente 3D.');});
async function loadFiles(files,target='base'){
 if(loading)return;
 // Silence here reads as a broken viewer: say that nothing was selected.
 if(!files.length)return status(target==='base'
  ?'No seleccionaste ningún archivo. Abre el CT y marca todos los cortes de la serie: Ctrl+A selecciona la carpeta entera.'
  :'No seleccionaste ningún archivo funcional.',true);
 if(target==='spect'&&(!volume||volume.modality!=='CT'))target='functionalBase';
 loading=true;$('demo').disabled=true;$('series').disabled=true;$('spectSeries').disabled=true;$('removeSpect').disabled=true;const next=new Map(),rejected=[];let total=0;
 try{
 for(let i=0;i<files.length;i++){
  const f=files[i];status(`Leyendo archivo ${i+1} de ${files.length}…`);
  try{if(f.size>256*1024*1024)throw Error('Archivo de más de 256 MB');const slices=VolumeCore.parseFrames(new Uint8Array(await f.arrayBuffer()));if(target!=='base'&&!VolumeCore.isFunctional(slices[0]))throw Error('Selecciona imágenes NM reconstruidas o PT (xSPECT/PET)');for(const s of slices){total+=s.data.byteLength;if(total>512*1024*1024)throw Error('MEMORY_LIMIT');if(!next.has(s.uid))next.set(s.uid,[]);next.get(s.uid).push(s);}}catch(e){if(e.message==='MEMORY_LIMIT')throw Error('La selección supera 512 MB de píxeles. Selecciona una sola serie más pequeña.');rejected.push({file:f.name,reason:e.message||'DICOM no válido'});}
  if(i%10===0)await new Promise(r=>setTimeout(r,0));
 }
 // Refuse partial imports: an unsupported image could be a missing slice of the same series.
 if(rejected.length){const first=rejected[0];throw Error(`${rejected.length} archivo(s) no admitido(s). No se importó la selección para evitar un volumen incompleto. ${first.file}: ${first.reason}. Selecciona únicamente los cortes de una serie compatible.`);}
 if(!next.size)throw Error('No se encontraron imágenes compatibles');
 if(target==='spect'){
  spectGroups=next;$('spectSeries').replaceChildren();for(const [uid,s] of next)$('spectSeries').add(new Option(`${s[0].description} · ${s.length} cortes`,uid));selectSpectSeries();
 }else{groups=next;$('series').replaceChildren();for(const [uid,s] of groups)$('series').add(new Option(`${s[0].description} · ${s.length} cortes`,uid));selectSeries();}
 }catch(e){status(e.message,true);}finally{loading=false;$('demo').disabled=false;$('series').disabled=groups.size===0;$('spectSeries').disabled=spectGroups.size===0;$('removeSpect').disabled=!spect;}
}
function selectSeries(){
 const slices=groups.get($('series').value)||[];
 // A single CT file is the usual mistake: one slice is not a volume.
 if(slices.length===1)return status('Seleccionaste un solo corte y un volumen necesita la serie completa. Vuelve a Abrir CT y marca todos los archivos con Ctrl+A.',true);
 try{const v=VolumeCore.build(slices);setVolume(v);status(`Serie cargada · ${v.nz} cortes ordenados por posición física.`);}
 catch(e){status(`No se pudo reconstruir: ${e.message}. La vista conserva el volumen anterior.`,true);}
}
$('series').addEventListener('change',selectSeries);
$('spectSeries').addEventListener('change',selectSpectSeries);
$('spectFiles').addEventListener('change',e=>{loadFiles([...e.target.files],'spect');e.target.value='';});
$('files').addEventListener('change',e=>{loadFiles([...e.target.files]);e.target.value='';});
document.addEventListener('dragover',e=>{e.preventDefault();document.body.classList.add('dragging');});document.addEventListener('dragleave',e=>{if(!e.relatedTarget)document.body.classList.remove('dragging');});document.addEventListener('drop',e=>{e.preventDefault();document.body.classList.remove('dragging');loadFiles([...e.dataTransfer.files]);});
new ResizeObserver(schedule).observe(document.querySelector('.grid'));
$('volume').addEventListener('webglcontextlost',e=>{e.preventDefault();textureReady=false;$('volumeError').textContent='Se perdió el contexto gráfico. Recarga la página para recuperar 3D.';});
initGL();
