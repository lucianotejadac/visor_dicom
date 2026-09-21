/* Multiplanar reformat in DICOM patient coordinates (LPS). Slab values are combined
   before windowing and color: averaging displayed pixels would not preserve HU or Bq/ml. */
(function(root){
'use strict';
const PLANES={
 axial:{axis:2,col:[1,0,0],row:[0,1,0],colAxis:0,rowAxis:1,name:'axial'},
 coronal:{axis:1,col:[1,0,0],row:[0,0,-1],colAxis:0,rowAxis:2,name:'coronal'},
 sagittal:{axis:0,col:[0,1,0],row:[0,0,-1],colAxis:1,rowAxis:2,name:'sagital'}
};
const COMBINERS={mean:'promedio',max:'MIP',min:'MinIP'};
const size=v=>[v.nx,v.ny,v.nz];
function bounds(v){return size(v).map((n,a)=>[v.origin[a],v.origin[a]+(n-1)*v.spacing[a]]);}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
// Planes perpendicular to the reformat normal show up as lines on this source view.
function limitsOn(sourcePlane,targetPlane){
 const s=PLANES[sourcePlane],t=PLANES[targetPlane];
 if(!s||!t||s.axis===t.axis)return null;
 return {axis:t.axis,direction:t.axis===s.colAxis?'vertical':'horizontal'};
}
function plan(v,options={}){
 const {plane='axial',distance=3,thickness=3,combine='mean',maxPixels=4194304,maxSlices=2000}=options;
 const frame=PLANES[plane];
 if(!frame)throw Error('Plano de salida no válido');
 if(!COMBINERS[combine])throw Error('Combinación de slab no válida');
 if(!Number.isFinite(distance)||distance<=0)throw Error('La distancia entre cortes debe ser mayor que cero');
 if(!Number.isFinite(thickness)||thickness<=0)throw Error('El grosor de corte debe ser mayor que cero');
 const box=bounds(v),axis=frame.axis;
 let from=Number.isFinite(options.from)?options.from:box[axis][0],to=Number.isFinite(options.to)?options.to:box[axis][1];
 if(to<from)[from,to]=[to,from];
 from=Math.max(box[axis][0],from);to=Math.min(box[axis][1],to);
 if(to<from)throw Error('El rango seleccionado queda fuera del volumen');
 const pixel=Math.min(...v.spacing);
 const columns=Math.round((box[frame.colAxis][1]-box[frame.colAxis][0])/pixel)+1;
 const rows=Math.round((box[frame.rowAxis][1]-box[frame.rowAxis][0])/pixel)+1;
 if(columns*rows>maxPixels)throw Error(`Matriz de salida demasiado grande (${columns} × ${rows})`);
 const count=Math.floor((to-from)/distance+1e-6)+1;
 if(count>maxSlices)throw Error(`Demasiados cortes (${count}). Aumenta la distancia o reduce el rango.`);
 // One sample per native voxel along the normal; a slab thinner than a voxel is a single interpolated plane.
 const samples=Math.max(1,Math.min(64,Math.ceil(thickness/v.spacing[axis]-1e-9)));
 const offsets=samples===1?[0]:Array.from({length:samples},(_,s)=>((s+.5)/samples-.5)*thickness);
 const normal=cross(frame.col,frame.row);
 const centers=Array.from({length:count},(_,k)=>from+k*distance);
 const tlhc=center=>{const p=[0,0,0];p[frame.colAxis]=box[frame.colAxis][0];p[frame.rowAxis]=frame.row[frame.rowAxis]>0?box[frame.rowAxis][0]:box[frame.rowAxis][1];p[axis]=center;return p;};
 return {plane,name:frame.name,axis,col:frame.col,row:frame.row,normal,orientation:[...frame.col,...frame.row],
  columns,rows,pixel,distance,thickness,combine,samples,offsets,from,to,count,centers,box,
  position:k=>tlhc(centers[k]),
  location:k=>normal[axis]*centers[k]};
}
// Combine the slab in native intensities: HU for the base, Bq/ml (or counts) for the functional volume.
function slab(p,sample,point){
 let total=0,found=0,best=null;
 for(const d of p.offsets){
  const q=[point[0],point[1],point[2]];q[p.axis]+=d;
  const value=sample(q);
  if(value===null||value===undefined||!Number.isFinite(value))continue;
  found++;total+=value;
  if(best===null||(p.combine==='max'?value>best:value<best))best=value;
 }
 if(!found)return null;
 return p.combine==='mean'?total/found:best;
}
function renderSlice(p,k,options){
 const v=options.volume,palette=options.palette||root.VolumeCore.hotColor;
 const ww=Number(options.window),wl=Number(options.level),low=wl-.5-(ww-1)/2;
 const fusion=options.fusion&&options.fusion.sample?options.fusion:null;
 const fusionLow=fusion?Number(fusion.low):0,fusionHigh=fusion?Number(fusion.high):1,alpha=fusion?Number(fusion.alpha):0;
 const origin=p.position(k),rgba=new Uint8ClampedArray(p.columns*p.rows*4);
 const values=new Float32Array(p.columns*p.rows).fill(NaN),activity=fusion?new Float32Array(p.columns*p.rows).fill(NaN):null;
 const toVoxel=q=>[(q[0]-v.origin[0])/v.spacing[0],(q[1]-v.origin[1])/v.spacing[1],(q[2]-v.origin[2])/v.spacing[2]];
 const base=q=>{const [x,y,z]=toVoxel(q);return root.VolumeCore.sampleTrilinear(v,x,y,z);};
 const functional=fusion?q=>{const [x,y,z]=toVoxel(q);return fusion.sample(x,y,z);}:null;
 for(let j=0;j<p.rows;j++)for(let i=0;i<p.columns;i++){
  const point=[0,1,2].map(a=>origin[a]+i*p.pixel*p.col[a]+j*p.pixel*p.row[a]);
  const index=i+p.columns*j,n=index*4;
  rgba[n+3]=255;
  const value=slab(p,base,point);
  if(value===null)continue;
  values[index]=value;
  const gray=ww<=1?(value>wl-.5?255:0):Math.max(0,Math.min(255,(value-low)/(ww-1)*255));
  rgba[n]=rgba[n+1]=rgba[n+2]=gray;
  if(!fusion||alpha<=0)continue;
  const active=slab(p,functional,point);
  if(active===null)continue;
  activity[index]=active;
  if(active<=fusionLow)continue;
  const t=Math.min(1,(active-fusionLow)/Math.max(fusionHigh-fusionLow,1e-20)),rgb=palette(t),mix=alpha*Math.min(1,t*4);
  for(let channel=0;channel<3;channel++)rgba[n+channel]=gray*(1-mix)+rgb[channel]*mix;
 }
 return {rgba,values,activity,columns:p.columns,rows:p.rows};
}
function toRgb24(rgba){const out=new Uint8Array(rgba.length/4*3);for(let i=0,o=0;i<rgba.length;i+=4){out[o++]=rgba[i];out[o++]=rgba[i+1];out[o++]=rgba[i+2];}return out;}
root.Reformat={PLANES,COMBINERS,bounds,limitsOn,plan,slab,renderSlice,toRgb24};
})(typeof window!=='undefined'?window:globalThis);
