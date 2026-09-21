const assert=require('node:assert/strict');
globalThis.dicomParser=require('./vendor/dicomParser.min.js');require('./core.js');require('./dicomwrite.js');require('./anon.js');
const {dicom}=require('./tests-fixture.cjs');
const {anonymize,audit,describe,planSeries,longestRun,exportOrder,nameOf}=globalThis.DicomAnon;
const {parse,build}=globalThis.VolumeCore;

const UIDS={studyUid:'2.25.111',seriesUid:'2.25.222',frameUid:'2.25.333'};
const clean=(o={})=>anonymize(dicom(o),{...UIDS,sopUid:'2.25.444',instance:o.instance||1});
const read=bytes=>globalThis.dicomParser.parseDicom(bytes);
const text=(ds,tag)=>(ds.string(tag)||'').trim();

let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}

test('Los píxeles salen byte a byte iguales',()=>{
 const source=dicom(),out=clean().bytes;
 const a=read(source).elements.x7fe00010,b=read(out).elements.x7fe00010;
 assert.equal(b.length,a.length);
 assert.deepEqual([...out.slice(b.dataOffset,b.dataOffset+b.length)],[...source.slice(a.dataOffset,a.dataOffset+a.length)]);
});
test('Las HU se conservan tras reescribir',()=>
 assert.deepEqual([...parse(clean().bytes).data],[...parse(dicom()).data]));
test('Identidad de paciente reemplazada por la fija',()=>{
 const ds=read(clean().bytes);
 assert.equal(text(ds,'x00100010'),'ANONIMO^RECORTE');
 assert.equal(text(ds,'x00100020'),'VOLUMINA-ANON-001');
 assert.equal(text(ds,'x00100021'),'Volumina-anon');
 assert.equal(text(ds,'x00120062'),'YES');
 assert.ok(text(ds,'x00120063').startsWith('Recorte Z'));
});
test('Tipo 2 queda presente pero vacío',()=>{
 const ds=read(clean().bytes);
 for(const tag of ['x00080050','x00080090','x00100030','x00200010']){
  assert.ok(ds.elements[tag],'falta '+nameOf(tag));
  assert.equal(ds.elements[tag].length,0,nameOf(tag)+' no está vacío');
 }
});
test('Fechas y horas aplanadas',()=>{
 const ds=read(clean().bytes);
 for(const tag of ['x00080012','x00080020','x00080023'])assert.equal(text(ds,tag),'20260101');
 for(const tag of ['x00080013','x00080030','x00080033'])assert.equal(text(ds,tag),'120000.000000');
});
test('UID de estudio, serie y marco reemplazados por los indicados',()=>{
 const ds=read(clean().bytes);
 assert.equal(text(ds,'x0020000d'),UIDS.studyUid);
 assert.equal(text(ds,'x0020000e'),UIDS.seriesUid);
 assert.equal(text(ds,'x00200052'),UIDS.frameUid);
 assert.equal(text(ds,'x00080018'),'2.25.444');
 assert.equal(text(ds,'x00020003'),'2.25.444');
 assert.equal(text(ds,'x00020002'),'1.2.840.10008.5.1.4.1.1.2');
 assert.equal(text(ds,'x00020010'),'1.2.840.10008.1.2.1');
});
test('SOPInstanceUID nuevo y distinto en cada corte sin indicarlo',()=>{
 const a=anonymize(dicom(),UIDS),b=anonymize(dicom(),UIDS);
 assert.notEqual(a.uids.sop,b.uids.sop);
 assert.ok(a.uids.sop.startsWith('2.25.'));
});
test('Tags privados y su creador eliminados',()=>{
 const ds=read(clean().bytes);
 assert.equal(ds.elements.x00291140,undefined);
 assert.equal(ds.elements.x00290010,undefined);
 assert.ok(Object.keys(ds.elements).every(key=>parseInt(key.slice(1,5),16)%2===0));
});
test('Identificadores directos eliminados',()=>{
 const ds=read(clean().bytes);
 for(const tag of ['x00080014','x00080080','x00081010','x00081070','x00101010','x00101030','x00181000','x00204000'])
  assert.equal(ds.elements[tag],undefined,nameOf(tag)+' sobrevivió');
});
test('Grupos de ensayo clínico y overlay eliminados; 0012,0062 y 0012,0063 se conservan',()=>{
 const ds=read(clean().bytes);
 assert.equal(ds.elements.x00120010,undefined);
 assert.equal(ds.elements.x60000010,undefined);
 assert.ok(ds.elements.x00120062&&ds.elements.x00120063);
});
test('Secuencia con UID ajeno eliminada entera, secuencia de códigos conservada',()=>{
 const ds=read(clean().bytes);
 assert.equal(ds.elements.x00081110,undefined);
 assert.ok(ds.elements.x00082218,'AnatomicRegionSequence debería conservarse');
 assert.equal(ds.elements.x00082218.items[0].dataSet.string('x00080100'),'T-D4000');
});
test('Datos técnicos que no identifican se conservan',()=>{
 const ds=read(clean().bytes);
 assert.equal(text(ds,'x00080070'),'SIEMENS');
 assert.equal(text(ds,'x00181030'),'PETCT_FDG_WB');
 assert.equal(text(ds,'x00180060'),'120');
 assert.equal(text(ds,'x00100040'),'F');
 assert.equal(text(ds,'x00281053'),'10');
 assert.equal(text(ds,'x00281052'),'-10240');
});
test('Descripciones de estudio y serie reemplazadas',()=>{
 const ds=read(clean().bytes);
 assert.equal(text(ds,'x00081030'),'ESTUDIO ANONIMIZADO');
 assert.equal(text(ds,'x0008103e'),'Serie recortada y anonimizada');
});
test('InstanceNumber renumerado',()=>
 assert.equal(text(read(anonymize(dicom({instance:328}),{...UIDS,instance:1}).bytes),'x00200013'),'1'));
test('Los elementos salen en orden ascendente de tag',()=>{
 const keys=Object.keys(read(clean().bytes).elements).filter(k=>!k.startsWith('x0002'));
 assert.deepEqual(keys,[...keys].sort());
});
test('El informe nombra lo eliminado, vaciado y reemplazado',()=>{
 const {report}=clean();
 assert.ok(report.removed.includes('InstitutionName'));
 assert.ok(report.removed.some(entry=>entry.startsWith('ReferencedStudySequence')));
 assert.ok(report.removed.includes('Tags privados (2)'),'debería contar los tags privados');
 assert.ok(report.removed.includes('Overlays y curvas (2)'));
 assert.ok(report.removed.includes('ClinicalTrialSponsorName'));
 assert.ok(report.cleared.includes('AccessionNumber'));
 assert.ok(report.replaced.includes('PatientName')&&report.replaced.includes('StudyDate'));
});
test('Aviso cuando la imagen declara texto grabado',()=>{
 assert.deepEqual(clean({burned:'NO'}).report.warnings,[]);
 assert.equal(clean({burned:'YES'}).report.warnings.length,1);
});
test('La auditoría no encuentra fugas en la salida',()=>{
 const result=clean();
 assert.deepEqual(audit(result.bytes,{uids:result.uids,pixelLength:result.pixelLength}),[]);
});
test('La auditoría detecta identificadores y UID ajenos',()=>{
 const result=clean();
 const problems=audit(result.bytes,{uids:{},pixelLength:result.pixelLength});
 assert.ok(problems.some(p=>p.startsWith('UID ajeno')),'debería marcar los UID no declarados');
 assert.ok(audit(dicom(),{uids:UIDS}).length>3);
});
test('La auditoría detecta píxeles de longitud distinta',()=>{
 const result=clean();
 assert.ok(audit(result.bytes,{uids:result.uids,pixelLength:99}).some(p=>p.includes('píxeles')));
});
test('Implicit VR Little Endian se reescribe y sigue leyéndose',()=>{
 const source=dicom({syntax:'1.2.840.10008.1.2'});
 const result=anonymize(source,UIDS);
 const ds=read(result.bytes);
 assert.equal(text(ds,'x00020010'),'1.2.840.10008.1.2');
 assert.equal(text(ds,'x00100010'),'ANONIMO^RECORTE');
 assert.equal(ds.elements.x00291140,undefined);
 assert.equal(ds.elements.x00081110,undefined);
 assert.deepEqual([...parse(result.bytes).data],[...parse(source).data]);
 assert.deepEqual(audit(result.bytes,{uids:result.uids,pixelLength:result.pixelLength}),[]);
});
test('En implícito el UID ajeno se reconoce por su forma',()=>
 assert.equal(read(anonymize(dicom({syntax:'1.2.840.10008.1.2'}),UIDS).bytes).elements.x00080014,undefined));
test('Big endian se rechaza por no poder copiar los píxeles',()=>
 assert.throws(()=>describe(dicom({syntax:'1.2.840.10008.1.2.2'})),/Transfer syntax/));
test('Sin SOPClassUID se rechaza',()=>
 assert.throws(()=>anonymize(dicom({skip:['x00080016']}),UIDS),/SOPClassUID/));
test('El visor reconstruye un volumen con los cortes anonimizados',()=>{
 const slices=[0,2,4].map((z,i)=>parse(anonymize(dicom({z,instance:i+1}),{...UIDS,instance:i+1}).bytes));
 const volume=build(slices);
 assert.equal(volume.nz,3);
 assert.equal(volume.patientId,'VOLUMINA-ANON-001');
 assert.equal(volume.frame,UIDS.frameUid);
 assert.deepEqual(volume.spacing,[0.7,0.7,2]);
});
test('describe devuelve geometría sin retener los bytes',()=>{
 const info=describe(dicom({z:-274,instance:5}),{projection:true});
 assert.equal(info.z,-274);
 assert.equal(info.instance,5);
 assert.equal(info.modality,'CT');
 assert.deepEqual([info.nx,info.ny],[2,2]);
 assert.equal(info.projection.coronal.length,2);
 assert.deepEqual([...info.projection.coronal],[-9240,-240]);
 assert.deepEqual([...info.projection.sagittal],[-10240,-240]);
 assert.deepEqual([...info.projection.coronalMean],[-10240,-5240]);
 assert.deepEqual([...info.projection.sagittalMean],[-10740,-4740]);
});
test('planSeries ordena por Z y detecta el tramo uniforme más largo',()=>{
 const entries=[0,2,4,6,20,22].map((z,i)=>describe(dicom({z,instance:i+1})));
 const [series]=planSeries(entries);
 assert.equal(series.slices.length,6);
 assert.equal(series.dz,2);
 assert.deepEqual(series.runs,[[0,3],[4,5]]);
 assert.deepEqual(longestRun(series),[0,3]);
});
test('planSeries separa series distintas y avisa por geometría mezclada',()=>{
 const otra=describe(dicom({z:0,extra:[[0x0020,0x000e,'UI','1.3.99.9']],skip:['x0020000e']}));
 const series=planSeries([describe(dicom({z:0})),describe(dicom({z:2})),otra]);
 assert.equal(series.length,2);
 assert.equal(series[0].slices.length,2);
 const mezcla=planSeries([describe(dicom({z:0})),describe(dicom({z:2,extra:[[0x0028,0x0030,'DS','1\\1']],skip:['x00280030']}))]);
 assert.ok(mezcla[0].warnings.length>0);
});
test('exportOrder respeta el InstanceNumber original y cae a Z descendente',()=>{
 const slices=[{instance:3,z:4},{instance:1,z:0},{instance:2,z:2}];
 assert.deepEqual(exportOrder(slices).map(s=>s.instance),[1,2,3]);
 const sin=[{instance:NaN,z:0},{instance:NaN,z:4},{instance:NaN,z:2}];
 assert.deepEqual(exportOrder(sin).map(s=>s.z),[4,2,0]);
});
console.log(`\n${passed} pruebas correctas`);
