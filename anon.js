/* Recorte en Z y desidentificación de series axiales. Los píxeles se copian byte a byte:
   solo cambian identificación, fechas y UID, así que las HU se conservan exactas.
   Perfil de lista negra (PS3.15 anexo E) + eliminación de todo tag privado y de todo UID
   ajeno. Sin acceso a la red. */
(function(root){
'use strict';
const IMPLEMENTATION='2.25.269471321149657141056372201054218977939';
// Solo little endian sin comprimir: los píxeles se copian sin recodificar.
const NATIVE={'1.2.840.10008.1.2':false,'1.2.840.10008.1.2.1':true};
const LONG=['OB','OW','OF','SQ','UT','UN'];
const TEXT=['AE','AS','CS','DA','DS','DT','IS','LO','LT','PN','SH','ST','TM','UC','UI','UR','UT','UN'];
const encoder=new root.TextEncoder();

const IDENTITY={name:'ANONIMO^RECORTE',id:'VOLUMINA-ANON-001',issuer:'Volumina-anon',
 date:'20260101',time:'120000.000000',
 method:'Recorte Z + desidentificacion local; UID regenerados',
 studyDescription:'ESTUDIO ANONIMIZADO',seriesDescription:'Serie recortada y anonimizada'};

/* Tags que se eliminan por completo (acción X del perfil básico). */
const DROP={
 x00080014:'InstanceCreatorUID',x00080015:'InstanceCoercionDateTime',
 x00080080:'InstitutionName',x00080081:'InstitutionAddress',x00080082:'InstitutionCodeSequence',
 x00080092:'ReferringPhysicianAddress',x00080094:'ReferringPhysicianTelephoneNumbers',
 x00080096:'ReferringPhysicianIdentificationSequence',
 x00081010:'StationName',x00081032:'ProcedureCodeSequence',x00081040:'InstitutionalDepartmentName',
 x00081048:'PhysiciansOfRecord',x00081049:'PhysiciansOfRecordIdentificationSequence',
 x00081050:'PerformingPhysicianName',x00081052:'PerformingPhysicianIdentificationSequence',
 x00081060:'NameOfPhysiciansReadingStudy',x00081062:'PhysiciansReadingStudyIdentificationSequence',
 x00081070:'OperatorsName',x00081072:'OperatorIdentificationSequence',
 x00081080:'AdmittingDiagnosesDescription',x00081084:'AdmittingDiagnosesCodeSequence',
 x00081110:'ReferencedStudySequence',x00081111:'ReferencedPerformedProcedureStepSequence',
 x00081120:'ReferencedPatientSequence',x00081140:'ReferencedImageSequence',
 x00082111:'DerivationDescription',x00082112:'SourceImageSequence',x00084000:'IdentifyingComments',
 x00100024:'IssuerOfPatientIDQualifiersSequence',x00100032:'PatientBirthTime',
 x00100050:'PatientInsurancePlanCodeSequence',x00101000:'OtherPatientIDs',x00101001:'OtherPatientNames',
 x00101002:'OtherPatientIDsSequence',x00101005:'PatientBirthName',x00101010:'PatientAge',
 x00101020:'PatientSize',x00101030:'PatientWeight',x00101040:'PatientAddress',
 x00101060:'PatientMotherBirthName',x00101080:'MilitaryRank',x00101081:'BranchOfService',
 x00101090:'MedicalRecordLocator',x00102000:'MedicalAlerts',x00102110:'Allergies',
 x00102150:'CountryOfResidence',x00102152:'RegionOfResidence',x00102154:'PatientTelephoneNumbers',
 x00102160:'EthnicGroup',x00102180:'Occupation',x001021a0:'SmokingStatus',
 x001021b0:'AdditionalPatientHistory',x001021c0:'PregnancyStatus',x001021d0:'LastMenstrualDate',
 x001021f0:'PatientReligiousPreference',x00104000:'PatientComments',
 x00181000:'DeviceSerialNumber',x00181002:'DeviceUID',x00181004:'PlateID',x00184000:'AcquisitionComments',
 x00204000:'ImageComments',x00209158:'FrameComments',
 x0032000a:'StudyStatusID',x0032000c:'StudyPriorityID',x00321030:'ReasonForStudy',
 x00321032:'RequestingPhysician',x00321033:'RequestingService',x00321060:'RequestedProcedureDescription',
 x00321064:'RequestedProcedureCodeSequence',x00324000:'StudyComments',
 x00380010:'AdmissionID',x00380011:'IssuerOfAdmissionID',x00380020:'AdmittingDate',
 x00380021:'AdmittingTime',x00380040:'DischargeDiagnosisDescription',x00380050:'SpecialNeeds',
 x00380060:'ServiceEpisodeID',x00380062:'ServiceEpisodeDescription',x00380300:'CurrentPatientLocation',
 x00380400:'PatientInstitutionResidence',x00380500:'PatientState',x00384000:'VisitComments',
 x00400001:'ScheduledStationAETitle',x00400002:'ScheduledProcedureStepStartDate',
 x00400003:'ScheduledProcedureStepStartTime',x00400004:'ScheduledProcedureStepEndDate',
 x00400005:'ScheduledProcedureStepEndTime',x00400006:'ScheduledPerformingPhysicianName',
 x00400007:'ScheduledProcedureStepDescription',x00400009:'ScheduledProcedureStepID',
 x00400010:'ScheduledStationName',x00400011:'ScheduledProcedureStepLocation',x00400012:'PreMedication',
 x00400241:'PerformedStationAETitle',x00400242:'PerformedStationName',x00400243:'PerformedLocation',
 x00400244:'PerformedProcedureStepStartDate',x00400245:'PerformedProcedureStepStartTime',
 x00400250:'PerformedProcedureStepEndDate',x00400251:'PerformedProcedureStepEndTime',
 x00400253:'PerformedProcedureStepID',x00400254:'PerformedProcedureStepDescription',
 x00400255:'PerformedProcedureTypeDescription',x00400260:'PerformedProtocolCodeSequence',
 x00400275:'RequestAttributesSequence',x00400280:'CommentsOnThePerformedProcedureStep',
 x00401001:'RequestedProcedureID',x00401002:'ReasonForTheRequestedProcedure',
 x00401004:'PatientTransportArrangements',x00401005:'RequestedProcedureLocation',
 x00401400:'RequestedProcedureComments',x00402001:'ReasonForTheImagingServiceRequest',
 x00402004:'IssueDateOfImagingServiceRequest',x00402005:'IssueTimeOfImagingServiceRequest',
 x00402008:'OrderEnteredBy',x00402009:'OrderEntererLocation',x00402010:'OrderCallbackPhoneNumber',
 x00402016:'PlacerOrderNumberImagingServiceRequest',x00402017:'FillerOrderNumberImagingServiceRequest',
 x00402400:'ImagingServiceRequestComments',x00403001:'ConfidentialityConstraintOnPatientDataDescription',
 x0040a123:'PersonName',x00700084:'ContentCreatorName',x00880200:'IconImageSequence'};

/* Nombres de tags que no se eliminan por la lista pero aparecen en los informes. */
const EXTRA_NAMES={x00083010:'IrradiationEventUID',x00080015:'InstanceCoercionDateTime',
 x00120010:'ClinicalTrialSponsorName',x00120020:'ClinicalTrialProtocolID',
 x00120030:'ClinicalTrialSiteID',x00120040:'ClinicalTrialSubjectID',
 x00200200:'SynchronizationFrameOfReferenceUID',x00880140:'StorageMediaFileSetUID',
 x04000561:'OriginalAttributesSequence'};

/* Tipo 2: el tag queda presente pero vacío. */
const CLEAR={x00080050:'AccessionNumber',x00080090:'ReferringPhysicianName',
 x00100030:'PatientBirthDate',x00200010:'StudyID'};

/* Fechas y horas que se aplanan al valor fijo. */
const WHEN={x00080012:'DA',x00080013:'TM',x00080020:'DA',x00080021:'DA',x00080022:'DA',x00080023:'DA',
 x0008002a:'DT',x00080030:'TM',x00080031:'TM',x00080032:'TM',x00080033:'TM',
 x00181012:'DA',x00181014:'TM',x00181200:'DA',x00181201:'TM'};
const WHEN_ALWAYS=['x00080020','x00080030','x00080023','x00080033'];

const NAMES={x00080018:'SOPInstanceUID',x0020000d:'StudyInstanceUID',x0020000e:'SeriesInstanceUID',
 x00200052:'FrameOfReferenceUID',x00100010:'PatientName',x00100020:'PatientID',
 x00100021:'IssuerOfPatientID',x00120062:'PatientIdentityRemoved',x00120063:'DeidentificationMethod',
 x00081030:'StudyDescription',x0008103e:'SeriesDescription',x00200013:'InstanceNumber',
 x00080012:'InstanceCreationDate',x00080013:'InstanceCreationTime',x00080020:'StudyDate',
 x00080021:'SeriesDate',x00080022:'AcquisitionDate',x00080023:'ContentDate',x0008002a:'AcquisitionDateTime',
 x00080030:'StudyTime',x00080031:'SeriesTime',x00080032:'AcquisitionTime',x00080033:'ContentTime',
 x00181012:'DateOfSecondaryCapture',x00181014:'TimeOfSecondaryCapture',
 x00181200:'DateOfLastCalibration',x00181201:'TimeOfLastCalibration',...EXTRA_NAMES,...DROP,...CLEAR};

// Grupos completos que nunca salen: ensayos clínicos, firmas digitales, curvas y overlays.
function dropGroup(group){
 return group===0x0012||group===0x0400||(group>=0x5000&&group<=0x50ff)||(group>=0x6000&&group<=0x60ff);
}
const KEEP_IN_0012=['x00120062','x00120063'];
const tagOf=key=>[parseInt(key.slice(1,5),16),parseInt(key.slice(5,9),16)];
const nameOf=key=>NAMES[key]||key;
const isUidText=text=>/^[0-9]+(\.[0-9]+){3,}$/.test(text)&&text.length>=12;
const foreign=(value,allowed)=>!!value&&!value.startsWith('1.2.840.10008')&&!allowed.has(value);

function encode(vr,value){
 if(value instanceof Uint8Array)return value;
 if(vr==='US'||vr==='UL'){const body=new Uint8Array(vr==='US'?2:4),view=new DataView(body.buffer);
  if(vr==='US')view.setUint16(0,value,true);else view.setUint32(0,value,true);return body;}
 return encoder.encode(String(value));
}
function element(group,number,vr,value,explicit){
 let body=encode(vr,value);
 if(body.length%2){const padded=new Uint8Array(body.length+1);padded.set(body);
  padded[body.length]=vr==='UI'||vr==='OB'||vr==='OW'?0:32;body=padded;}
 const long=explicit&&LONG.includes(vr),size=explicit?(long?12:8):8;
 const header=new Uint8Array(size),view=new DataView(header.buffer);
 view.setUint16(0,group,true);view.setUint16(2,number,true);
 if(!explicit)view.setUint32(4,body.length,true);
 else{header[4]=vr.charCodeAt(0);header[5]=vr.charCodeAt(1);
  if(long)view.setUint32(8,body.length,true);
  else{if(body.length>0xfffe)throw Error('Valor demasiado largo para VR corto: '+vr);view.setUint16(6,body.length,true);}}
 const out=new Uint8Array(size+body.length);out.set(header);out.set(body,size);
 return out;
}
function concat(parts){
 let total=0;for(const p of parts)total+=p.length;
 const out=new Uint8Array(total);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}
 return out;
}
/* Un valor corto de texto que contiene un UID ajeno. En explícito manda el VR; en implícito
   no hay VR, así que se reconoce el UID por su forma. */
function suspect(dataSet,key,item,vr,allowed){
 if(item.items||item.length===0||item.length>64)return false;
 if(vr&&!TEXT.includes(vr))return false;
 const value=(dataSet.string(key)||'').trim();
 if(!value)return false;
 if(vr==='UI')return foreign(value,allowed);
 return isUidText(value)&&foreign(value,allowed);
}
// Una secuencia se elimina entera si arrastra identificación, fechas, tags privados o UID ajenos.
function tainted(sequence,allowed,taint){
 for(const entry of sequence.items||[]){
  const inner=entry.dataSet;if(!inner)continue;
  for(const key of Object.keys(inner.elements)){
   const child=inner.elements[key],group=tagOf(key)[0];
   if(group%2===1||dropGroup(group)||taint.has(key))return true;
   if(child.items){if(tainted(child,allowed,taint))return true;}
   else if(suspect(inner,key,child,child.vr,allowed))return true;
  }
 }
 return false;
}
function anonymize(bytes,options={}){
 const ds=root.dicomParser.parseDicom(bytes),str=t=>(ds.string(t)||'').trim();
 const syntax=str('x00020010');
 if(!(syntax in NATIVE))throw Error('Transfer syntax no admitida: se requiere little endian sin comprimir');
 const explicit=NATIVE[syntax],sopClass=str('x00080016');
 if(!sopClass)throw Error('SOPClassUID ausente');
 if(!ds.elements.x7fe00010)throw Error('Sin píxeles de imagen');
 const identity={...IDENTITY,...options.identity};
 const uids={study:options.studyUid||root.DicomWrite.uid(),series:options.seriesUid||root.DicomWrite.uid(),
  frame:options.frameUid||root.DicomWrite.uid(),sop:options.sopUid||root.DicomWrite.uid()};
 const allowed=new Set([...Object.values(uids),IMPLEMENTATION]);
 const replace=new Map([
  ['x00080018',['UI',uids.sop]],['x0020000d',['UI',uids.study]],['x0020000e',['UI',uids.series]],
  ['x00200052',['UI',uids.frame]],
  ['x00100010',['PN',identity.name]],['x00100020',['LO',identity.id]],['x00100021',['LO',identity.issuer]],
  ['x00120062',['CS','YES']],['x00120063',['LO',identity.method]],
  ['x00081030',['LO',identity.studyDescription]],['x0008103e',['LO',identity.seriesDescription]]
 ]);
 for(const key of Object.keys(WHEN)){
  if(!ds.elements[key]&&!WHEN_ALWAYS.includes(key))continue;
  const vr=WHEN[key];
  replace.set(key,[vr,vr==='DA'?identity.date:vr==='TM'?identity.time:identity.date+identity.time]);
 }
 if(Number.isFinite(options.instance))replace.set('x00200013',['IS',String(options.instance)]);
 const taint=new Set([...Object.keys(DROP),...Object.keys(CLEAR),...replace.keys()]);
 const rows=[],pending=new Set(replace.keys()),report={removed:[],cleared:[],replaced:[],warnings:[]};
 let privates=0,overlays=0;
 for(const key of Object.keys(ds.elements).sort()){
  const item=ds.elements[key],[group,number]=tagOf(key);
  if(group===0x0002||number===0x0000||group===0xfffc)continue;
  if(group%2===1){privates++;continue;}
  if(replace.has(key)){const row=replace.get(key);rows.push([group,number,row[0],row[1]]);
   pending.delete(key);report.replaced.push(nameOf(key));continue;}
  if(dropGroup(group)&&!KEEP_IN_0012.includes(key)){
   if(group>=0x5000)overlays++;else report.removed.push(nameOf(key));
   continue;}
  if(key in DROP){report.removed.push(nameOf(key));continue;}
  const vr=item.vr||'UN';
  if(key in CLEAR){rows.push([group,number,vr,new Uint8Array(0)]);report.cleared.push(nameOf(key));continue;}
  if(item.items){if(tainted(item,allowed,taint)){report.removed.push(nameOf(key)+' · secuencia con identificadores');continue;}}
  else if(suspect(ds,key,item,item.vr,allowed)){report.removed.push(nameOf(key)+' · UID ajeno');continue;}
  if(key==='x00280301'&&(ds.string(key)||'').trim().toUpperCase()==='YES')
   report.warnings.push('La imagen declara texto grabado en los píxeles (BurnedInAnnotation = YES)');
  rows.push([group,number,vr,bytes.subarray(item.dataOffset,item.dataOffset+item.length)]);
 }
 for(const key of pending){
  const row=replace.get(key),[group,number]=tagOf(key);
  rows.push([group,number,row[0],row[1]]);report.replaced.push(nameOf(key));
 }
 if(privates)report.removed.push(`Tags privados (${privates})`);
 if(overlays)report.removed.push(`Overlays y curvas (${overlays})`);
 report.privates=privates;report.overlays=overlays;
 rows.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const body=concat(rows.map(r=>element(r[0],r[1],r[2],r[3],explicit)));
 const metaBody=concat([
  element(0x0002,0x0001,'OB',Uint8Array.from([0,1]),true),
  element(0x0002,0x0002,'UI',sopClass,true),element(0x0002,0x0003,'UI',uids.sop,true),
  element(0x0002,0x0010,'UI',syntax,true),element(0x0002,0x0012,'UI',IMPLEMENTATION,true),
  element(0x0002,0x0013,'SH','VOLUMINA',true)]);
 const preamble=new Uint8Array(132);preamble.set(encoder.encode('DICM'),128);
 report.replaced.sort();report.removed.sort();report.cleared.sort();
 return {bytes:concat([preamble,element(0x0002,0x0000,'UL',metaBody.length,true),metaBody,body]),
  report,uids,identity,pixelLength:ds.elements.x7fe00010.length};
}
/* Relee el archivo escrito y busca fugas. Devuelve la lista de problemas; vacía es correcto. */
function audit(bytes,expected={}){
 const problems=[],ds=root.dicomParser.parseDicom(bytes),str=t=>(ds.string(t)||'').trim();
 const identity={...IDENTITY,...expected.identity},allowed=new Set([...Object.values(expected.uids||{}),IMPLEMENTATION]);
 if(str('x00100010')!==identity.name)problems.push('PatientName no coincide con la identidad de recambio');
 if(str('x00100020')!==identity.id)problems.push('PatientID no coincide con la identidad de recambio');
 if(str('x00120062')!=='YES')problems.push('Falta PatientIdentityRemoved = YES');
 if(str('x00080020')!==identity.date)problems.push('StudyDate sin aplanar');
 const walk=(dataSet,path)=>{
  for(const key of Object.keys(dataSet.elements)){
   const item=dataSet.elements[key],[group]=tagOf(key);
   if(group===0x0002)continue;
   if(group%2===1)problems.push('Tag privado presente: '+path+key);
   if(dropGroup(group)&&!KEEP_IN_0012.includes(key))problems.push('Grupo excluido presente: '+path+key);
   if(key in DROP)problems.push('Tag identificatorio presente: '+path+nameOf(key));
   if(item.items){for(const entry of item.items)if(entry.dataSet)walk(entry.dataSet,path+key+'/');continue;}
   if(suspect(dataSet,key,item,item.vr,allowed))problems.push('UID ajeno en '+path+nameOf(key));
  }
 };
 walk(ds,'');
 if(Number.isFinite(expected.pixelLength)&&ds.elements.x7fe00010&&ds.elements.x7fe00010.length!==expected.pixelLength)
  problems.push('Los píxeles no conservan su longitud original');
 return problems;
}
/* Lee un archivo y devuelve solo datos independientes de sus bytes: nada retiene el archivo. */
function describe(bytes,options={}){
 const slice=root.VolumeCore.parse(bytes);
 if(!(slice.syntax in NATIVE))throw Error('Transfer syntax no admitida para reescribir: '+slice.syntax);
 const info={uid:slice.uid,studyUid:slice.studyUid,frame:slice.frame,modality:slice.modality,
  sopClass:slice.sopClass,syntax:slice.syntax,nx:slice.nx,ny:slice.ny,spacing:slice.spacing,
  position:slice.position,z:slice.position[2],description:slice.description,
  seriesNumber:slice.seriesNumber,thickness:Number(slice.thickness),burned:slice.burned,
  instance:Number(slice.instance),window:slice.window,level:slice.level,bytes:bytes.length};
 if(options.projection){
  const data=slice.data,nx=slice.nx,ny=slice.ny;
  const coronal=new Float32Array(nx).fill(-Infinity),sagittal=new Float32Array(ny).fill(-Infinity);
  const coronalSum=new Float64Array(nx),sagittalSum=new Float64Array(ny);
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   const value=data[x+nx*y];
   if(value>coronal[x])coronal[x]=value;
   if(value>sagittal[y])sagittal[y]=value;
   coronalSum[x]+=value;sagittalSum[y]+=value;
  }
  info.projection={coronal,sagittal,
   coronalMean:Float32Array.from(coronalSum,sum=>sum/ny),
   sagittalMean:Float32Array.from(sagittalSum,sum=>sum/nx)};
 }
 return info;
}
/* Agrupa por serie, ordena por Z y marca los tramos de espaciado uniforme. */
function planSeries(entries){
 const groups=new Map();
 for(const info of entries){
  if(!groups.has(info.uid))groups.set(info.uid,[]);
  groups.get(info.uid).push(info);
 }
 const series=[];
 for(const [uid,list] of groups){
  const slices=[...list].sort((a,b)=>a.z-b.z),first=slices[0],warnings=[];
  for(const info of slices){
   if(info.nx!==first.nx||info.ny!==first.ny||info.spacing.some((v,i)=>Math.abs(v-first.spacing[i])>1e-4))
    warnings.push('La serie mezcla matrices o espaciados distintos');
   else if(info.position.slice(0,2).some((v,i)=>Math.abs(v-first.position[i])>0.01))
    warnings.push('La serie tiene cortes desplazados en el plano o gantry tilt');
   if(info.syntax!==first.syntax)warnings.push('La serie mezcla transfer syntax distintas');
   if(String(info.burned).toUpperCase()==='YES')warnings.push('Algún corte declara texto grabado en los píxeles');
  }
  const gaps=slices.slice(1).map((info,i)=>info.z-slices[i].z);
  const sorted=[...gaps].sort((a,b)=>a-b),dz=sorted.length?sorted[Math.floor(sorted.length/2)]:0;
  const tolerance=Math.max(.01,Math.abs(dz)*.01),runs=[];
  let start=0;
  for(let i=0;i<gaps.length;i++)if(Math.abs(gaps[i]-dz)>tolerance){runs.push([start,i]);start=i+1;}
  runs.push([start,slices.length-1]);
  series.push({uid,slices,dz,runs,warnings:[...new Set(warnings)],
   description:first.description,modality:first.modality,seriesNumber:first.seriesNumber,
   nx:first.nx,ny:first.ny,spacing:first.spacing});
 }
 return series.sort((a,b)=>b.slices.length-a.slices.length);
}
/* El tramo uniforme más largo, que es el que acepta el visor. */
function longestRun(series){
 return series.runs.reduce((best,run)=>run[1]-run[0]>best[1]-best[0]?run:best,series.runs[0]||[0,0]);
}
/* Orden de escritura: el original de la serie si InstanceNumber es completo y único. */
function exportOrder(slices){
 const numbers=slices.map(info=>info.instance);
 if(numbers.every(Number.isFinite)&&new Set(numbers).size===numbers.length)
  return [...slices].sort((a,b)=>a.instance-b.instance);
 return [...slices].sort((a,b)=>b.z-a.z);
}
root.DicomAnon={anonymize,audit,describe,planSeries,longestRun,exportOrder,element,concat,
 IDENTITY,DROP,CLEAR,WHEN,NATIVE,IMPLEMENTATION,nameOf,dropGroup};
})(typeof window!=='undefined'?window:globalThis);
