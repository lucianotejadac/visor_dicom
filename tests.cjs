const assert=require('node:assert/strict');
globalThis.dicomParser=require('./vendor/dicomParser.min.js');require('./core.js');require('./reformat.js');require('./dicomwrite.js');
const {parse,parseFrames,build,demo,demoSpect,fusionCompatibility,sampleTrilinear,fusionMapper,overlaps,hotColor}=globalThis.VolumeCore;
const {plan,renderSlice,toRgb24,limitsOn}=globalThis.Reformat,DicomWrite=globalThis.DicomWrite;
function dicom({z=0,syntax='1.2.840.10008.1.2.1',orientation='1\\0\\0\\0\\1\\0',values=[-100,0,100,1000],signed=1,stored=16,bits=16,slope='2',intercept='-10',nm=false,frames=1,dz='2',sliceVector=null,imageType='DERIVED\\PRIMARY\\RECON TOMO',pointer=[0x0054,0x0080],patient='test-patient',frame='1.2.3.4',pt=false,units=''}={}){
 const be=syntax==='1.2.840.10008.1.2.2',implicit=syntax==='1.2.840.10008.1.2';
 const encode=(g,e,vr,val,meta=false)=>{
  const big=meta?false:be,imp=meta?false:implicit;let b;
  if(Buffer.isBuffer(val))b=val;else if(vr==='US'){b=Buffer.alloc(2);big?b.writeUInt16BE(val):b.writeUInt16LE(val);}else{b=Buffer.from(val);if(b.length%2)b=Buffer.concat([b,Buffer.from(vr==='UI'?'\0':' ')]);}
  const long=['OB','OW','SQ'].includes(vr),h=Buffer.alloc(imp?8:long?12:8),w16=(v,o)=>big?h.writeUInt16BE(v,o):h.writeUInt16LE(v,o),w32=(v,o)=>big?h.writeUInt32BE(v,o):h.writeUInt32LE(v,o);
  w16(g,0);w16(e,2);if(imp)w32(b.length,4);else{h.write(vr,4);if(long)w32(b.length,8);else w16(b.length,6);}return Buffer.concat([h,b]);
 };
 const pixel=Buffer.alloc(values.length*bits/8);values.forEach((v,i)=>{let raw=v<0?v+2**stored:v;if(bits===8)pixel.writeUInt8(raw,i);else if(be)pixel.writeUInt16BE(raw,i*2);else pixel.writeUInt16LE(raw,i*2);});
 let rows=[[0x0008,0x0060,'CS',nm?'NM':'CT'],[0x0010,0x0020,'LO',patient],[0x0020,0x000e,'UI','1.2.3'],[0x0020,0x0052,'UI',frame],[0x0020,0x0032,'DS',`0\\0\\${z}`],[0x0020,0x0037,'DS',orientation],[0x0028,0x0002,'US',1],[0x0028,0x0004,'CS','MONOCHROME2'],[0x0028,0x0010,'US',2],[0x0028,0x0011,'US',2],[0x0028,0x0030,'DS','2\\3'],[0x0028,0x0100,'US',bits],[0x0028,0x0101,'US',stored],[0x0028,0x0102,'US',stored-1],[0x0028,0x0103,'US',signed],[0x0028,0x1052,'DS',intercept],[0x0028,0x1053,'DS',slope],[0x7fe0,0x0010,'OW',pixel]];
 if(nm){
  const words=arr=>{const b=Buffer.alloc(arr.length*2);arr.forEach((v,i)=>be?b.writeUInt16BE(v,i*2):b.writeUInt16LE(v,i*2));return b;};
  const geom=Buffer.concat([encode(0x0020,0x0032,'DS',`0\\0\\${z}`),encode(0x0020,0x0037,'DS',orientation)]),item=Buffer.alloc(8);
  if(be){item.writeUInt16BE(0xfffe,0);item.writeUInt16BE(0xe000,2);item.writeUInt32BE(geom.length,4);}else{item.writeUInt16LE(0xfffe,0);item.writeUInt16LE(0xe000,2);item.writeUInt32LE(geom.length,4);}
  rows=rows.filter(r=>!(r[0]===0x0020&&[0x0032,0x0037].includes(r[1])));
  rows.push([8,8,'CS',imageType],[0x0018,0x0088,'DS',dz],[0x0028,8,'IS',String(frames)],[0x0028,9,'AT',words(pointer)],[0x0054,0x0011,'US',1],[0x0054,0x0021,'US',1],[0x0054,0x0022,'SQ',Buffer.concat([item,geom])],[0x0054,0x0080,'US',words(sliceVector||Array.from({length:frames},(_,i)=>i+1))],[0x0054,0x0081,'US',frames]);
 }
 if(pt){rows.find(r=>r[0]===8&&r[1]===0x0060)[3]='PT';rows.push([8,0x0016,'UI','1.2.840.10008.5.1.4.1.1.128']);}
 if(units)rows.push([0x0054,0x1001,'CS',units]);
 rows.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 return new Uint8Array(Buffer.concat([Buffer.alloc(128),Buffer.from('DICM'),encode(2,0x0010,'UI',syntax,true),...rows.map(r=>encode(...r))]));
}
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('Little Endian + signed pixels + rescale',()=>assert.deepEqual([...parse(dicom()).data],[-210,-10,190,1990]));
test('Big Endian',()=>assert.deepEqual([...parse(dicom({syntax:'1.2.840.10008.1.2.2'})).data],[-210,-10,190,1990]));
test('Implicit VR Little Endian',()=>assert.deepEqual([...parse(dicom({syntax:'1.2.840.10008.1.2'})).data],[-210,-10,190,1990]));
test('Signed 12-bit stored in 16 bits',()=>assert.deepEqual([...parse(dicom({stored:12})).data],[-210,-10,190,1990]));
test('Unsigned 8-bit',()=>assert.deepEqual([...parse(dicom({bits:8,stored:8,signed:0,values:[0,10,128,255],slope:'1',intercept:'0'})).data],[0,10,128,255]));
const slice=z=>parse(dicom({z,values:[z,z,z,z],slope:'1',intercept:'0'}));
test('Physical ordering, spacing and pixel placement',()=>{const v=build([slice(4),slice(0),slice(2)]);assert.deepEqual(v.spacing,[3,2,2]);assert.deepEqual([v.data[0],v.data[4],v.data[8]],[0,2,4]);});
test('Reject duplicate slices',()=>assert.throws(()=>build([slice(0),slice(0)]),/duplicados/));
test('Reject uneven spacing',()=>assert.throws(()=>build([slice(0),slice(2),slice(5)]),/irregular/));
test('Reject gantry tilt',()=>{const s=slice(2);s.position[0]=1;assert.throws(()=>build([slice(0),s]),/gantry/);});
test('Reject oblique orientation',()=>assert.throws(()=>parse(dicom({orientation:'0\\1\\0\\1\\0\\0'})),/orientación/));
test('Reject compressed transfer syntax',()=>assert.throws(()=>parse(dicom({syntax:'1.2.840.10008.1.2.4.50'})),/sin compresión/));
test('Reject single slice',()=>assert.throws(()=>build([slice(0)]),/dos cortes/));
test('Synthetic volume has expected dimensions and finite intensities',()=>{const v=demo();assert.equal(v.data.length,v.nx*v.ny*v.nz);assert.ok(v.data.every(Number.isFinite));assert.equal(v.data[0],-1000);assert.ok(v.data.includes(900));});
const nmOptions={nm:true,frames:3,values:[10,10,10,10,20,20,20,20,30,30,30,30],slope:'1',intercept:'0'};
test('SPECT multiframe detector geometry, slice spacing, frame and patient metadata',()=>{const v=build(parseFrames(dicom(nmOptions)));assert.deepEqual([v.nx,v.ny,v.nz],[2,2,3]);assert.deepEqual(v.spacing,[3,2,2]);assert.deepEqual([...v.data],[10,10,10,10,20,20,20,20,30,30,30,30]);assert.equal(v.frame,'1.2.3.4');assert.equal(v.patientId,'test-patient');});
test('Negative NM spacing reverses physical order without flipping pixel planes',()=>{const v=build(parseFrames(dicom({...nmOptions,dz:'-2'})));assert.deepEqual(v.origin,[0,0,-4]);assert.deepEqual([v.data[0],v.data[4],v.data[8]],[30,20,10]);});
for(const syntax of ['1.2.840.10008.1.2','1.2.840.10008.1.2.2'])test('SPECT multiframe syntax '+syntax,()=>assert.equal(build(parseFrames(dicom({...nmOptions,syntax}))).data[8],30));
test('Reject SPECT acquisition projections',()=>assert.throws(()=>parseFrames(dicom({...nmOptions,imageType:'ORIGINAL\\PRIMARY\\TOMO'})),/proyecciones/));
test('Reject gated SPECT',()=>assert.throws(()=>parseFrames(dicom({...nmOptions,imageType:'DERIVED\\PRIMARY\\RECON GATED TOMO'})),/gated/));
test('Reject missing NM spacing',()=>assert.throws(()=>parseFrames(dicom({...nmOptions,dz:''})),/Spacing Between/));
test('Reject duplicate NM slice vector',()=>assert.throws(()=>parseFrames(dicom({...nmOptions,sliceVector:[1,1,3]})),/duplicados/));
test('Reject unsupported NM frame dimensions',()=>assert.throws(()=>parseFrames(dicom({...nmOptions,pointer:[0x0054,0x0070]})),/Frame Increment/));
test('Reject truncated multiframe pixels',()=>assert.throws(()=>parseFrames(dicom({...nmOptions,values:[10,10,10,10]})),/incompletos/));
const ramp={nx:2,ny:2,nz:2,data:Float32Array.from([0,1,2,3,4,5,6,7]),spacing:[2,3,4],origin:[10,20,30]};
test('Trilinear interpolation and exact edge centers',()=>{assert.equal(sampleTrilinear(ramp,.5,.5,.5),3.5);assert.equal(sampleTrilinear(ramp,1,1,1),7);assert.equal(sampleTrilinear(ramp,0,0,0),0);});
test('Out-of-field samples are transparent',()=>{assert.equal(sampleTrilinear(ramp,-.001,0,0),null);assert.equal(sampleTrilinear(ramp,1.01,0,0),null);assert.equal(sampleTrilinear(ramp,NaN,0,0),null);});
test('Fusion maps CT centers through origins and unequal voxel spacing',()=>{const ct={origin:[11,21.5,32],spacing:[1,1,1]};assert.equal(fusionMapper(ct,ramp)(0,0,0),3.5);});
test('Positive manual translation moves SPECT toward positive patient coordinates',()=>{const ct={origin:[12,21.5,32],spacing:[1,1,1]};assert.equal(fusionMapper(ct,ramp,[1,0,0])(0,0,0),3.5);});
test('Shared frame enables coordinate alignment, differing or missing frame does not',()=>{const ct=demo(),nm=demoSpect();assert.equal(fusionCompatibility(ct,nm).aligned,true);assert.equal(fusionCompatibility(ct,{...nm,frame:'other'}).aligned,false);assert.equal(fusionCompatibility({...ct,frame:''},{...nm,frame:''}).aligned,false);});
test('Reject conflicting patients even with matching coordinate frames',()=>assert.equal(fusionCompatibility(demo(),{...demoSpect(),patientId:'different'}).allowed,false));
test('Reject non-NM overlay',()=>assert.equal(fusionCompatibility(demo(),demo()).allowed,false));
test('Detect no physical overlap',()=>{assert.equal(overlaps(ramp,ramp),true);assert.equal(overlaps(ramp,ramp,[100,0,0]),false);});
test('Hot palette endpoints and channel bounds',()=>{assert.deepEqual(hotColor(0),[0,0,0]);assert.deepEqual(hotColor(1),[255,255,255]);for(let t=0;t<=1;t+=.01)assert.ok(hotColor(t).every(c=>c>=0&&c<=255));});
test('xSPECT PT single slices retain unsigned pixels, BQML and per-slice rescale',()=>{
 const a=parse(dicom({pt:true,units:'BQML',z:0,signed:0,slope:'10',intercept:'0',values:[0,100,41489,65535]}));
 const b=parse(dicom({pt:true,units:'BQML',z:2.53906,signed:0,slope:'5',intercept:'2',values:[0,100,200,300]}));
 const v=build([b,a]);assert.equal(v.modality,'PT');assert.equal(v.units,'BQML');assert.equal(v.data[2],414890);assert.equal(v.data[3],655350);assert.equal(v.data[5],502);assert.equal(v.spacing[2],2.53906);assert.equal(VolumeCore.intensityUnit(v),'Bq/ml');assert.equal(VolumeCore.isFunctional(v),true);
 assert.equal(fusionCompatibility({...demo(),patientId:v.patientId,issuer:v.issuer,frame:v.frame},v).aligned,true);
});
test('Reject mixed intensity units within a functional series',()=>{const a=parse(dicom({pt:true,units:'BQML',z:0})),b=parse(dicom({pt:true,units:'CNTS',z:2}));assert.throws(()=>build([a,b]),/unidades/);});
test('Missing units are not implicitly labeled Bq/ml or SUV',()=>assert.match(VolumeCore.intensityUnit({}),/sin unidad declarada/));
test('PT fusion retains reference-frame and patient checks',()=>{const nm={...demoSpect(),modality:'PT',units:'BQML'};assert.equal(fusionCompatibility(demo(),{...nm,frame:'other'}).aligned,false);assert.equal(fusionCompatibility(demo(),{...nm,patientId:'other'}).allowed,false);});
test('GPU texture transform matches CPU physical sampling with unequal spacing and translation',()=>{
 const ct={nx:5,ny:7,nz:9,spacing:[1,2,3],origin:[10,20,30]},s={nx:3,ny:4,nz:5,spacing:[2,4,6],origin:[8,15,25]},offset=[1,-2,3];
 const tf=VolumeCore.fusionTextureTransform(ct,s,offset),a=[ct.nx,ct.ny,ct.nz],b=[s.nx,s.ny,s.nz],largest=27,index=[1,3,5];
 for(let i=0;i<3;i++){const position=(index[i]-(a[i]-1)/2)*ct.spacing[i]*2/largest;const gpu=position*tf.scale[i]+tf.shift[i];const expected=((ct.origin[i]+index[i]*ct.spacing[i]-s.origin[i]-offset[i])/s.spacing[i]+.5)/b[i];assert.ok(Math.abs(gpu-expected)<1e-12);}
});
test('GPU transform preserves voxel center alignment for identical volumes',()=>{const v={nx:2,ny:2,nz:2,spacing:[1,1,1],origin:[100,200,300]};const tf=VolumeCore.fusionTextureTransform(v,v);assert.deepEqual(tf.scale,[.5,.5,.5]);assert.deepEqual(tf.shift,[.5,.5,.5]);});
// Reformat: a 4 × 5 × 6 volume of 2 mm voxels whose intensity equals its S coordinate in mm.
const graded=(()=>{
 const nx=4,ny=5,nz=6,spacing=[2,2,2],origin=[10,20,30],data=new Float32Array(nx*ny*nz);
 for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)data[x+nx*(y+ny*z)]=origin[2]+z*spacing[2];
 return {nx,ny,nz,spacing,origin,data,modality:'CT',description:'Rampa sintética',window:100,level:50};
})();
test('Reformat geometry, matrix and image orientation per output plane',()=>{
 const axial=plan(graded,{plane:'axial',distance:2,thickness:2});
 assert.deepEqual([axial.columns,axial.rows],[4,5]);assert.deepEqual(axial.orientation,[1,0,0,0,1,0]);assert.deepEqual(axial.position(0),[10,20,30]);
 const coronal=plan(graded,{plane:'coronal',distance:2,thickness:2});
 assert.deepEqual([coronal.columns,coronal.rows],[4,6]);assert.deepEqual(coronal.orientation,[1,0,0,0,0,-1]);assert.deepEqual(coronal.position(0),[10,20,40]);
 const sagittal=plan(graded,{plane:'sagittal',distance:2,thickness:2});
 assert.deepEqual([sagittal.columns,sagittal.rows],[5,6]);assert.deepEqual(sagittal.orientation,[0,1,0,0,0,-1]);assert.deepEqual(sagittal.position(0),[10,20,40]);
 assert.equal(sagittal.location(0),-10);
});
test('Slice distance and range decide how many slices are planned',()=>{
 assert.deepEqual(plan(graded,{plane:'axial',distance:3,thickness:3}).centers,[30,33,36,39]);
 assert.deepEqual(plan(graded,{plane:'axial',distance:2,thickness:2,from:33,to:39}).centers,[33,35,37,39]);
 assert.equal(plan(graded,{plane:'axial',distance:2,thickness:2,from:39,to:33}).count,4);
});
test('Thickness averages native intensities; MIP and MinIP take the slab extremes',()=>{
 const options={volume:graded,window:100,level:50};
 const mean=plan(graded,{plane:'axial',distance:2,thickness:4});
 assert.equal(mean.samples,2);
 assert.ok(Math.abs(renderSlice(mean,2,options).values[0]-34)<1e-4);
 assert.ok(Math.abs(renderSlice(plan(graded,{plane:'axial',distance:2,thickness:4,combine:'max'}),2,options).values[0]-35)<1e-4);
 assert.ok(Math.abs(renderSlice(plan(graded,{plane:'axial',distance:2,thickness:4,combine:'min'}),2,options).values[0]-33)<1e-4);
 assert.equal(plan(graded,{plane:'axial',distance:2,thickness:1}).samples,1);
});
test('Slab samples outside the volume are dropped, never clamped to the edge',()=>{
 const p=plan(graded,{plane:'axial',distance:2,thickness:4});
 assert.ok(Math.abs(renderSlice(p,0,{volume:graded,window:100,level:50}).values[0]-31)<1e-4);
});
test('Reformatted rows follow physical millimetres from superior to inferior',()=>{
 const p=plan(graded,{plane:'coronal',distance:2,thickness:1}),image=renderSlice(p,1,{volume:graded,window:100,level:50});
 assert.equal(image.values[0],40);assert.equal(image.values[p.columns*(p.rows-1)],30);
});
test('Window and level map slab values to gray in the reformat',()=>{
 const p=plan(graded,{plane:'coronal',distance:2,thickness:1}),image=renderSlice(p,0,{volume:graded,window:20,level:35});
 assert.equal(image.rgba[0],Math.round(Math.min(255,(40-25)/19*255)));
 assert.deepEqual([image.rgba[1],image.rgba[2],image.rgba[3]],[image.rgba[0],image.rgba[0],255]);
});
test('Functional overlay colours the reformat and zero opacity leaves it gray',()=>{
 const p=plan(graded,{plane:'axial',distance:2,thickness:2}),fusion={sample:()=>100,low:0,high:100,alpha:1};
 const coloured=renderSlice(p,0,{volume:graded,window:100,level:50,fusion});
 assert.deepEqual([coloured.rgba[0],coloured.rgba[1],coloured.rgba[2]],[255,255,255]);
 const plain=renderSlice(p,0,{volume:graded,window:100,level:50,fusion:{...fusion,alpha:0}});
 assert.equal(plain.rgba[0],plain.rgba[2]);
 const outside=renderSlice(p,0,{volume:graded,window:100,level:50,fusion:{...fusion,sample:()=>null}});
 assert.equal(outside.rgba[0],outside.rgba[2]);
});
test('Range limits are drawn perpendicular to the output plane on the working view',()=>{
 assert.deepEqual(limitsOn('axial','sagittal'),{axis:0,direction:'vertical'});
 assert.deepEqual(limitsOn('axial','coronal'),{axis:1,direction:'horizontal'});
 assert.deepEqual(limitsOn('sagittal','axial'),{axis:2,direction:'horizontal'});
 assert.deepEqual(limitsOn('coronal','sagittal'),{axis:0,direction:'vertical'});
 assert.equal(limitsOn('axial','axial'),null);
});
test('Reformat rejects invalid spacing, thickness, plane and empty ranges',()=>{
 assert.throws(()=>plan(graded,{plane:'axial',distance:0,thickness:2}),/distancia/);
 assert.throws(()=>plan(graded,{plane:'axial',distance:2,thickness:0}),/grosor/);
 assert.throws(()=>plan(graded,{plane:'axial',distance:.001,thickness:2}),/Demasiados cortes/);
 assert.throws(()=>plan(graded,{plane:'oblicuo',distance:2,thickness:2}),/Plano de salida/);
 assert.throws(()=>plan(graded,{plane:'axial',distance:2,thickness:2,combine:'media'}),/Combinación/);
 assert.throws(()=>plan(graded,{plane:'axial',distance:2,thickness:2,from:60,to:80}),/fuera del volumen/);
});
test('RGB conversion drops the alpha channel in order',()=>assert.deepEqual([...toRgb24(Uint8ClampedArray.from([1,2,3,255,4,5,6,255]))],[1,2,3,4,5,6]));
test('Secondary Capture RGB round-trips through the parser with geometry and pixels',()=>{
 const p=plan(graded,{plane:'coronal',distance:2,thickness:4}),image=renderSlice(p,1,{volume:graded,window:100,level:50});
 const bytes=DicomWrite.secondaryCapture({rgb:toRgb24(image.rgba),columns:p.columns,rows:p.rows,position:p.position(1),orientation:p.orientation,
  pixelSpacing:[p.pixel,p.pixel],sliceLocation:p.location(1),sliceThickness:p.thickness,spacingBetweenSlices:p.distance,
  studyUid:'1.2.3',seriesUid:'1.2.4',frameUid:'1.2.5',patientId:'test-patient',patientName:'Prueba^Volumina',
  seriesNumber:9001,instanceNumber:2,seriesDescription:'Prueba coronal',derivation:'Reformateo de prueba'});
 const ds=dicomParser.parseDicom(bytes);
 assert.equal(ds.string('x00020010'),'1.2.840.10008.1.2.1');
 assert.equal(ds.string('x00080016'),'1.2.840.10008.5.1.4.1.1.7');
 assert.equal(ds.string('x00080060'),'OT');assert.equal(ds.string('x00080064'),'WSD');
 assert.equal(ds.string('x00080008'),'DERIVED\\SECONDARY\\REFORMATTED');
 assert.equal(ds.string('x00280004'),'RGB');assert.equal(ds.uint16('x00280002'),3);assert.equal(ds.uint16('x00280006'),0);
 assert.equal(ds.uint16('x00280010'),p.rows);assert.equal(ds.uint16('x00280011'),p.columns);
 assert.equal(ds.uint16('x00280100'),8);assert.equal(ds.uint16('x00280103'),0);
 assert.equal(ds.string('x00200037'),'1\\0\\0\\0\\0\\-1');
 assert.equal(ds.string('x00200032'),'10\\22\\40');
 assert.equal(ds.string('x00280030'),'2\\2');
 assert.equal(ds.string('x00180050'),'4');assert.equal(ds.string('x00180088'),'2');
 assert.equal(ds.string('x00201041'),'22');
 assert.equal(ds.string('x0020000d'),'1.2.3');assert.equal(ds.string('x0020000e'),'1.2.4');assert.equal(ds.string('x00200052'),'1.2.5');
 assert.equal(ds.string('x00100020'),'test-patient');assert.equal(ds.string('x00100010'),'Prueba^Volumina');
 assert.equal(ds.string('x00080005'),'ISO_IR 192');
 assert.equal(ds.elements.x7fe00010.length,p.columns*p.rows*3);
 const offset=ds.elements.x7fe00010.dataOffset;
 assert.deepEqual([...bytes.slice(offset,offset+3)],[image.rgba[0],image.rgba[1],image.rgba[2]]);
});
test('Writer refuses incomplete pixel buffers',()=>assert.throws(()=>DicomWrite.secondaryCapture({rgb:new Uint8Array(5),columns:2,rows:2,position:[0,0,0],orientation:[1,0,0,0,1,0],pixelSpacing:[1,1],sliceLocation:0,sliceThickness:1,spacingBetweenSlices:1,studyUid:'1',seriesUid:'2',seriesNumber:1,instanceNumber:1}),/incompletos/));
test('Generated UIDs use the UUID-derived 2.25 root within 64 characters',()=>{
 const a=DicomWrite.uid(),b=DicomWrite.uid();
 assert.match(a,/^2\.25\.\d+$/);assert.ok(a.length<=64);assert.notEqual(a,b);
});
test('Decimal strings stay inside the 16-character DICOM limit',()=>{
 for(const value of [0,-1,1/3,-123.456789,12345.6789,1e-9])assert.ok(DicomWrite.ds(value).length<=16,String(value));
 assert.equal(DicomWrite.ds(0),'0');assert.equal(DicomWrite.ds(-1),'-1');assert.equal(DicomWrite.ds(2.5),'2.5');
});
test('ZIP fallback is store-only with valid CRC, directory and offsets',()=>{
 assert.equal(DicomWrite.crc32(Buffer.from('123456789')),0xcbf43926);
 const archive=DicomWrite.zip([{name:'A.dcm',data:Uint8Array.from([1,2,3,4])},{name:'B.dcm',data:Uint8Array.from([5,6])}]);
 const view=new DataView(archive.buffer,archive.byteOffset,archive.byteLength),end=archive.length-22;
 assert.equal(view.getUint32(0,true),0x04034b50);
 assert.equal(view.getUint32(end,true),0x06054b50);
 assert.equal(view.getUint16(end+10,true),2);
 assert.equal(view.getUint32(end+12,true),2*(46+5));
 assert.equal(view.getUint32(end+16,true),39+37);
 assert.equal(view.getUint16(4,true),20);
});
console.log(`${passed} tests passed.`);
