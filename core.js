/* Volume construction uses DICOM patient coordinates (LPS). No network access. */
(function(root){
'use strict';
const nums=(ds,tag)=> (ds.string(tag)||'').split('\\').map(Number);
function parse(bytes){
 const frames=parseFrames(bytes);if(frames.length!==1)throw Error('Usa parseFrames para imágenes multiframe');return frames[0];
}
function parseFrames(bytes){
 const ds=root.dicomParser.parseDicom(bytes), str=t=>(ds.string(t)||'').trim();
 if(!ds.elements.x7fe00010)throw Error('Sin píxeles de imagen');
 const syntax=str('x00020010');
 if(!['1.2.840.10008.1.2','1.2.840.10008.1.2.1','1.2.840.10008.1.2.2'].includes(syntax))throw Error('Transfer syntax no admitida (se requieren DICOM sin compresión)');
 const frameCount=Number(str('x00280008')||1),modality=str('x00080060');
 const sopClass=str('x00080016');
 if(modality==='PT'&&sopClass!=='1.2.840.10008.5.1.4.1.1.128')throw Error('PT requiere PET Image Storage clásico; Enhanced PET aún no está admitido');
 if(!Number.isInteger(frameCount)||frameCount<1)throw Error('Número de frames inválido');
 if(modality==='NM'&&str('x00080008').split('\\')[2]!=='RECON TOMO')throw Error('SPECT requiere RECON TOMO; no se admiten proyecciones, planar ni gated');
 if(frameCount>1&&modality!=='NM')throw Error('Multiframe admitido únicamente para SPECT NM RECON TOMO');
 if(ds.uint16('x00280002')!==1||str('x00280004')!=='MONOCHROME2')throw Error('Se requiere MONOCHROME2');
 const nx=ds.uint16('x00280011'),ny=ds.uint16('x00280010'),bits=ds.uint16('x00280100'),stored=ds.uint16('x00280101'),high=ds.uint16('x00280102'),signed=ds.uint16('x00280103');
 if(!nx||!ny||![8,16].includes(bits)||!stored||stored>bits||high!==stored-1||![0,1].includes(signed))throw Error('Formato de píxeles no admitido');
 const detectors=ds.elements.x00540022?.items;
 if(modality==='NM'&&detectors&&detectors.length!==1)throw Error('Se requiere un único detector reconstruido');
 const geometry=modality==='NM'&&detectors?.[0]?.dataSet?detectors[0].dataSet:ds;
 const position=nums(geometry,'x00200032'),orientation=nums(geometry,'x00200037'),spacing=nums(ds,'x00280030');
 if(position.length!==3||orientation.length!==6||spacing.length!==2||![...position,...orientation,...spacing].every(Number.isFinite)||spacing.some(v=>v<=0))throw Error('Geometría DICOM ausente o inválida');
 if(orientation.some((v,i)=>Math.abs(v-[1,0,0,0,1,0][i])>0.0001))throw Error('Serie oblicua o con orientación no admitida; se requiere axial LPS estándar');
 const uid=str('x0020000e');if(!uid)throw Error('SeriesInstanceUID ausente');
 const slope=Number(str('x00281053')||1),intercept=Number(str('x00281052')||0);
 if(!Number.isFinite(slope)||slope===0||!Number.isFinite(intercept))throw Error('Rescale inválido');
 let sliceIndices=[1],dz=0;
 if(frameCount>1){
  const vector=ds.elements.x00540080,pointer=ds.elements.x00280009;
  if(!pointer||pointer.length!==4||ds.uint16('x00280009',0)!==0x0054||ds.uint16('x00280009',1)!==0x0080)throw Error('SPECT multiframe requiere Frame Increment Pointer = Slice Vector');
  if(ds.uint16('x00540011')!==1||ds.uint16('x00540021')!==1)throw Error('SPECT requiere una ventana de energía y un detector reconstruido');
  if(!vector||vector.length!==frameCount*2||ds.uint16('x00540081')!==frameCount)throw Error('Slice Vector o Number of Slices incompleto');
  sliceIndices=Array.from({length:frameCount},(_,i)=>ds.uint16('x00540080',i));
  // Conservative subset: require spatial slice order to match encoded frame order.
  if(sliceIndices.some((v,i)=>v!==i+1))throw Error('Slice Vector debe ser consecutivo desde 1; no se admiten frames reordenados o duplicados');
  dz=Number(str('x00180088'));
  if(!Number.isFinite(dz)||Math.abs(dz)<.0001)throw Error('Spacing Between Slices ausente o inválido para SPECT');
 }
 const element=ds.elements.x7fe00010,count=nx*ny*frameCount;
 if(count>128*1024*1024)throw Error('Volumen demasiado grande (máximo 128 millones de vóxeles)');
 if(element.encapsulatedPixelData||element.length<count*bits/8||element.dataOffset+count*bits/8>bytes.length)throw Error('Píxeles incompletos');
 const view=new DataView(bytes.buffer,bytes.byteOffset+element.dataOffset,count*bits/8),data=new Float32Array(count),mask=2**stored-1,sign=2**(stored-1),le=syntax!=='1.2.840.10008.1.2.2';
 for(let i=0;i<count;i++){let raw=(bits===8?view.getUint8(i):view.getUint16(i*2,le))&mask;if(signed&&raw>=sign)raw-=2**stored;data[i]=raw*slope+intercept;}
 const common={uid,nx,ny,orientation,spacing,frame:str('x00200052'),patientId:str('x00100020'),issuer:str('x00100021'),modality,sopClass,syntax,
  instance:str('x00200013'),seriesNumber:str('x00200011'),thickness:str('x00180050'),burned:str('x00280301'),
  studyUid:str('x0020000d'),studyId:str('x00200010'),studyDate:str('x00080020'),studyTime:str('x00080030'),accession:str('x00080050'),patientName:str('x00100010'),referring:str('x00080090'),units:str('x00541001')||str('x00281054'),description:str('x0008103e')||'Serie sin descripción',window:Number(str('x00281051').split('\\')[0]),level:str('x00281050')?Number(str('x00281050').split('\\')[0]):40};
 return sliceIndices.map((index,i)=>({...common,position:[position[0],position[1],position[2]+(index-1)*dz],data:data.subarray(i*nx*ny,(i+1)*nx*ny)}));
}
function build(slices){
 if(slices.length<2)throw Error('Se necesitan al menos dos cortes de la misma serie');
 const a=[...slices].sort((p,q)=>p.position[2]-q.position[2]),f=a[0];
 if(a.some(s=>s.units!==f.units))throw Error('La serie mezcla unidades de intensidad distintas');
 for(const s of a)if(s.uid!==f.uid||s.frame!==f.frame||s.modality!==f.modality||s.patientId!==f.patientId||s.issuer!==f.issuer||s.nx!==f.nx||s.ny!==f.ny||s.spacing.some((v,i)=>Math.abs(v-f.spacing[i])>1e-4)||s.position.slice(0,2).some((v,i)=>Math.abs(v-f.position[i])>0.01))throw Error('Serie con geometría inconsistente, desplazamiento o gantry tilt');
 const gaps=a.slice(1).map((s,i)=>s.position[2]-a[i].position[2]),sorted=[...gaps].sort((x,y)=>x-y),dz=sorted[Math.floor(sorted.length/2)];
 if(dz<0.0001||gaps.some(g=>Math.abs(g-dz)>Math.max(.01,dz*.01)))throw Error('Cortes duplicados, ausentes o espaciado irregular');
 const n=f.nx*f.ny*a.length;if(n>128*1024*1024)throw Error('Volumen demasiado grande para este prototipo (máximo 128 millones de vóxeles)');
 const data=new Float32Array(n);a.forEach((s,i)=>data.set(s.data,i*f.nx*f.ny));
 return {nx:f.nx,ny:f.ny,nz:a.length,spacing:[f.spacing[1],f.spacing[0],dz],origin:f.position,data,description:f.description,modality:f.modality,sopClass:f.sopClass,units:f.units,frame:f.frame,patientId:f.patientId,issuer:f.issuer,
  studyUid:f.studyUid,studyId:f.studyId,studyDate:f.studyDate,studyTime:f.studyTime,accession:f.accession,patientName:f.patientName,referring:f.referring,window:f.window||400,level:Number.isFinite(f.level)?f.level:40};
}
function demo(){
 const nx=128,ny=128,nz=144,data=new Float32Array(nx*ny*nz);
 for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  const u=(x-64)/48,v=(y-64)/37,w=(z-72)/68,r=u*u+v*v;
  let value=-1000;if(r<1&&Math.abs(w)<.96){value=r>.87?-90:35;if(((u-.38)/.29)**2+(v/.65)**2<1||((u+.38)/.29)**2+(v/.65)**2<1)value=-780;
   if((u/.15)**2+((v-.62)/.19)**2<1)value=900;
   if(r>.74&&r<.81&&Math.sin(z*.34)>.50)value=650;
   const branch=.22*Math.sin(z*.033);if((u-branch)**2+(v+.05)**2<.011|| (u+branch+.10)**2+(v+.20)**2<.005)value=420;
  }data[x+nx*(y+ny*z)]=value;
 }
 return {nx,ny,nz,spacing:[1.4,1.4,1.5],origin:[0,0,0],data,description:'CT sintético · no es un paciente',modality:'CT',frame:'synthetic-demo',patientId:'synthetic-demo',issuer:'Volumina',window:700,level:250};
}
function demoSpect(){
 const nx=64,ny=64,nz=72,data=new Float32Array(nx*ny*nz);
 for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  data[x+nx*(y+ny*z)]=100*Math.exp(-((x-32)**2/30+(y-32)**2/22+(z-36)**2/55))+65*Math.exp(-((x-43)**2/15+(y-35)**2/18+(z-45)**2/25));
 }
 return {nx,ny,nz,data,spacing:[2.8,2.8,3],origin:[0,0,0],description:'SPECT sintético · dos focos',modality:'NM',frame:'synthetic-demo',patientId:'synthetic-demo',issuer:'Volumina'};
}
function isFunctional(v){return ['NM','PT'].includes(v.modality);}
function intensityUnit(v){return ({BQML:'Bq/ml',CNTS:'cuentas',CPS:'cuentas/s',PCNT:'%',NONE:'sin unidad'})[v.units]||v.units||'intensidad reescalada (sin unidad declarada)';}
function fusionCompatibility(ct,spect){
 if(ct.modality!=='CT'||!isFunctional(spect))return {allowed:false,reason:'La fusión requiere CT como base y NM reconstruido o PT (xSPECT/PET) como volumen funcional.'};
 if(ct.patientId&&spect.patientId&&ct.patientId!==spect.patientId||ct.issuer&&spect.issuer&&ct.issuer!==spect.issuer)return {allowed:false,reason:'Identificadores de paciente incompatibles; no se permite fusionar.'};
 const aligned=!!ct.frame&&ct.frame===spect.frame;
 return {allowed:true,aligned,reason:aligned?'Coordenadas DICOM compartidas. Verifica la correspondencia anatómica.':'Sin marco de referencia compartido. Se requiere registro; el ajuste manual es solo exploratorio.'};
}
// Sample at voxel centers. Coordinates outside the sampled field return null, never edge-clamp.
function sampleTrilinear(v,x,y,z){
 if(![x,y,z].every(Number.isFinite)||x<0||y<0||z<0||x>v.nx-1||y>v.ny-1||z>v.nz-1)return null;
 const x0=Math.floor(x),y0=Math.floor(y),z0=Math.floor(z),x1=Math.min(x0+1,v.nx-1),y1=Math.min(y0+1,v.ny-1),z1=Math.min(z0+1,v.nz-1),dx=x-x0,dy=y-y0,dz=z-z0;
 const at=(i,j,k)=>v.data[i+v.nx*(j+v.ny*k)],mix=(a,b,t)=>a+(b-a)*t;
 return mix(mix(mix(at(x0,y0,z0),at(x1,y0,z0),dx),mix(at(x0,y1,z0),at(x1,y1,z0),dx),dy),mix(mix(at(x0,y0,z1),at(x1,y0,z1),dx),mix(at(x0,y1,z1),at(x1,y1,z1),dx),dy),dz);
}
function fusionMapper(ct,spect,offset=[0,0,0]){
 const scale=ct.spacing.map((s,i)=>s/spect.spacing[i]);
 // Positive offset moves the SPECT volume toward +L/+P/+S in CT coordinates.
 const shift=ct.origin.map((o,i)=>(o-spect.origin[i]-offset[i])/spect.spacing[i]);
 return (x,y,z)=>sampleTrilinear(spect,x*scale[0]+shift[0],y*scale[1]+shift[1],z*scale[2]+shift[2]);
}
function overlaps(ct,spect,offset=[0,0,0]){
 const a=[ct.nx,ct.ny,ct.nz],b=[spect.nx,spect.ny,spect.nz];
 return a.every((n,i)=>Math.max(ct.origin[i],spect.origin[i]+offset[i])<=Math.min(ct.origin[i]+(n-1)*ct.spacing[i],spect.origin[i]+offset[i]+(b[i]-1)*spect.spacing[i]));
}
function hotColor(t){t=Math.max(0,Math.min(1,t));return [Math.min(1,3*t)*255,Math.max(0,Math.min(1,3*t-1))*255,Math.max(0,3*t-2)*255];}
function fusionTextureTransform(ct,spect,offset=[0,0,0]){
 const a=[ct.nx,ct.ny,ct.nz],b=[spect.nx,spect.ny,spect.nz],largest=Math.max(...a.map((n,i)=>n*ct.spacing[i]));
 return {scale:b.map((n,i)=>largest/(2*n*spect.spacing[i])),shift:b.map((n,i)=>((ct.origin[i]+(a[i]-1)*ct.spacing[i]/2-spect.origin[i]-offset[i])/spect.spacing[i]+.5)/n)};
}
root.VolumeCore={parse,parseFrames,build,demo,demoSpect,isFunctional,intensityUnit,fusionCompatibility,sampleTrilinear,fusionMapper,overlaps,hotColor,fusionTextureTransform};
})(typeof window!=='undefined'?window:globalThis);
