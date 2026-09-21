// Local read-only DICOM format audit. Does not print patient attributes or UIDs.
const fs=require('node:fs'),path=require('node:path');
globalThis.dicomParser=require('./vendor/dicomParser.min.js');require('./core.js');
const dir=process.argv[2];if(!dir)throw Error('Provide a local DICOM directory');
const files=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>path.join(dir,e.name));
const groups=new Map();
for(const file of files){
 const bytes=new Uint8Array(fs.readFileSync(file));let ds;try{ds=dicomParser.parseDicom(bytes);}catch{console.log(JSON.stringify({file:path.basename(file),error:'Cannot parse DICOM'}));continue;}
 const uid=ds.string('x0020000e')||'missing';if(!groups.has(uid))groups.set(uid,{files:0,formats:new Map(),slices:[],errors:new Map()});const g=groups.get(uid);g.files++;
 const fields={};for(const [name,tag] of Object.entries({syntax:'x00020010',sopClass:'x00080016',modality:'x00080060',imageType:'x00080008',manufacturer:'x00080070',frames:'x00280008',orientation:'x00200037',spacing:'x00280030',sliceSpacing:'x00180088',slope:'x00281053',intercept:'x00281052',units:'x00541001'}))fields[name]=ds.string(tag)||null;
 for(const [name,tag] of Object.entries({rows:'x00280010',cols:'x00280011',bits:'x00280100',stored:'x00280101',high:'x00280102',signed:'x00280103'}))fields[name]=ds.uint16(tag);
 fields.positionPresent=!!ds.string('x00200032');fields.frameReferencePresent=!!ds.string('x00200052');fields.detectorItems=ds.elements.x00540022?.items?.length||0;
 fields.realWorldMapping=!!ds.elements.x00409096;fields.sharedFunctionalGroups=!!ds.elements.x52009229;fields.perFrameFunctionalGroups=ds.elements.x52009230?.items?.length||0;
 const key=JSON.stringify(fields);g.formats.set(key,(g.formats.get(key)||0)+1);
 try{g.slices.push(...VolumeCore.parseFrames(bytes));}catch(e){g.errors.set(e.message,(g.errors.get(e.message)||0)+1);}
}
let n=0;for(const g of groups.values()){
 const report={series:++n,files:g.files,formats:[...g.formats].map(([k,count])=>({count,...JSON.parse(k)})),readerErrors:Object.fromEntries(g.errors)};
 if(g.slices.length&&!g.errors.size)try{const v=VolumeCore.build(g.slices);let min=Infinity,max=-Infinity;for(const x of v.data){min=Math.min(min,x);max=Math.max(max,x);}report.volume={dimensions:[v.nx,v.ny,v.nz],spacing:v.spacing,range:[min,max],units:v.units,functionalImportEligible:VolumeCore.isFunctional(v),finite:v.data.every(Number.isFinite)};}catch(e){report.buildError=e.message;}
 console.log(JSON.stringify(report,null,2));
}
